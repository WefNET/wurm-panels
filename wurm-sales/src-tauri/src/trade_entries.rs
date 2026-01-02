use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Clone, Serialize, Deserialize)]
pub struct TradeEntry {
    pub category: String,
    pub timestamp: String,
    pub message: String,
}

pub type SharedTradeEntries = Arc<Mutex<Vec<TradeEntry>>>;

pub fn new_store() -> SharedTradeEntries {
    Arc::new(Mutex::new(Vec::new()))
}

pub fn truncate_entries(entries: &mut Vec<TradeEntry>, max: usize) {
    if entries.len() > max {
        let overflow = entries.len() - max;
        entries.drain(0..overflow);
    }
}
