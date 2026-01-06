use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

#[derive(Clone, Serialize, Deserialize)]
pub struct GrangerAnimal {
    pub id: String,
    pub name: String,
    pub descriptors: Vec<String>,
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

pub fn new_store() -> SharedGrangerEntries {
    Arc::new(Mutex::new(BTreeMap::new()))
}

pub fn to_vec(entries: &BTreeMap<String, GrangerAnimal>) -> Vec<GrangerAnimal> {
    entries.values().cloned().collect()
}
