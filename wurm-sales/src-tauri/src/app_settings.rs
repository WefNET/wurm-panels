use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub const SETTINGS_FILE_NAME: &str = "settings.json";

#[derive(Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub watch_dir: String,
}

impl AppSettings {
    pub fn default() -> Self {
        Self {
            watch_dir: "C:\\Users\\johnw\\wurm\\players\\jackjones\\logs".to_string(),
        }
    }
}

pub type SharedSettings = Arc<Mutex<AppSettings>>;

pub fn new_shared(settings: AppSettings) -> SharedSettings {
    Arc::new(Mutex::new(settings))
}

fn config_dir_path() -> Result<PathBuf, String> {
    ProjectDirs::from("com", "WefNET", "wurm-sales")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .ok_or_else(|| "Unable to resolve configuration directory".to_string())
}

pub fn load_settings_from_disk() -> AppSettings {
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

pub fn persist_settings(settings: &AppSettings) -> Result<(), String> {
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
