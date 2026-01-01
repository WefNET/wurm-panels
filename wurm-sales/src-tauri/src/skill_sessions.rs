use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Clone, Serialize, Deserialize)]
pub struct SkillSessionData {
    pub skill_name: String,
    pub start_level: f64,
    pub session_gain: f64,
    pub last_gain: f64,
}

pub type SharedSkillSessions = Arc<Mutex<HashMap<String, SkillSessionData>>>;

pub fn new_store() -> SharedSkillSessions {
    Arc::new(Mutex::new(HashMap::new()))
}
