// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
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

#[derive(Clone, Serialize)]
struct SkillSessionData {
    skill_name: String,
    start_level: f64,
    session_gain: f64,
    last_gain: f64,
}

type SharedSkillSessions = Arc<Mutex<HashMap<String, SkillSessionData>>>;

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
    // Store the last known content of each file
    let mut file_contents: HashMap<String, String> = HashMap::new();

    // Track skill session data for this session (shared across threads/commands)
    let skill_sessions: SharedSkillSessions = Arc::new(Mutex::new(HashMap::new()));
    let skill_sessions_for_thread = Arc::clone(&skill_sessions);

    // The directory to monitor
    let watch_dir = "C:\\Users\\johnw\\wurm\\players\\jackjones\\logs";

    println!("Starting manual file polling for: {}", watch_dir);

    // INITIAL SCAN: Read all existing files without emitting events
    println!("Performing initial scan of existing files...");
    if let Ok(entries) = fs::read_dir(watch_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    if let Ok(content) = fs::read_to_string(&path) {
                        let path_str = path.to_string_lossy().to_string();
                        file_contents.insert(path_str, content);
                    }
                }
            }
        }
    }
    println!("Initial scan complete. Monitoring for new changes...");

    tauri::Builder::default()
        .manage(skill_sessions)
        .invoke_handler(tauri::generate_handler![open_skills_window])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let skill_sessions = Arc::clone(&skill_sessions_for_thread);

            // Spawn a thread that polls the directory every 500ms
            thread::spawn(move || {
                loop {
                    if let Ok(entries) = fs::read_dir(watch_dir) {
                        for entry in entries {
                            if let Ok(entry) = entry {
                                let path = entry.path();
                                if path.is_file() {
                                    if let Ok(content) = fs::read_to_string(&path) {
                                        let path_str = path.to_string_lossy().to_string();
                                        let chat_type = get_chat_type(&path_str);
                                        if let Some(last_content) = file_contents.get(&path_str) {
                                            if content != *last_content {
                                                // Content actually changed!
                                                if let Some(last_line) = content.lines().last() {
                                                    println!("--- FILE CHANGED --- {}: {}", chat_type, last_line);

                                                    // Check for skill gains
                                                    if let Some((skill_name, gain, current_level)) = parse_skill_gain(last_line) {
                                                        // Update or insert skill session data
                                                        if let Ok(mut sessions) = skill_sessions.lock() {
                                                            let entry = sessions.entry(skill_name.clone()).or_insert_with(|| SkillSessionData {
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
                                                                println!("Failed to emit skill sessions to main window: {:?}", err);
                                                            }
                                                            if let Err(err) = app_handle.emit_to("skills", "skill-sessions", session_data_vec) {
                                                                if !matches!(err, tauri::Error::WebviewNotFound) {
                                                                    println!("Failed to emit skill sessions to skills window: {:?}", err);
                                                                }
                                                            }
                                                        }
                                                    }

                                                    // Emit regular file change event
                                                    app_handle.emit("file-changed", FileChangeEvent {
                                                        path: path_str.clone(),
                                                        line: last_line.to_string(),
                                                        chat_type: chat_type.clone(),
                                                    }).unwrap();
                                                }
                                            }
                                        } else {
                                            // New file detected (created after initial scan)
                                            if let Some(last_line) = content.lines().last() {
                                                println!("--- NEW FILE DETECTED --- {}: {}", chat_type, last_line);

                                                // Check for skill gains in new files too
                                                if let Some((skill_name, gain, current_level)) = parse_skill_gain(last_line) {
                                                    if let Ok(mut sessions) = skill_sessions.lock() {
                                                        let entry = sessions.entry(skill_name.clone()).or_insert_with(|| SkillSessionData {
                                                            skill_name: skill_name.clone(),
                                                            start_level: current_level - gain,
                                                            session_gain: 0.0,
                                                            last_gain: 0.0,
                                                        });

                                                        entry.session_gain = current_level - entry.start_level;
                                                        entry.last_gain = gain;

                                                        println!(
                                                            "--- SKILL GAIN (NEW FILE) --- {}: +{:.4} (session: +{:.4})",
                                                            skill_name,
                                                            gain,
                                                            entry.session_gain
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

                                                // Emit regular file change event
                                                app_handle.emit("file-changed", FileChangeEvent {
                                                    path: path_str.clone(),
                                                    line: last_line.to_string(),
                                                    chat_type: chat_type.clone(),
                                                }).unwrap();
                                            }
                                        }
                                        // Update stored content (for both new and existing files)
                                        file_contents.insert(path_str, content);
                                    }
                                }
                            }
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
