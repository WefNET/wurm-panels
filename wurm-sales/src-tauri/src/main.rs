// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize)]
struct FileChangeEvent {
    path: String,
    line: String,
    chat_type: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct SkillSessionData {
    skill_name: String,
    start_level: f64,
    session_gain: f64,
    last_gain: f64,
}

type SharedSkillSessions = Arc<Mutex<HashMap<String, SkillSessionData>>>;

#[derive(Clone, Serialize, Deserialize)]
struct AppSettings {
    watch_dir: String,
}

impl AppSettings {
    fn default() -> Self {
        Self {
            watch_dir: "C:\\Users\\johnw\\wurm\\players\\jackjones\\logs".to_string(),
        }
    }
}

type SharedSettings = Arc<Mutex<AppSettings>>;

const SETTINGS_FILE_NAME: &str = "settings.json";

#[derive(Deserialize)]
struct UpdateSettingsPayload {
    watch_dir: String,
}

fn config_dir_path() -> Result<PathBuf, String> {
    ProjectDirs::from("com", "WefNET", "wurm-sales")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .ok_or_else(|| "Unable to resolve configuration directory".to_string())
}

fn load_settings_from_disk() -> AppSettings {
    match config_dir_path() {
        Ok(config_dir) => {
            let settings_path = config_dir.join(SETTINGS_FILE_NAME);
            if let Ok(raw) = fs::read_to_string(&settings_path) {
                if let Ok(settings) = serde_json::from_str::<AppSettings>(&raw) {
                    return settings;
                } else {
                    println!("Failed to deserialize settings, using defaults");
                }
            } else {
                println!("Settings file not found, using defaults");
            }
            AppSettings::default()
        }
        Err(err) => {
            println!("{}", err);
            AppSettings::default()
        }
    }
}

fn persist_settings(settings: &AppSettings) -> Result<(), String> {
    let config_dir = config_dir_path()?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let settings_path = config_dir.join(SETTINGS_FILE_NAME);
    let serialized = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, serialized)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    println!("Settings saved to {:?}", settings_path);
    Ok(())
}

#[tauri::command]
async fn open_skills_window(
    app: tauri::AppHandle,
    skill_state: tauri::State<'_, SharedSkillSessions>,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("skills") {
        println!("Skills window already open; showing existing instance");
        let _ = existing.show();
        return Ok(());
    }

    let url = tauri::WebviewUrl::App("skills.html".into());

    match tauri::webview::WebviewWindowBuilder::new(&app, "skills", url)
        .title("Wurm Skills Tracker")
        .inner_size(600.0, 300.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focusable(false)
        .build()
    {
        Ok(window) => {
            println!("Skills window created successfully from Rust");

            if let Ok(sessions) = skill_state.lock() {
                let session_vec: Vec<SkillSessionData> = sessions.values().cloned().collect();

                if let Err(err) = window.emit("skill-sessions", session_vec) {
                    println!("Failed to send initial data to skills window: {:?}", err);
                }
            }

            Ok(())
        }
        Err(e) => {
            println!("Failed to create skills window: {:?}", e);
            Err(format!("Failed to create window: {:?}", e))
        }
    }
}

#[tauri::command]
async fn open_settings_window(
    app: tauri::AppHandle,
    settings_state: tauri::State<'_, SharedSettings>,
) -> Result<(), String> {
    let current_settings = {
        let settings = settings_state
            .lock()
            .map_err(|e| format!("Failed to access settings: {}", e))?;
        settings.clone()
    };

    if let Some(existing) = app.get_webview_window("settings") {
        let _ = existing.show();
        let _ = existing.emit("settings-data", current_settings);
        return Ok(());
    }

    let url = tauri::WebviewUrl::App("settings.html".into());

    match tauri::webview::WebviewWindowBuilder::new(&app, "settings", url)
        .title("Settings")
        .inner_size(480.0, 260.0)
        .resizable(false)
        .decorations(false)
        .skip_taskbar(true)
        .build()
    {
        Ok(window) => {
            let _ = window.emit("settings-data", current_settings);
            Ok(())
        }
        Err(e) => {
            println!("Failed to create settings window: {:?}", e);
            Err(format!("Failed to create settings window: {:?}", e))
        }
    }
}

#[tauri::command]
async fn get_settings(settings_state: tauri::State<'_, SharedSettings>) -> Result<AppSettings, String> {
    let settings = settings_state
        .lock()
        .map_err(|e| format!("Failed to access settings: {}", e))?;
    Ok(settings.clone())
}

#[tauri::command]
async fn update_settings(
    app: tauri::AppHandle,
    settings_state: tauri::State<'_, SharedSettings>,
    payload: UpdateSettingsPayload,
) -> Result<AppSettings, String> {
    let mut settings = settings_state
        .lock()
        .map_err(|e| format!("Failed to access settings: {}", e))?;

    settings.watch_dir = payload.watch_dir.trim().to_string();
    let updated = settings.clone();
    drop(settings);

    persist_settings(&updated)?;

    if let Err(err) = app.emit("settings-updated", updated.clone()) {
        println!("Failed to emit settings update to main window: {:?}", err);
    }

    if let Some(settings_window) = app.get_webview_window("settings") {
        if let Err(err) = settings_window.emit("settings-data", updated.clone()) {
            println!(
                "Failed to emit settings update to settings window: {:?}",
                err
            );
        }
    }

    Ok(updated)
}

fn get_chat_type(path_str: &str) -> String {
    // Extract filename from path
    if let Some(filename) = Path::new(path_str).file_name() {
        if let Some(filename_str) = filename.to_str() {
            // Remove underscore prefix and take everything before first dot
            if filename_str.starts_with('_') {
                if let Some(dot_pos) = filename_str.find('.') {
                    return filename_str[1..dot_pos].to_string();
                }
            }

            if filename_str.contains("GL-Freedom.") {
                return "GL-Freedom".to_string();
            }

            if filename_str.contains("CA_HELP.") {
                return "CA-Help".to_string();
            }

            if filename_str.contains("Trade.") {
                return "Trade".to_string();
            }

            // PM__
            if filename_str.contains("PM__") {
                return "PM".to_string();
            }
        }
    }
    "unknown".to_string()
}

fn parse_skill_gain(line: &str) -> Option<(String, f64, f64)> {
    // Look for skill gain messages like:
    // "[06:25:41] Stone cutting increased by 0.0010 to 62.6648"
    if line.contains("increased by") && line.contains("to") {
        // Skip timestamp if present (starts with [HH:MM:SS])
        let content = if line.starts_with('[') && line.len() > 10 {
            // Find the end of timestamp and skip it
            if let Some(timestamp_end) = line.find("] ") {
                &line[timestamp_end + 2..]
            } else {
                line
            }
        } else {
            line
        };

        // Extract skill name (everything before " increased")
        if let Some(skill_end) = content.find(" increased") {
            let skill_name = content[..skill_end].trim().to_string();

            // Extract gain amount between "by " and " to"
            if let Some(gain_start) = content.find("by ") {
                if let Some(gain_end) = content.find(" to") {
                    if let Ok(gain) = content[gain_start + 3..gain_end].trim().parse::<f64>() {
                        // Extract current level after "to "
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

fn main() {
    // Track skill session data for this session (shared across threads/commands)
    let skill_sessions: SharedSkillSessions = Arc::new(Mutex::new(HashMap::new()));
    let skill_sessions_for_thread = Arc::clone(&skill_sessions);

    // Load persisted settings and share them across commands and the polling loop
    let settings: SharedSettings = Arc::new(Mutex::new(load_settings_from_disk()));
    let settings_for_thread = Arc::clone(&settings);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::clone(&skill_sessions))
        .manage(Arc::clone(&settings))
        .invoke_handler(tauri::generate_handler![
            open_skills_window,
            open_settings_window,
            get_settings,
            update_settings
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let skill_sessions = Arc::clone(&skill_sessions_for_thread);
            let settings = Arc::clone(&settings_for_thread);

            // Spawn a thread that polls the directory every 500ms
            thread::spawn(move || {
                let mut file_contents: HashMap<String, String> = HashMap::new();
                let mut active_watch_dir = String::new();

                loop {
                    let current_watch_dir = {
                        match settings.lock() {
                            Ok(settings_guard) => settings_guard.watch_dir.clone(),
                            Err(err) => {
                                println!(
                                    "Failed to lock settings ({}); reusing previous watch directory",
                                    err
                                );
                                active_watch_dir.clone()
                            }
                        }
                    };

                    if current_watch_dir.trim().is_empty() {
                        if !active_watch_dir.is_empty() {
                            println!("Watch directory cleared; resetting state");
                            active_watch_dir.clear();
                            file_contents.clear();
                            if let Ok(mut sessions) = skill_sessions.lock() {
                                sessions.clear();
                            }
                            if let Err(err) = app_handle.emit("skill-sessions", Vec::<SkillSessionData>::new()) {
                                println!("Failed to emit skill session reset: {:?}", err);
                            }
                        }
                        thread::sleep(Duration::from_millis(500));
                        continue;
                    }

                    if active_watch_dir != current_watch_dir {
                        println!("Switching watch directory to {}", current_watch_dir);
                        active_watch_dir = current_watch_dir.clone();
                        file_contents.clear();

                        match fs::read_dir(&active_watch_dir) {
                            Ok(entries) => {
                                for entry in entries.flatten() {
                                    let path = entry.path();
                                    if path.is_file() {
                                        if let Ok(content) = fs::read_to_string(&path) {
                                            let path_str = path.to_string_lossy().to_string();
                                            file_contents.insert(path_str, content);
                                        }
                                    }
                                }
                                println!("Initial scan complete for {}", active_watch_dir);
                            }
                            Err(err) => {
                                println!(
                                    "Failed to read watch directory {}: {}",
                                    active_watch_dir, err
                                );
                                thread::sleep(Duration::from_millis(1000));
                                continue;
                            }
                        }

                        if let Ok(mut sessions) = skill_sessions.lock() {
                            sessions.clear();
                        }
                        if let Err(err) = app_handle.emit("skill-sessions", Vec::<SkillSessionData>::new()) {
                            println!("Failed to emit skill session reset: {:?}", err);
                        }
                    }

                    if active_watch_dir.is_empty() {
                        thread::sleep(Duration::from_millis(500));
                        continue;
                    }

                    match fs::read_dir(&active_watch_dir) {
                        Ok(entries) => {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if !path.is_file() {
                                    continue;
                                }

                                if let Ok(content) = fs::read_to_string(&path) {
                                    let path_str = path.to_string_lossy().to_string();
                                    let chat_type = get_chat_type(&path_str);

                                    if let Some(last_content) = file_contents.get(&path_str) {
                                        if content != *last_content {
                                            if let Some(last_line) = content.lines().last() {
                                                println!(
                                                    "--- FILE CHANGED --- {}: {}",
                                                    chat_type, last_line
                                                );

                                                if let Some((skill_name, gain, current_level)) =
                                                    parse_skill_gain(last_line)
                                                {
                                                    if let Ok(mut sessions) = skill_sessions.lock() {
                                                        let entry = sessions
                                                            .entry(skill_name.clone())
                                                            .or_insert_with(|| SkillSessionData {
                                                                skill_name: skill_name.clone(),
                                                                start_level: current_level - gain,
                                                                session_gain: 0.0,
                                                                last_gain: 0.0,
                                                            });

                                                        entry.session_gain =
                                                            current_level - entry.start_level;
                                                        entry.last_gain = gain;

                                                        println!(
                                                            "--- SKILL GAIN --- {}: +{:.4} (session: +{:.4})",
                                                            skill_name,
                                                            gain,
                                                            entry.session_gain
                                                        );

                                                        let session_data_vec: Vec<SkillSessionData> =
                                                            sessions.values().cloned().collect();
                                                        drop(sessions);

                                                        if let Err(err) = app_handle.emit(
                                                            "skill-sessions",
                                                            session_data_vec.clone(),
                                                        ) {
                                                            println!(
                                                                "Failed to emit skill sessions to main window: {:?}",
                                                                err
                                                            );
                                                        }
                                                        if let Err(err) = app_handle.emit_to(
                                                            "skills",
                                                            "skill-sessions",
                                                            session_data_vec,
                                                        ) {
                                                            if !matches!(
                                                                err,
                                                                tauri::Error::WebviewNotFound
                                                            ) {
                                                                println!(
                                                                    "Failed to emit skill sessions to skills window: {:?}",
                                                                    err
                                                                );
                                                            }
                                                        }
                                                    }
                                                }

                                                if let Err(err) = app_handle.emit(
                                                    "file-changed",
                                                    FileChangeEvent {
                                                        path: path_str.clone(),
                                                        line: last_line.to_string(),
                                                        chat_type: chat_type.clone(),
                                                    },
                                                ) {
                                                    println!(
                                                        "Failed to emit file change event: {:?}",
                                                        err
                                                    );
                                                }
                                            }
                                        }
                                    } else if let Some(last_line) = content.lines().last() {
                                        println!(
                                            "--- NEW FILE DETECTED --- {}: {}",
                                            chat_type, last_line
                                        );

                                        if let Some((skill_name, gain, current_level)) =
                                            parse_skill_gain(last_line)
                                        {
                                            if let Ok(mut sessions) = skill_sessions.lock() {
                                                let entry = sessions
                                                    .entry(skill_name.clone())
                                                    .or_insert_with(|| SkillSessionData {
                                                        skill_name: skill_name.clone(),
                                                        start_level: current_level - gain,
                                                        session_gain: 0.0,
                                                        last_gain: 0.0,
                                                    });

                                                entry.session_gain =
                                                    current_level - entry.start_level;
                                                entry.last_gain = gain;

                                                println!(
                                                    "--- SKILL GAIN (NEW FILE) --- {}: +{:.4} (session: +{:.4})",
                                                    skill_name,
                                                    gain,
                                                    entry.session_gain
                                                );

                                                let session_data_vec: Vec<SkillSessionData> =
                                                    sessions.values().cloned().collect();
                                                drop(sessions);

                                                if let Err(err) = app_handle.emit(
                                                    "skill-sessions",
                                                    session_data_vec.clone(),
                                                ) {
                                                    println!(
                                                        "Failed to emit skill sessions to main window: {:?}",
                                                        err
                                                    );
                                                }
                                                if let Err(err) = app_handle.emit_to(
                                                    "skills",
                                                    "skill-sessions",
                                                    session_data_vec,
                                                ) {
                                                    if !matches!(
                                                        err,
                                                        tauri::Error::WebviewNotFound
                                                    ) {
                                                        println!(
                                                            "Failed to emit skill sessions to skills window: {:?}",
                                                            err
                                                        );
                                                    }
                                                }
                                            }
                                        }

                                        if let Err(err) = app_handle.emit(
                                            "file-changed",
                                            FileChangeEvent {
                                                path: path_str.clone(),
                                                line: last_line.to_string(),
                                                chat_type: chat_type.clone(),
                                            },
                                        ) {
                                            println!(
                                                "Failed to emit file change event: {:?}",
                                                err
                                            );
                                        }
                                    }

                                    file_contents.insert(path_str, content);
                                }
                            }
                        }
                        Err(err) => {
                            println!(
                                "Failed to read watch directory {}: {}",
                                active_watch_dir, err
                            );
                            thread::sleep(Duration::from_millis(1000));
                            continue;
                        }
                    }

                    thread::sleep(Duration::from_millis(500));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri app");
}
