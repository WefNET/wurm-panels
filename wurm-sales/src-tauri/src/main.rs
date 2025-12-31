// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;
use tauri::Emitter;

#[derive(Clone, Serialize)]
struct FileChangeEvent {
    path: String,
    line: String,
    chat_type: String,
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

fn main() {
    // Store the last known content of each file
    let mut file_contents: HashMap<String, String> = HashMap::new();

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
        .setup(move |app| {
            let app_handle = app.handle().clone();

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

                                                    // Emit event to frontend
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

                                                // Emit event to frontend
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

