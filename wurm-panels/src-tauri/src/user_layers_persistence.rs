use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// Mirror the TypeScript interfaces

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserFeatureProperties {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserFeature {
    #[serde(rename = "type")]
    pub feature_type: String, // 'Point', 'LineString', 'Polygon'
    pub coordinates: serde_json::Value,
    pub properties: UserFeatureProperties,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserLayer {
    pub name: String,
    pub features: Vec<UserFeature>,
    pub visible: bool,
}

fn config_dir_path() -> Result<PathBuf, String> {
    directories::ProjectDirs::from("com", "WefNET", "wurm-sales")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .ok_or_else(|| "Unable to resolve configuration directory".to_string())
}

fn get_layers_file_name(map_id: &str) -> String {
    format!("user_layers_{}.json", map_id)
}

#[tauri::command]
pub fn load_user_layers(map_id: String) -> Result<Vec<UserLayer>, String> {
    match config_dir_path() {
        Ok(config_dir) => {
            let file_name = get_layers_file_name(&map_id);
            let layers_path = config_dir.join(&file_name);
            if layers_path.exists() {
                let raw = fs::read_to_string(&layers_path)
                    .map_err(|e| format!("Failed to read user_layers.json: {}", e))?;
                
                if raw.trim().is_empty() {
                    return Ok(Vec::new());
                }

                serde_json::from_str::<Vec<UserLayer>>(&raw)
                    .map_err(|e| format!("Failed to deserialize user layers for map '{}': {}", map_id, e))
            } else {
                Ok(Vec::new()) // File doesn't exist, return empty list
            }
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn save_user_layers(map_id: String, layers: Vec<UserLayer>) -> Result<(), String> {
    let config_dir = config_dir_path()?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let file_name = get_layers_file_name(&map_id);
    let layers_path = config_dir.join(&file_name);
    let serialized = serde_json::to_string_pretty(&layers)
        .map_err(|e| format!("Failed to serialize user layers: {}", e))?;

    fs::write(&layers_path, serialized)
        .map_err(|e| format!("Failed to write user_layers.json: {}", e))?;

    println!("User layers saved to {:?}", layers_path);
    Ok(())
}
