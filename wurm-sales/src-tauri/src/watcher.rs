use crate::app_settings::SharedSettings;
use crate::skill_sessions::{SharedSkillSessions, SkillSessionData};
use crate::trade_entries::{truncate_entries, SharedTradeEntries, TradeEntry};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct DirectoryWatcher {
    app_handle: AppHandle,
    skill_sessions: SharedSkillSessions,
    settings: SharedSettings,
    trade_entries: SharedTradeEntries,
    poll_interval: Duration,
}

impl DirectoryWatcher {
    pub fn new(
        app_handle: AppHandle,
        settings: SharedSettings,
        skill_sessions: SharedSkillSessions,
        trade_entries: SharedTradeEntries,
    ) -> Self {
        Self {
            app_handle,
            skill_sessions,
            settings,
            trade_entries,
            poll_interval: Duration::from_millis(500),
        }
    }

    pub fn start(self) {
        thread::spawn(move || self.run());
    }

    fn run(self) {
        let DirectoryWatcher {
            app_handle,
            skill_sessions,
            settings,
            trade_entries,
            poll_interval,
        } = self;

        let mut file_line_counts: HashMap<String, usize> = HashMap::new();
        let mut active_watch_dir = String::new();
        let mut logged_read_failures: HashSet<String> = HashSet::new();

        loop {
            let current_watch_dir = match settings.lock() {
                Ok(guard) => guard.watch_dir.clone(),
                Err(err) => {
                    println!(
                        "Failed to lock settings ({}); reusing previous watch directory",
                        err
                    );
                    active_watch_dir.clone()
                }
            };

            if current_watch_dir.trim().is_empty() {
                if !active_watch_dir.is_empty() {
                    println!("Watch directory cleared; resetting state");
                    active_watch_dir.clear();
                    file_line_counts.clear();
                    logged_read_failures.clear();
                    if let Ok(mut sessions) = skill_sessions.lock() {
                        sessions.clear();
                    }
                    if let Err(err) = app_handle.emit("skill-sessions", Vec::<SkillSessionData>::new()) {
                        println!("Failed to emit skill session reset: {:?}", err);
                    }
                    if let Err(err) = app_handle.emit("trade-entries", Vec::<TradeEntry>::new()) {
                        println!("Failed to emit trade entry reset: {:?}", err);
                    }
                }
                thread::sleep(poll_interval);
                continue;
            }

            if active_watch_dir != current_watch_dir {
                println!("Switching watch directory to {}", current_watch_dir);
                active_watch_dir = current_watch_dir.clone();
                file_line_counts.clear();
                logged_read_failures.clear();

                if let Err(err) = Self::prime_directory_cache(
                    &active_watch_dir,
                    &mut file_line_counts,
                    &mut logged_read_failures,
                ) {
                    println!(
                        "Failed to read watch directory {}: {}",
                        active_watch_dir, err
                    );
                    thread::sleep(Duration::from_millis(1000));
                    continue;
                }

                if let Ok(mut sessions) = skill_sessions.lock() {
                    sessions.clear();
                }
                if let Err(err) = app_handle.emit("skill-sessions", Vec::<SkillSessionData>::new()) {
                    println!("Failed to emit skill session reset: {:?}", err);
                }
                if let Ok(mut trades) = trade_entries.lock() {
                    trades.clear();
                }
                if let Err(err) = app_handle.emit("trade-entries", Vec::<TradeEntry>::new()) {
                    println!("Failed to emit trade entry reset: {:?}", err);
                }
            }

            if active_watch_dir.is_empty() {
                thread::sleep(poll_interval);
                continue;
            }

            if let Err(err) = Self::scan_directory(
                &app_handle,
                &skill_sessions,
                &trade_entries,
                &active_watch_dir,
                &mut file_line_counts,
                &mut logged_read_failures,
            ) {
                println!(
                    "Failed to read watch directory {}: {}",
                    active_watch_dir, err
                );
                thread::sleep(Duration::from_millis(1000));
                continue;
            }

            thread::sleep(poll_interval);
        }
    }

    fn prime_directory_cache(
        watch_dir: &str,
        file_line_counts: &mut HashMap<String, usize>,
        logged_read_failures: &mut HashSet<String>,
    ) -> Result<(), String> {
        let entries = fs::read_dir(watch_dir).map_err(|err| err.to_string())?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let path_str = path.to_string_lossy().to_string();
                match read_file_contents(&path) {
                    Ok(content) => {
                        logged_read_failures.remove(&path_str);
                        let line_count = content.lines().count();
                        file_line_counts.insert(path_str, line_count);
                    }
                    Err(err) => {
                        if logged_read_failures.insert(path_str.clone()) {
                            println!("Failed to read file {:?}: {}", path, err);
                        }
                    }
                }
            }
        }

        println!("Initial scan complete for {}", watch_dir);
        Ok(())
    }

    fn scan_directory(
        app_handle: &AppHandle,
        skill_sessions: &SharedSkillSessions,
        trade_entries: &SharedTradeEntries,
        watch_dir: &str,
        file_line_counts: &mut HashMap<String, usize>,
        logged_read_failures: &mut HashSet<String>,
    ) -> Result<(), String> {
        let entries = fs::read_dir(watch_dir).map_err(|err| err.to_string())?;

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let path_str = path.to_string_lossy().to_string();
            let content = match read_file_contents(&path) {
                Ok(data) => {
                    logged_read_failures.remove(&path_str);
                    data
                }
                Err(err) => {
                    if logged_read_failures.insert(path_str.clone()) {
                        println!("Failed to read file {:?}: {}", path, err);
                    }
                    continue;
                }
            };
            let chat_type = get_chat_type(&path_str);

            let lines: Vec<&str> = content.lines().collect();
            let total_lines = lines.len();

            let previous_count = file_line_counts.get(&path_str).copied();

            let new_lines_start = match previous_count {
                Some(count) if count <= total_lines => count,
                Some(_) => total_lines.saturating_sub(1),
                None => total_lines.saturating_sub(1),
            };

            if new_lines_start < total_lines {
                for line in &lines[new_lines_start..] {
                    let trimmed_line = line.trim();
                    if trimmed_line.is_empty() {
                        continue;
                    }

                    Self::handle_file_change(
                        app_handle,
                        skill_sessions,
                        trade_entries,
                        &path_str,
                        &chat_type,
                        trimmed_line,
                    );
                }
            }

            file_line_counts.insert(path_str, total_lines);
        }

        Ok(())
    }

    fn handle_file_change(
        app_handle: &AppHandle,
        skill_sessions: &SharedSkillSessions,
        trade_entries: &SharedTradeEntries,
        path: &str,
        chat_type: &str,
        last_line: &str,
    ) {
        println!("--- FILE CHANGED --- {}: {}", chat_type, last_line);

        Self::handle_skill_gain(app_handle, skill_sessions, last_line);
        Self::handle_trade_message(app_handle, trade_entries, last_line);
        Self::emit_file_change(app_handle, path, chat_type, last_line);
    }

    fn handle_skill_gain(
        app_handle: &AppHandle,
        skill_sessions: &SharedSkillSessions,
        last_line: &str,
    ) {
        if let Some((skill_name, gain, current_level)) = parse_skill_gain(last_line) {
            if let Ok(mut sessions) = skill_sessions.lock() {
                let entry = sessions
                    .entry(skill_name.clone())
                    .or_insert_with(|| SkillSessionData {
                        skill_name: skill_name.clone(),
                        start_level: current_level - gain,
                        session_gain: 0.0,
                        last_gain: 0.0,
                    });

                entry.session_gain = current_level - entry.start_level;
                entry.last_gain = gain;

                println!(
                    "--- SKILL GAIN --- {}: +{:.4} (session: +{:.4})",
                    skill_name,
                    gain,
                    entry.session_gain
                );

                let session_data_vec: Vec<SkillSessionData> = sessions.values().cloned().collect();
                drop(sessions);

                if let Err(err) = app_handle.emit("skill-sessions", session_data_vec.clone()) {
                    println!(
                        "Failed to emit skill sessions to main window: {:?}",
                        err
                    );
                }
                if let Err(err) = app_handle.emit_to("skills", "skill-sessions", session_data_vec) {
                    if !matches!(err, tauri::Error::WebviewNotFound) {
                        println!(
                            "Failed to emit skill sessions to skills window: {:?}",
                            err
                        );
                    }
                }
            }
        }
    }

    fn emit_file_change(app_handle: &AppHandle, path: &str, chat_type: &str, last_line: &str) {
        if let Err(err) = app_handle.emit(
            "file-changed",
            FileChangeEvent {
                path: path.to_string(),
                line: last_line.to_string(),
                chat_type: chat_type.to_string(),
            },
        ) {
            println!("Failed to emit file change event: {:?}", err);
        }
    }

    fn handle_trade_message(
        app_handle: &AppHandle,
        trade_entries: &SharedTradeEntries,
        line: &str,
    ) {
        if let Some(entry) = parse_trade_entry(line) {
            if let Ok(mut entries) = trade_entries.lock() {
                entries.push(entry.clone());
                truncate_entries(&mut entries, 200);
                let snapshot = entries.clone();
                drop(entries);

                if let Err(err) = app_handle.emit("trade-entries", snapshot) {
                    println!("Failed to emit trade entries: {:?}", err);
                }
            }
        }
    }
}

#[derive(Clone, Serialize)]
struct FileChangeEvent {
    path: String,
    line: String,
    chat_type: String,
}

fn get_chat_type(path_str: &str) -> String {
    if let Some(filename) = Path::new(path_str).file_name() {
        if let Some(filename_str) = filename.to_str() {
            if filename_str.starts_with('_') {
                if let Some(dot_pos) = filename_str.find('.') {
                    return filename_str[1..dot_pos].to_string();
                }
            }

            let filename_upper = filename_str.to_ascii_uppercase();

            if filename_upper.contains("GL-FREEDOM") {
                return "GL-Freedom".to_string();
            }

            if filename_upper.contains("CA_HELP") {
                return "CA-Help".to_string();
            }

            if filename_upper.contains("TRADE") {
                return "Trade".to_string();
            }

            if filename_upper.contains("PM__") {
                return "PM".to_string();
            }
        }
    }
    "unknown".to_string()
}

fn parse_skill_gain(line: &str) -> Option<(String, f64, f64)> {
    if line.contains("increased by") && line.contains("to") {
        let content = if line.starts_with('[') && line.len() > 10 {
            if let Some(timestamp_end) = line.find("] ") {
                &line[timestamp_end + 2..]
            } else {
                line
            }
        } else {
            line
        };

        if let Some(skill_end) = content.find(" increased") {
            let skill_name = content[..skill_end].trim().to_string();

            if let Some(gain_start) = content.find("by ") {
                if let Some(gain_end) = content.find(" to") {
                    if let Ok(gain) = content[gain_start + 3..gain_end].trim().parse::<f64>() {
                        if let Some(level_start) = content.find("to ") {
                            if let Ok(current_level) =
                                content[level_start + 3..].trim().parse::<f64>()
                            {
                                return Some((skill_name, gain, current_level));
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

fn read_file_contents(path: &Path) -> Result<String, std::io::Error> {
    let bytes = fs::read(path)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn parse_trade_entry(line: &str) -> Option<TradeEntry> {
    if line.trim().is_empty() {
        return None;
    }

    let (timestamp, message) = if line.starts_with('[') {
        if let Some(idx) = line.find("] ") {
            (line[1..idx].to_string(), line[idx + 2..].trim().to_string())
        } else {
            (String::new(), line.trim().to_string())
        }
    } else {
        (String::new(), line.trim().to_string())
    };

    if message.is_empty() {
        return None;
    }

    let category = classify_trade_message(&message)?;

    Some(TradeEntry {
        category,
        timestamp,
        message,
    })
}

fn classify_trade_message(message: &str) -> Option<String> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.starts_with('@') {
        return Some("PM".to_string());
    }

    let mut cursor = trimmed;

    if cursor.starts_with('<') {
        if let Some(end) = cursor.find('>') {
            cursor = cursor[end + 1..].trim_start();
        }
    }

    if cursor.starts_with('(') {
        if let Some(end) = cursor.find(')') {
            cursor = cursor[end + 1..].trim_start();
        }
    }

    for raw_token in cursor.split_whitespace() {
        if raw_token.is_empty() {
            continue;
        }

        if raw_token.starts_with('@') {
            return Some("PM".to_string());
        }

        let token = raw_token
            .trim_start_matches(|c: char| !c.is_alphanumeric())
            .trim_end_matches(|c: char| !c.is_alphanumeric());

        if token.is_empty() {
            continue;
        }

        let token_upper = token.to_ascii_uppercase();

        for part in token_upper.split('/') {
            match part {
                "WTB" => return Some("WTB".to_string()),
                "WTS" | "WTT" => return Some("WTS".to_string()),
                "PC" => return Some("PC".to_string()),
                _ => {}
            }
        }
    }

    None
}
