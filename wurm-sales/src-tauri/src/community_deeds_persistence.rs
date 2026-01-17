use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommunityDeed {
    pub name: String,
    pub coords: [i32; 2],
    pub deed_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommunityDeedsCache {
    pub deeds: Vec<CommunityDeed>,
    pub fetched_at: i64, // Unix timestamp
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommunityStructure {
    pub name: String,
    pub coords: [i32; 2],
    pub structure_type: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommunityStructuresCache {
    pub structures: Vec<CommunityStructure>,
    pub fetched_at: i64, // Unix timestamp
}

fn config_dir_path() -> Result<PathBuf, String> {
    directories::ProjectDirs::from("com", "WefNET", "wurm-sales")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .ok_or_else(|| "Unable to resolve configuration directory".to_string())
}

fn get_deeds_file_name(map_id: &str) -> String {
    format!("community_deeds_{}.json", map_id)
}

fn get_guard_towers_file_name(map_id: &str) -> String {
    format!("community_guard_towers_{}.json", map_id)
}

fn get_mission_structures_file_name(map_id: &str) -> String {
    format!("community_mission_structures_{}.json", map_id)
}

#[tauri::command]
pub fn load_community_deeds(map_id: String) -> Result<Option<CommunityDeedsCache>, String> {
    match config_dir_path() {
        Ok(config_dir) => {
            let file_name = get_deeds_file_name(&map_id);
            let deeds_path = config_dir.join(&file_name);
            if deeds_path.exists() {
                let raw = fs::read_to_string(&deeds_path)
                    .map_err(|e| format!("Failed to read community_deeds.json: {}", e))?;

                if raw.trim().is_empty() {
                    return Ok(None);
                }

                let cache: Result<CommunityDeedsCache, _> = serde_json::from_str(&raw);
                match cache {
                    Ok(cache) => {
                        // Check if cache is older than 24 hours
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs() as i64;
                        let cache_age_seconds = now - cache.fetched_at;
                        let one_day_seconds = 24 * 60 * 60;

                        if cache_age_seconds > one_day_seconds {
                            println!("Community deeds cache expired (age: {} seconds), will refetch", cache_age_seconds);
                            Ok(None)
                        } else {
                            Ok(Some(cache))
                        }
                    }
                    Err(_) => {
                        // Try to parse as old format (just array of deeds)
                        println!("Attempting to parse as legacy format");
                        let deeds: Vec<CommunityDeed> = serde_json::from_str(&raw)
                            .map_err(|e| format!("Failed to deserialize community deeds for map '{}': {}", map_id, e))?;
                        
                        // Wrap in cache with current timestamp
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs() as i64;
                        
                        let cache = CommunityDeedsCache {
                            deeds,
                            fetched_at: now,
                        };
                        
                        // Save in new format
                        let serialized = serde_json::to_string_pretty(&cache)
                            .map_err(|e| format!("Failed to serialize updated cache: {}", e))?;
                        fs::write(&deeds_path, serialized)
                            .map_err(|e| format!("Failed to write updated cache: {}", e))?;
                        
                        println!("Converted legacy cache to new format");
                        Ok(Some(cache))
                    }
                }
            } else {
                Ok(None)
            }
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn save_community_deeds(map_id: String, deeds: Vec<CommunityDeed>) -> Result<(), String> {
    let config_dir = config_dir_path()?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let file_name = get_deeds_file_name(&map_id);
    let deeds_path = config_dir.join(&file_name);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let cache = CommunityDeedsCache {
        deeds,
        fetched_at: now,
    };

    let serialized = serde_json::to_string_pretty(&cache)
        .map_err(|e| format!("Failed to serialize community deeds: {}", e))?;

    fs::write(&deeds_path, serialized)
        .map_err(|e| format!("Failed to write community_deeds.json: {}", e))?;

    println!("Community deeds saved to {:?}", deeds_path);
    Ok(())
}

#[tauri::command]
pub fn load_community_guard_towers(map_id: String) -> Result<Option<CommunityStructuresCache>, String> {
    load_community_structures(&map_id, &get_guard_towers_file_name(&map_id))
}

#[tauri::command]
pub fn save_community_guard_towers(map_id: String, structures: Vec<CommunityStructure>) -> Result<(), String> {
    save_community_structures(&map_id, structures, &get_guard_towers_file_name(&map_id))
}

#[tauri::command]
pub fn load_community_mission_structures(map_id: String) -> Result<Option<CommunityStructuresCache>, String> {
    load_community_structures(&map_id, &get_mission_structures_file_name(&map_id))
}

#[tauri::command]
pub fn save_community_mission_structures(map_id: String, structures: Vec<CommunityStructure>) -> Result<(), String> {
    save_community_structures(&map_id, structures, &get_mission_structures_file_name(&map_id))
}

fn load_community_structures(map_id: &str, file_name: &str) -> Result<Option<CommunityStructuresCache>, String> {
    match config_dir_path() {
        Ok(config_dir) => {
            let structures_path = config_dir.join(file_name);
            if structures_path.exists() {
                let raw = fs::read_to_string(&structures_path)
                    .map_err(|e| format!("Failed to read {}: {}", file_name, e))?;

                if raw.trim().is_empty() {
                    return Ok(None);
                }

                let cache: Result<CommunityStructuresCache, _> = serde_json::from_str(&raw);
                match cache {
                    Ok(cache) => {
                        // Check if cache is older than 24 hours
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs() as i64;
                        let cache_age_seconds = now - cache.fetched_at;
                        let one_day_seconds = 24 * 60 * 60;

                        if cache_age_seconds > one_day_seconds {
                            println!("Community structures cache expired (age: {} seconds), will refetch", cache_age_seconds);
                            Ok(None)
                        } else {
                            Ok(Some(cache))
                        }
                    }
                    Err(_) => {
                        // Try to parse as old format (just array of structures)
                        println!("Attempting to parse as legacy format");
                        let structures: Vec<CommunityStructure> = serde_json::from_str(&raw)
                            .map_err(|e| format!("Failed to deserialize community structures for map '{}': {}", map_id, e))?;

                        // Wrap in cache with current timestamp
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs() as i64;

                        let cache = CommunityStructuresCache {
                            structures,
                            fetched_at: now,
                        };

                        // Save in new format
                        let serialized = serde_json::to_string_pretty(&cache)
                            .map_err(|e| format!("Failed to serialize updated cache: {}", e))?;
                        fs::write(&structures_path, serialized)
                            .map_err(|e| format!("Failed to write updated cache: {}", e))?;

                        println!("Converted legacy cache to new format");
                        Ok(Some(cache))
                    }
                }
            } else {
                Ok(None)
            }
        }
        Err(e) => Err(e),
    }
}

fn save_community_structures(_map_id: &str, structures: Vec<CommunityStructure>, file_name: &str) -> Result<(), String> {
    let config_dir = config_dir_path()?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let structures_path = config_dir.join(file_name);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let cache = CommunityStructuresCache {
        structures,
        fetched_at: now,
    };

    let serialized = serde_json::to_string_pretty(&cache)
        .map_err(|e| format!("Failed to serialize community structures: {}", e))?;

    fs::write(&structures_path, serialized)
        .map_err(|e| format!("Failed to write {}: {}", file_name, e))?;

    println!("Community structures saved to {:?}", structures_path);
    Ok(())
}

#[tauri::command]
pub fn fetch_community_deeds(url: String) -> Result<Vec<CommunityDeed>, String> {
    // Fetch the HTML
    let client = reqwest::blocking::Client::new();
    let response = client.get(&url).send()
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;
    let html = response.text()
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Find window.sheetData
    let start_marker = "window.sheetData = ";
    let start = html.find(start_marker)
        .ok_or("window.sheetData not found")?;
    let json_start = start + start_marker.len();
    let end = html[json_start..].find(';')
        .map(|i| json_start + i)
        .ok_or("End of sheetData not found")?;
    let json_str = html[json_start..end].trim();

    // Parse JSON
    let data: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Extract values
    let values = data["valueRanges"][0]["values"]
        .as_array()
        .ok_or("Invalid data structure")?;

    println!("Total values: {}", values.len());

    let deeds: Vec<CommunityDeed> = values.iter()
        .enumerate()
        .filter_map(|(i, row)| {
            let arr = match row.as_array() {
                Some(a) => a,
                None => {
                    println!("Row {} is not an array: {:?}", i, row);
                    return None;
                }
            };
            if arr.len() < 3 { 
                println!("Skipping row {}: len {}", i, arr.len());
                return None;
            }
            // Skip if first row looks like headers
            if i == 0 && arr[0].as_str() == Some("Name") {
                println!("Skipping header row");
                return None;
            }
            let name = match arr[0].as_str() {
                Some(s) => s,
                None => {
                    println!("Row {} name not string: {:?}", i, arr[0]);
                    return None;
                }
            };
            let x_str = match arr[1].as_str() {
                Some(s) => s,
                None => {
                    println!("Row {} x not string: {:?}", i, arr[1]);
                    return None;
                }
            };
            let y_str = match arr[2].as_str() {
                Some(s) => s,
                None => {
                    println!("Row {} y not string: {:?}", i, arr[2]);
                    return None;
                }
            };
            let deed_type = arr.get(3).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let x = match x_str.parse() {
                Ok(n) => n,
                Err(_) => {
                    println!("Row {} x parse fail: {}", i, x_str);
                    return None;
                }
            };
            let y = match y_str.parse() {
                Ok(n) => n,
                Err(_) => {
                    println!("Row {} y parse fail: {}", i, y_str);
                    return None;
                }
            };
            Some(CommunityDeed {
                name: name.to_string(),
                coords: [x, y],
                deed_type: deed_type.to_string(),
                extra: arr.get(4).and_then(|v| v.as_str()).map(|s| s.to_string()),
            })
        })
        .collect();

    println!("Collected deeds: {}", deeds.len());

    Ok(deeds)
}

#[tauri::command]
pub fn fetch_community_guard_towers(url: String) -> Result<Vec<CommunityStructure>, String> {
    fetch_community_structures(url, "GuardTowerFreedom")
}

#[tauri::command]
pub fn fetch_community_mission_structures(url: String) -> Result<Vec<CommunityStructure>, String> {
    fetch_community_structures(url, "MissionStructure")
}

fn fetch_community_structures(url: String, structure_type_filter: &str) -> Result<Vec<CommunityStructure>, String> {
    // Fetch the HTML
    let client = reqwest::blocking::Client::new();
    let response = client.get(&url).send()
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;
    let html = response.text()
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Find window.sheetData
    let start_marker = "window.sheetData = ";
    let start = html.find(start_marker)
        .ok_or("window.sheetData not found")?;
    let json_start = start + start_marker.len();
    let end = html[json_start..].find(';')
        .map(|i| json_start + i)
        .ok_or("End of sheetData not found")?;
    let json_str = html[json_start..end].trim();

    // Parse JSON
    let data: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Extract values from valueRanges[5] (structures)
    let values = data["valueRanges"][5]["values"]
        .as_array()
        .ok_or("Invalid data structure - valueRanges[5] not found")?;

    println!("Total structures values: {}", values.len());

    let structures: Vec<CommunityStructure> = values.iter()
        .enumerate()
        .filter_map(|(i, row)| {
            let arr = match row.as_array() {
                Some(a) => a,
                None => {
                    println!("Row {} is not an array: {:?}", i, row);
                    return None;
                }
            };
            if arr.len() < 4 {
                println!("Skipping row {}: len {}", i, arr.len());
                return None;
            }
            // Skip if first row looks like headers
            if i == 0 && arr[0].as_str() == Some("Name") {
                println!("Skipping header row");
                return None;
            }
            let name = match arr[0].as_str() {
                Some(s) => s,
                None => {
                    println!("Row {} name not string: {:?}", i, arr[0]);
                    return None;
                }
            };
            let x_str = match arr[1].as_str() {
                Some(s) => s,
                None => {
                    println!("Row {} x not string: {:?}", i, arr[1]);
                    return None;
                }
            };
            let y_str = match arr[2].as_str() {
                Some(s) => s,
                None => {
                    println!("Row {} y not string: {:?}", i, arr[2]);
                    return None;
                }
            };
            let structure_type = match arr[3].as_str() {
                Some(s) => s,
                None => {
                    println!("Row {} structure_type not string: {:?}", i, arr[3]);
                    return None;
                }
            };

            // Filter by the requested structure type
            if structure_type != structure_type_filter {
                return None;
            }

            let x = match x_str.parse() {
                Ok(n) => n,
                Err(_) => {
                    println!("Row {} x parse fail: {}", i, x_str);
                    return None;
                }
            };
            let y = match y_str.parse() {
                Ok(n) => n,
                Err(_) => {
                    println!("Row {} y parse fail: {}", i, y_str);
                    return None;
                }
            };
            Some(CommunityStructure {
                name: name.to_string(),
                coords: [x, y],
                structure_type: structure_type.to_string(),
            })
        })
        .collect();

    println!("Collected {} structures of type {}: {}", structures.len(), structure_type_filter, structures.len());

    Ok(structures)
}