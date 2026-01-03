// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_settings;
mod skill_sessions;
mod trade_entries;
mod watcher;

use app_settings::{load_settings_from_disk, new_shared as new_settings_store, persist_settings, AppSettings, SharedSettings};
use serde::Deserialize;
use skill_sessions::{new_store as new_skill_session_store, SharedSkillSessions, SkillSessionData};
use trade_entries::{new_store as new_trade_store, SharedTradeEntries, TradeEntry};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use watcher::DirectoryWatcher;

#[derive(Deserialize)]
struct UpdateSettingsPayload {
    watch_dir: String,
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
        .inner_size(600.0, 220.0)
        .min_inner_size(420.0, 140.0)
        .max_inner_size(800.0, 300.0)
        .resizable(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focusable(false)
        .transparent(true)
        .shadow(false)
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
async fn get_skill_sessions(
    skill_state: tauri::State<'_, SharedSkillSessions>,
) -> Result<Vec<SkillSessionData>, String> {
    let sessions = skill_state
        .lock()
        .map_err(|e| format!("Failed to access skill sessions: {}", e))?;
    Ok(sessions.values().cloned().collect())
}

#[tauri::command]
async fn open_trade_window(
    app: tauri::AppHandle,
    trade_state: tauri::State<'_, SharedTradeEntries>,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("trade") {
        println!("Trade window already open; showing existing instance");
        let _ = existing.show();
        return Ok(());
    }

    let url = tauri::WebviewUrl::App("trade.html".into());

    match tauri::webview::WebviewWindowBuilder::new(&app, "trade", url)
        .title("Wurm Trade Monitor")
        .inner_size(720.0, 420.0)
        .resizable(false)
        .decorations(false)
        .build()
    {
        Ok(window) => {
            if let Ok(trades) = trade_state.lock() {
                let snapshot = trades.clone();
                let _ = window.emit("trade-entries", snapshot);
            }
            Ok(())
        }
        Err(e) => {
            println!("Failed to create trade window: {:?}", e);
            Err(format!("Failed to create trade window: {:?}", e))
        }
    }
}

#[tauri::command]
async fn get_trade_entries(
    trade_state: tauri::State<'_, SharedTradeEntries>,
) -> Result<Vec<TradeEntry>, String> {
    let trades = trade_state
        .lock()
        .map_err(|e| format!("Failed to access trade entries: {}", e))?;
    Ok(trades.clone())
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

fn main() {
    let skill_sessions = new_skill_session_store();
    let skill_sessions_for_thread = Arc::clone(&skill_sessions);

    let trade_entries = new_trade_store();
    let trade_entries_for_thread = Arc::clone(&trade_entries);

    let settings = new_settings_store(load_settings_from_disk());
    let settings_for_thread = Arc::clone(&settings);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::clone(&skill_sessions))
        .manage(Arc::clone(&trade_entries))
        .manage(Arc::clone(&settings))
        .invoke_handler(tauri::generate_handler![
            open_skills_window,
            open_settings_window,
            open_trade_window,
            get_settings,
            get_skill_sessions,
            get_trade_entries,
            update_settings
        ])
        .setup(move |app| {
            DirectoryWatcher::new(
                app.handle().clone(),
                Arc::clone(&settings_for_thread),
                Arc::clone(&skill_sessions_for_thread),
                Arc::clone(&trade_entries_for_thread),
            )
            .start();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri app");
}
