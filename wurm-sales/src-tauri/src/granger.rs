use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Clone, Serialize, Deserialize)]
pub struct GrangerAnimal {
    pub id: String,
    pub name: String,
    pub descriptors: Vec<String>,
    pub age: Option<String>,
    pub custom_label: Option<String>,
    pub species: Option<String>,
    pub settlement: Option<String>,
    pub caretaker: Option<String>,
    pub condition: Option<String>,
    pub traits: Vec<String>,
    pub trait_points: Option<u32>,
    pub colour: Option<String>,
    pub updated_at: String,
}

pub type SharedGrangerEntries = Arc<Mutex<BTreeMap<String, GrangerAnimal>>>;

const GRANGER_FILE_NAME: &str = "granger.json";

pub fn new_store_with(initial: BTreeMap<String, GrangerAnimal>) -> SharedGrangerEntries {
    Arc::new(Mutex::new(initial))
}

pub fn to_vec(entries: &BTreeMap<String, GrangerAnimal>) -> Vec<GrangerAnimal> {
    entries.values().cloned().collect()
}

pub fn load_from_disk() -> BTreeMap<String, GrangerAnimal> {
    match config_dir_path() {
        Ok(dir) => {
            let path = dir.join(GRANGER_FILE_NAME);
            match fs::read_to_string(&path) {
                Ok(raw) => match serde_json::from_str::<Vec<GrangerAnimal>>(&raw) {
                    Ok(items) => items
                        .into_iter()
                        .map(|animal| (animal.id.clone(), animal))
                        .collect(),
                    Err(err) => {
                        println!("Failed to deserialize granger data: {}", err);
                        BTreeMap::new()
                    }
                },
                Err(err) => {
                    if err.kind() != std::io::ErrorKind::NotFound {
                        println!("Failed to read granger data: {}", err);
                    }
                    BTreeMap::new()
                }
            }
        }
        Err(err) => {
            println!(
                "Failed to resolve config directory for granger data: {}",
                err
            );
            BTreeMap::new()
        }
    }
}

pub fn persist(entries: &BTreeMap<String, GrangerAnimal>) -> Result<(), String> {
    let dir = config_dir_path()?;

    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|err| format!("Failed to create config directory: {}", err))?;
    }

    let path = dir.join(GRANGER_FILE_NAME);
    let serialized = serde_json::to_string_pretty(&to_vec(entries))
        .map_err(|err| format!("Failed to serialize granger data: {}", err))?;

    fs::write(&path, serialized).map_err(|err| format!("Failed to write granger data: {}", err))?;

    Ok(())
}

fn config_dir_path() -> Result<PathBuf, String> {
    ProjectDirs::from("com", "WefNET", "wurm-sales")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .ok_or_else(|| "Unable to resolve configuration directory".to_string())
}
