// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::thread;
use std::time::Duration;
use tauri::Emitter;

#[derive(Clone, Serialize)]
struct FileChangeEvent {
    path: String,
    line: String,
    category: String,
}

fn categorize_log_line(line: &str) -> String {
    let line_lower = line.to_lowercase();

    // Wurm Online log categorization examples
    if line_lower.contains("killed") || line_lower.contains("slain") || line_lower.contains("combat") {
        "combat".to_string()
    } else if line_lower.contains("trades") || line_lower.contains("sold") || line_lower.contains("bought") || line_lower.contains("coin") {
        "trading".to_string()
    } else if line_lower.contains("crafted") || line_lower.contains("created") || line_lower.contains("improved") {
        "crafting".to_string()
    } else if line_lower.contains("joined") || line_lower.contains("left") || line_lower.contains("logged") {
        "player_activity".to_string()
    } else if line_lower.contains("server") || line_lower.contains("system") || line_lower.contains("maintenance") {
        "system".to_string()
    } else if line_lower.contains("skill") || line_lower.contains("learned") || line_lower.contains("gained") {
        "skill_progress".to_string()
    } else {
        "general".to_string()
    }
}

fn main() {
    // Store the last known content of each file
    let mut file_contents: HashMap<String, String> = HashMap::new();

    // The directory to monitor
    let watch_dir = "C:\\Users\\johnw\\wurm\\players\\jackjones\\logs";

    println!("Starting manual file polling for: {}", watch_dir);

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
                                        if let Some(last_content) = file_contents.get(&path_str) {
                                            if content != *last_content {
                                                // Content actually changed!
                                                if let Some(last_line) = content.lines().last() {
                                                    let category = categorize_log_line(last_line);
                                                    println!("--- FILE CHANGED [{}] --- {}: {}", category, path_str, last_line);

                                                    // Emit event to frontend
                                                    app_handle.emit("file-changed", FileChangeEvent {
                                                        path: path_str.clone(),
                                                        line: last_line.to_string(),
                                                        category,
                                                    }).unwrap();
                                                }
                                            }
                                        }
                                        // Update stored content
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

