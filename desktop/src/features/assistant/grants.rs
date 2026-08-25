use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantScope;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use uuid::Uuid;

pub trait TurnSink: Send + Sync {
    fn record(&self, label: String);
    fn changed(&self, change: AssistantChange);
}

#[derive(Clone)]
pub struct Grant {
    pub workspace: String,
    pub scope: AssistantScope,
    pub can_edit: bool,
    pub sink: Arc<dyn TurnSink>,
}

#[derive(Clone, Default)]
pub struct McpGrants {
    inner: Arc<Mutex<HashMap<String, Grant>>>,
}

impl McpGrants {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn issue(&self, grant: Grant) -> String {
        let token = Uuid::new_v4().to_string();
        self.lock().insert(token.clone(), grant);
        token
    }

    pub fn get(&self, token: &str) -> Option<Grant> {
        self.lock().get(token).cloned()
    }

    pub fn revoke(&self, token: &str) {
        self.lock().remove(token);
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Grant>> {
        self.inner.lock().unwrap_or_else(|error| error.into_inner())
    }
}

#[cfg(test)]
#[path = "../../../test/features/assistant/grants.test.rs"]
mod tests;
