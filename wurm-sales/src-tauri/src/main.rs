// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_settings;
mod auth_client;
mod granger;
mod skill_sessions;
mod trade_entries;
mod user_layers_persistence;
mod watcher;

use app_settings::{
    load_settings_from_disk, new_shared as new_settings_store, persist_settings, AppSettings,
    SharedSettings,
};
use auth_client::{AuthApiClient, VerifiedSession};
use granger::{
    load_from_disk as load_granger_from_disk, new_store_with as new_granger_store_with,
    GrangerAnimal, SharedGrangerEntries,
};
use serde::Deserialize;
use skill_sessions::{new_store as new_skill_session_store, SharedSkillSessions, SkillSessionData};
use std::env;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    async_runtime,
    Emitter, Manager,
};
use trade_entries::{new_store as new_trade_store, SharedTradeEntries, TradeEntry};
use url::Url;
use watcher::DirectoryWatcher;

#[derive(Deserialize)]
struct UpdateSettingsPayload {
    watch_dir: String,
}

#[derive(Deserialize)]
struct VerifySessionPayload {
    token: String,
}

#[derive(Deserialize)]
struct SetAlwaysOnTopPayload {
    window_label: String,
    always_on_top: bool,
}

#[tauri::command]
async fn open_skills_window(
    app: tauri::AppHandle,
    skill_state: tauri::State<'_, SharedSkillSessions>,
    settings_state: tauri::State<'_, SharedSettings>,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("skills") {
        println!("Skills window already open; showing existing instance");
        let _ = existing.show();
        return Ok(());
    }

    let url = tauri::WebviewUrl::App("skills.html".into());

    let placement = {
        let settings = settings_state
            .lock()
            .map_err(|e| format!("Failed to access settings: {}", e))?;
        settings.skills_window.clone()
    };

    let width = placement.width.max(420.0);
    let height = placement.height.max(140.0);

    match tauri::webview::WebviewWindowBuilder::new(&app, "skills", url)
        .title("Wurm Skills Tracker")
        .position(placement.x, placement.y)
        .inner_size(width, height)
        .min_inner_size(420.0, 140.0)
        .max_inner_size(800.0, 300.0)
        .resizable(true)
        .decorations(false)
        .minimizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focusable(false)
        .transparent(true)
        .shadow(true)
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
async fn get_settings(
    settings_state: tauri::State<'_, SharedSettings>,
) -> Result<AppSettings, String> {
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
async fn open_granger_window(
    app: tauri::AppHandle,
    granger_state: tauri::State<'_, SharedGrangerEntries>,
) -> Result<(), String> {
    let snapshot = {
        let entries = granger_state
            .lock()
            .map_err(|e| format!("Failed to access granger entries: {}", e))?;
        entries.values().cloned().collect::<Vec<GrangerAnimal>>()
    };

    if let Some(existing) = app.get_webview_window("granger") {
        let _ = existing.show();
        let _ = existing.emit("granger-entries", snapshot);
        return Ok(());
    }

    let url = tauri::WebviewUrl::App("granger.html".into());

    match tauri::webview::WebviewWindowBuilder::new(&app, "granger", url)
        .title("Granger Panel")
        .inner_size(640.0, 420.0)
        .min_inner_size(460.0, 280.0)
        .resizable(true)
        .decorations(false)
        .shadow(false)
        .build()
    {
        Ok(window) => {
            let _ = window.emit("granger-entries", snapshot);
            Ok(())
        }
        Err(err) => {
            println!("Failed to create granger window: {:?}", err);
            Err(format!("Failed to create granger window: {:?}", err))
        }
    }
}

#[tauri::command]
async fn open_map_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("map") {
        println!("Map window already open; showing existing instance");
        let _ = existing.show();
        return Ok(());
    }

    let url = tauri::WebviewUrl::App("map.html".into());

    match tauri::webview::WebviewWindowBuilder::new(&app, "map", url)
        .title("Xanadu Map")
        .inner_size(1200.0, 900.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .build()
    {
        Ok(_) => Ok(()),
        Err(err) => {
            println!("Failed to create map window: {:?}", err);
            Err(format!("Failed to create map window: {:?}", err))
        }
    }
}

#[tauri::command]
async fn get_granger_entries(
    granger_state: tauri::State<'_, SharedGrangerEntries>,
) -> Result<Vec<GrangerAnimal>, String> {
    let entries = granger_state
        .lock()
        .map_err(|e| format!("Failed to access granger entries: {}", e))?;
    Ok(entries.values().cloned().collect())
}

#[tauri::command]
async fn open_watcher_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("watcher") {
        println!("Watcher window already open; showing existing instance");
        let _ = existing.show();
        return Ok(());
    }

    let url = tauri::WebviewUrl::App("watcher.html".into());

    match tauri::webview::WebviewWindowBuilder::new(&app, "watcher", url)
        .title("Wurm Watcher")
        .inner_size(400.0, 600.0)
        .resizable(true)
        .decorations(true)
        .build()
    {
        Ok(_) => {
            println!("Watcher window created successfully");
            Ok(())
        }
        Err(e) => {
            println!("Failed to create watcher window: {:?}", e);
            Err(format!("Failed to create watcher window: {:?}", e))
        }
    }
}

#[tauri::command]
async fn close_watcher_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("watcher") {
        window
            .close()
            .map_err(|err| format!("Failed to close watcher window: {:?}", err))?;
    }
    Ok(())
}

#[tauri::command]
async fn verify_session(
    auth_client: tauri::State<'_, AuthApiClient>,
    payload: VerifySessionPayload,
) -> Result<VerifiedSession, String> {
    let token = payload.token.trim();
    if token.is_empty() {
        return Err("Session token is required".to_string());
    }

    auth_client
        .verify_session(token)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn set_always_on_top(
    app: tauri::AppHandle,
    payload: SetAlwaysOnTopPayload,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(&payload.window_label) else {
        return Err(format!("Window not found: {}", payload.window_label));
    };

    window
        .set_always_on_top(payload.always_on_top)
        .map_err(|err| format!("Failed to set always_on_top: {err}"))
}

#[tauri::command]
async fn close_granger_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("granger") {
        window
            .close()
            .map_err(|err| format!("Failed to close granger window: {:?}", err))?;
    }
    Ok(())
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

    if let Some(watcher_window) = app.get_webview_window("watcher") {
        if let Err(err) = watcher_window.emit("settings-updated", updated.clone()) {
            println!("Failed to emit settings update to watcher window: {:?}", err);
        }
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
    // Log any panic to stderr so crashes surface in the dev console.
    std::panic::set_hook(Box::new(|info| {
        eprintln!("Panic: {info}");
    }));

    let skill_sessions = new_skill_session_store();
    let skill_sessions_for_thread = Arc::clone(&skill_sessions);

    let trade_entries = new_trade_store();
    let trade_entries_for_thread = Arc::clone(&trade_entries);

    let granger_entries = new_granger_store_with(load_granger_from_disk());
    let granger_entries_for_thread = Arc::clone(&granger_entries);

    let settings = new_settings_store(load_settings_from_disk());
    let settings_for_thread = Arc::clone(&settings);
    let settings_for_events = Arc::clone(&settings);

    let auth_api_base =
        env::var("AUTH_API_BASE_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    let auth_api_url = Url::parse(&auth_api_base).expect("AUTH_API_BASE_URL must be a valid URL");
    let auth_client = AuthApiClient::new(auth_api_url);

    // Flag to allow tray "Quit" to exit, while closing windows does not terminate the app.
    let quit_flag = Arc::new(AtomicBool::new(false));
    let quit_flag_for_run = Arc::clone(&quit_flag);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::clone(&skill_sessions))
        .manage(Arc::clone(&trade_entries))
        .manage(Arc::clone(&granger_entries))
        .manage(Arc::clone(&settings))
        .manage(auth_client)
        .invoke_handler(tauri::generate_handler![
            open_skills_window,
            open_settings_window,
            open_trade_window,
            open_granger_window,
            open_map_window,
            open_watcher_window,
            get_settings,
            get_skill_sessions,
            get_trade_entries,
            get_granger_entries,
            close_granger_window,
            close_watcher_window,
            verify_session,
            update_settings,
            set_always_on_top,
            user_layers_persistence::load_user_layers,
            user_layers_persistence::save_user_layers
        ])
        .on_window_event(move |window, event| {
            use tauri::WindowEvent;
            if window.label() == "skills" {
                match event {
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                        let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size())
                        else {
                            println!("Failed to read skills window geometry");
                            return;
                        };

                        let settings_store = Arc::clone(&settings_for_events);

                        if let Ok(mut settings) = settings_store.lock() {
                            settings.skills_window.x = pos.x as f64;
                            settings.skills_window.y = pos.y as f64;
                            settings.skills_window.width = size.width as f64;
                            settings.skills_window.height = size.height as f64;

                            if let Err(err) = persist_settings(&settings) {
                                println!("Failed to persist skills window placement: {err}");
                            }
                        } else {
                            println!("Failed to lock settings for window placement update");
                        };
                    }
                    _ => {}
                }
            }
            if let WindowEvent::Destroyed = event {
                println!("Window destroyed: {}", window.label());
            }
        })
        .setup(move |app: &mut tauri::App| {
            let quit_flag = Arc::clone(&quit_flag);
            let open_skills = {
                let item = MenuItem::new(app, "open_skills", true, None::<&str>)?;
                item.set_text("Skills Tracker")?;
                item
            };
            let open_trade = {
                let item = MenuItem::new(app, "open_trade", true, None::<&str>)?;
                item.set_text("Trade Monitor")?;
                item
            };
            let open_granger = {
                let item = MenuItem::new(app, "open_granger", true, None::<&str>)?;
                item.set_text("Granger")?;
                item
            };
            let open_watcher = {
                let item = MenuItem::new(app, "open_watcher", true, None::<&str>)?;
                item.set_text("Watcher")?;
                item
            };
            let open_map = {
                let item = MenuItem::new(app, "open_map", true, None::<&str>)?;
                item.set_text("Maps")?;
                item
            };
            let open_settings = {
                let item = MenuItem::new(app, "open_settings", true, None::<&str>)?;
                item.set_text("Settings")?;
                item
            };
            let quit_item = {
                let item = MenuItem::new(app, "quit", true, None::<&str>)?;
                item.set_text("Quit")?;
                item
            };

            let tray_menu = MenuBuilder::new(app)
                .item(&open_skills)
                .item(&open_trade)
                .item(&open_granger)
                .item(&open_watcher)
                .item(&open_map)
                .separator()
                .item(&open_settings)
                .separator()
                .item(&quit_item)
                .build()?;

            let id_open_skills = open_skills.id().clone();
            let id_open_trade = open_trade.id().clone();
            let id_open_granger = open_granger.id().clone();
            let id_open_watcher = open_watcher.id().clone();
            let id_open_map = open_map.id().clone();
            let id_open_settings = open_settings.id().clone();
            let id_quit = quit_item.id().clone();

            TrayIconBuilder::new()
                .menu(&tray_menu)
                .on_menu_event(move |app, event| {
                    println!("Tray menu clicked: {:?}", event.id());
                    if event.id() == &id_open_skills {
                        let handle_for_state = app.clone();
                        async_runtime::spawn(async move {
                            let skill_state: tauri::State<SharedSkillSessions> =
                                handle_for_state.state();
                            let settings_state: tauri::State<SharedSettings> =
                                handle_for_state.state();
                            let handle = handle_for_state.clone();
                            if let Err(err) =
                                open_skills_window(handle, skill_state, settings_state).await
                            {
                                println!("failed to open skills window: {}", err);
                            }
                        });
                    } else if event.id() == &id_open_trade {
                        let handle_for_state = app.clone();
                        async_runtime::spawn(async move {
                            let state: tauri::State<SharedTradeEntries> = handle_for_state.state();
                            let handle = handle_for_state.clone();
                            if let Err(err) = open_trade_window(handle, state).await {
                                println!("failed to open trade window: {}", err);
                            }
                        });
                    } else if event.id() == &id_open_granger {
                        let handle_for_state = app.clone();
                        async_runtime::spawn(async move {
                            let state: tauri::State<SharedGrangerEntries> = handle_for_state.state();
                            let handle = handle_for_state.clone();
                            if let Err(err) = open_granger_window(handle, state).await {
                                println!("failed to open granger window: {}", err);
                            }
                        });
                    } else if event.id() == &id_open_watcher {
                        let handle = app.clone();
                        async_runtime::spawn(async move {
                            if let Err(err) = open_watcher_window(handle).await {
                                println!("failed to open watcher window: {}", err);
                            }
                        });
                    } else if event.id() == &id_open_map {
                        let handle = app.clone();
                        async_runtime::spawn(async move {
                            if let Err(err) = open_map_window(handle).await {
                                println!("failed to open map window: {}", err);
                            }
                        });
                    } else if event.id() == &id_open_settings {
                        let handle_for_state = app.clone();
                        async_runtime::spawn(async move {
                            let state: tauri::State<SharedSettings> = handle_for_state.state();
                            let handle = handle_for_state.clone();
                            if let Err(err) = open_settings_window(handle, state).await {
                                println!("failed to open settings window: {}", err);
                            }
                        });
                    } else if event.id() == &id_quit {
                        quit_flag.store(true, Ordering::Relaxed);
                        app.exit(0);
                    }
                })
                .build(app)?;

            DirectoryWatcher::new(
                app.handle().clone(),
                Arc::clone(&settings_for_thread),
                Arc::clone(&skill_sessions_for_thread),
                Arc::clone(&trade_entries_for_thread),
                Arc::clone(&granger_entries_for_thread),
            )
            .start();

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Tauri app")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !quit_flag_for_run.load(Ordering::Relaxed) {
                    api.prevent_exit();
                }
            }
        });
}
