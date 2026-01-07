use crate::app_settings::SharedSettings;
use crate::granger::{
    persist as persist_granger, to_vec as granger_to_vec, GrangerAnimal, SharedGrangerEntries,
};
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
    granger_entries: SharedGrangerEntries,
    poll_interval: Duration,
}

impl DirectoryWatcher {
    pub fn new(
        app_handle: AppHandle,
        settings: SharedSettings,
        skill_sessions: SharedSkillSessions,
        trade_entries: SharedTradeEntries,
        granger_entries: SharedGrangerEntries,
    ) -> Self {
        Self {
            app_handle,
            skill_sessions,
            settings,
            trade_entries,
            granger_entries,
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
            granger_entries,
            poll_interval,
        } = self;

        let mut file_line_counts: HashMap<String, usize> = HashMap::new();
        let mut active_watch_dir = String::new();
        let mut logged_read_failures: HashSet<String> = HashSet::new();
        let mut granger_sessions: HashMap<String, PendingGrangerSession> = HashMap::new();

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
                    granger_sessions.clear();
                    if let Ok(mut sessions) = skill_sessions.lock() {
                        sessions.clear();
                    }
                    if let Err(err) =
                        app_handle.emit("skill-sessions", Vec::<SkillSessionData>::new())
                    {
                        println!("Failed to emit skill session reset: {:?}", err);
                    }
                    if let Err(err) = app_handle.emit("trade-entries", Vec::<TradeEntry>::new()) {
                        println!("Failed to emit trade entry reset: {:?}", err);
                    }
                    // Preserve stored Granger data when watch directory is cleared
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
                if let Err(err) = app_handle.emit("skill-sessions", Vec::<SkillSessionData>::new())
                {
                    println!("Failed to emit skill session reset: {:?}", err);
                }
                if let Ok(mut trades) = trade_entries.lock() {
                    trades.clear();
                }
                if let Err(err) = app_handle.emit("trade-entries", Vec::<TradeEntry>::new()) {
                    println!("Failed to emit trade entry reset: {:?}", err);
                }
                // Preserve stored Granger data when switching watch directories
                granger_sessions.clear();
            }

            if active_watch_dir.is_empty() {
                thread::sleep(poll_interval);
                continue;
            }

            if let Err(err) = Self::scan_directory(
                &app_handle,
                &skill_sessions,
                &trade_entries,
                &granger_entries,
                &active_watch_dir,
                &mut file_line_counts,
                &mut logged_read_failures,
                &mut granger_sessions,
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
        granger_entries: &SharedGrangerEntries,
        watch_dir: &str,
        file_line_counts: &mut HashMap<String, usize>,
        logged_read_failures: &mut HashSet<String>,
        granger_sessions: &mut HashMap<String, PendingGrangerSession>,
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
                        granger_entries,
                        granger_sessions,
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
        granger_entries: &SharedGrangerEntries,
        granger_sessions: &mut HashMap<String, PendingGrangerSession>,
        path: &str,
        chat_type: &str,
        last_line: &str,
    ) {
        println!("--- FILE CHANGED --- {}: {}", chat_type, last_line);

        Self::handle_skill_gain(app_handle, skill_sessions, last_line);
        Self::handle_trade_message(app_handle, trade_entries, last_line);
        Self::handle_granger_message(
            app_handle,
            granger_entries,
            granger_sessions,
            path,
            chat_type,
            last_line,
        );
        Self::emit_file_change(app_handle, path, chat_type, last_line);
    }

    fn handle_skill_gain(
        app_handle: &AppHandle,
        skill_sessions: &SharedSkillSessions,
        last_line: &str,
    ) {
        if let Some((skill_name, gain, current_level)) = parse_skill_gain(last_line) {
            if let Ok(mut sessions) = skill_sessions.lock() {
                let entry =
                    sessions
                        .entry(skill_name.clone())
                        .or_insert_with(|| SkillSessionData {
                            skill_name: skill_name.clone(),
                            start_level: current_level - gain,
                            current_level,
                            session_gain: 0.0,
                            last_gain: 0.0,
                        });

                entry.current_level = current_level;
                entry.session_gain = current_level - entry.start_level;
                entry.last_gain = gain;

                println!(
                    "--- SKILL GAIN --- {}: +{:.4} (session: +{:.4})",
                    skill_name, gain, entry.session_gain
                );

                let session_data_vec: Vec<SkillSessionData> = sessions.values().cloned().collect();
                drop(sessions);

                if let Err(err) = app_handle.emit("skill-sessions", session_data_vec.clone()) {
                    println!("Failed to emit skill sessions to main window: {:?}", err);
                }
                if let Err(err) = app_handle.emit_to("skills", "skill-sessions", session_data_vec) {
                    if !matches!(err, tauri::Error::WebviewNotFound) {
                        println!("Failed to emit skill sessions to skills window: {:?}", err);
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

    fn handle_granger_message(
        app_handle: &AppHandle,
        granger_entries: &SharedGrangerEntries,
        granger_sessions: &mut HashMap<String, PendingGrangerSession>,
        path: &str,
        chat_type: &str,
        line: &str,
    ) {
        if !chat_type.eq_ignore_ascii_case("event") {
            return;
        }

        if let Some(session) = PendingGrangerSession::from_smile_line(line) {
            if let Some(previous) = granger_sessions.remove(path) {
                Self::finalize_granger_session(app_handle, granger_entries, previous);
            }
            granger_sessions.insert(path.to_string(), session);
            return;
        }

        if let Some(active) = granger_sessions.get_mut(path) {
            active.absorb_line(line);
            if active.is_ready() {
                if let Some(session) = granger_sessions.remove(path) {
                    Self::finalize_granger_session(app_handle, granger_entries, session);
                }
            }
        }
    }

    fn finalize_granger_session(
        app_handle: &AppHandle,
        granger_entries: &SharedGrangerEntries,
        session: PendingGrangerSession,
    ) {
        if let Some(animal) = session.into_animal() {
            if let Ok(mut entries) = granger_entries.lock() {
                entries.insert(animal.id.clone(), animal.clone());
                if let Err(err) = persist_granger(&entries) {
                    println!("Failed to persist granger data: {}", err);
                }
                let snapshot = granger_to_vec(&entries);
                drop(entries);

                if let Err(err) = app_handle.emit("granger-entries", snapshot.clone()) {
                    println!("Failed to emit granger entries: {:?}", err);
                }
                if let Err(err) = app_handle.emit_to("granger", "granger-entries", snapshot) {
                    if !matches!(err, tauri::Error::WebviewNotFound) {
                        println!(
                            "Failed to emit granger entries to granger window: {:?}",
                            err
                        );
                    }
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

#[derive(Debug, Clone)]
struct PendingGrangerSession {
    timestamp: String,
    name: Option<String>,
    descriptors: Vec<String>,
    age: Option<String>,
    custom_label: Option<String>,
    species: Option<String>,
    settlement: Option<String>,
    caretaker: Option<String>,
    condition: Option<String>,
    traits: Vec<String>,
    trait_points: Option<u32>,
    colour: Option<String>,
    raw_lines: Vec<String>,
}

impl PendingGrangerSession {
    fn from_smile_line(line: &str) -> Option<Self> {
        let timestamp = extract_timestamp(line).unwrap_or_else(|| "".to_string());
        let content = strip_timestamp_prefix(line);

        if !content.starts_with("You smile at") {
            return None;
        }

        let mut remainder = content["You smile at".len()..]
            .trim()
            .trim_end_matches('.')
            .to_string();

        if remainder.is_empty() {
            return None;
        }

        if let Some(stripped) = remainder.strip_prefix("the ") {
            remainder = stripped.to_string();
        }

        let (custom_label, cleaned) = extract_custom_label(&remainder);
        let mut words: Vec<&str> = cleaned.split_whitespace().collect();
        if words.is_empty() {
            return None;
        }

        let name = words.pop().map(|value| value.to_string());
        let mut descriptors: Vec<String> = words
            .into_iter()
            .map(|word| word.trim_matches(',').to_string())
            .filter(|value| !value.is_empty())
            .collect();

        let age = if !descriptors.is_empty() {
            Some(descriptors.remove(0))
        } else {
            None
        };

        Some(Self {
            timestamp,
            name,
            descriptors,
            age,
            custom_label,
            species: None,
            settlement: None,
            caretaker: None,
            condition: None,
            traits: Vec::new(),
            trait_points: None,
            colour: None,
            raw_lines: vec![content.to_string()],
        })
    }

    fn absorb_line(&mut self, line: &str) {
        let content = strip_timestamp_prefix(line);
        self.raw_lines.push(content.to_string());

        if self.species.is_none() && content.contains(" like this one") {
            if let Some(first_word) = content.split_whitespace().next() {
                let species = first_word.trim_matches(|c: char| c == '.' || c == ',');
                if !species.is_empty() {
                    self.species = Some(species.trim_end_matches('.').to_string());
                }
            }
        }

        if self.settlement.is_none() && content.contains("settlement of ") {
            if let Some(after) = content.split("settlement of ").nth(1) {
                let settlement = after.trim().trim_end_matches('.');
                if !settlement.is_empty() {
                    self.settlement = Some(settlement.to_string());
                }
            }
        }

        if self.caretaker.is_none() && content.contains("taken care of by") {
            if let Some(after) = content.split("by ").nth(1) {
                let caretaker = after.trim().trim_end_matches('.');
                if !caretaker.is_empty() {
                    self.caretaker = Some(caretaker.to_string());
                }
            }
        }

        if self.condition.is_none()
            && (content.starts_with("He is")
                || content.starts_with("She is")
                || content.starts_with("It is"))
        {
            if !content.contains("trait points") && !content.contains("colour is") {
                self.condition = Some(content.to_string());
            }
        }

        if content.contains("trait points") {
            if let Some(value) = extract_number(content) {
                self.trait_points = Some(value);
            }
        } else {
            for trait_text in split_trait_sentences(content) {
                if self
                    .traits
                    .iter()
                    .any(|existing| existing.eq_ignore_ascii_case(&trait_text))
                {
                    continue;
                }
                self.traits.push(trait_text);
            }
        }

        if self.colour.is_none() && content.contains("colour is") {
            if let Some(after) = content.split("colour is").nth(1) {
                let colour = after.trim().trim_end_matches('.');
                if !colour.is_empty() {
                    self.colour = Some(colour.to_string());
                }
            }
        }
    }

    fn is_ready(&self) -> bool {
        self.colour.is_some()
    }

    fn into_animal(self) -> Option<GrangerAnimal> {
        let name = self.name?;
        let id = name.clone();

        Some(GrangerAnimal {
            id,
            name,
            descriptors: self.descriptors,
            age: self.age,
            custom_label: self.custom_label,
            species: self.species,
            settlement: self.settlement,
            caretaker: self.caretaker,
            condition: self.condition,
            traits: self.traits,
            trait_points: self.trait_points,
            colour: self.colour,
            updated_at: self.timestamp,
        })
    }
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

fn strip_timestamp_prefix(line: &str) -> &str {
    if line.starts_with('[') {
        if let Some(index) = line.find("] ") {
            return &line[index + 2..];
        }
    }
    line
}

fn extract_timestamp(line: &str) -> Option<String> {
    if line.starts_with('[') {
        if let Some(index) = line.find(']') {
            return Some(line[1..index].to_string());
        }
    }
    None
}

fn extract_number(line: &str) -> Option<u32> {
    let digits: String = line.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

fn split_trait_sentences(line: &str) -> Vec<String> {
    line.split('.')
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .filter_map(|sentence| {
            if !(sentence.starts_with("It has")
                || sentence.starts_with("He has")
                || sentence.starts_with("She has"))
            {
                return None;
            }

            let lowered = sentence.to_ascii_lowercase();
            if lowered.contains("trait points") || lowered.contains("has been") {
                return None;
            }

            let fragment = sentence.splitn(2, " has ").nth(1)?.trim();
            if fragment.is_empty() {
                None
            } else {
                Some(fragment.to_string())
            }
        })
        .collect()
}

fn extract_custom_label(input: &str) -> (Option<String>, String) {
    if let Some((label, cleaned)) = extract_label_with_delimiter(input, '\'') {
        let label = if label.is_empty() { None } else { Some(label) };
        return (label, cleaned);
    }

    if let Some((label, cleaned)) = extract_label_with_delimiter(input, '"') {
        let label = if label.is_empty() { None } else { Some(label) };
        return (label, cleaned);
    }

    (None, input.trim().to_string())
}

fn extract_label_with_delimiter(input: &str, delimiter: char) -> Option<(String, String)> {
    let mut start = None;
    let mut end = None;

    for (idx, ch) in input.char_indices() {
        if ch == delimiter {
            if start.is_none() {
                start = Some(idx);
            } else {
                end = Some(idx);
                break;
            }
        }
    }

    let (start_idx, end_idx) = (start?, end?);
    if end_idx <= start_idx {
        return None;
    }

    let label = input[start_idx + delimiter.len_utf8()..end_idx]
        .trim()
        .to_string();

    let before = input[..start_idx].trim_end();
    let after = input[end_idx + delimiter.len_utf8()..].trim_start();

    let mut cleaned = String::new();
    if !before.is_empty() {
        cleaned.push_str(before);
    }
    if !before.is_empty() && !after.is_empty() {
        cleaned.push(' ');
    }
    if !after.is_empty() {
        cleaned.push_str(after);
    }

    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");

    Some((label, cleaned))
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
