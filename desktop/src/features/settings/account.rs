use crate::features::settings::llm::CliSpec;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::Value;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccountSource {
    Field {
        file: &'static str,
        pointer: &'static str,
    },
    TokenClaim {
        file: &'static str,
        pointer: &'static str,
        claim: &'static str,
    },
}

pub fn profile_account(spec: &CliSpec, data_dir: &Path) -> Option<String> {
    let profile = spec.profile_dir(data_dir);
    match spec.account? {
        AccountSource::Field { file, pointer } => {
            text_at(&read_json(&profile.join(file))?, pointer)
        }
        AccountSource::TokenClaim {
            file,
            pointer,
            claim,
        } => {
            let token = text_at(&read_json(&profile.join(file))?, pointer)?;
            text_at(&token_claims(&token)?, &format!("/{claim}"))
        }
    }
}

fn read_json(path: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn text_at(value: &Value, pointer: &str) -> Option<String> {
    let text = value.pointer(pointer)?.as_str()?.trim();
    (!text.is_empty()).then(|| text.to_string())
}

fn token_claims(token: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?.trim_end_matches('=');
    let bytes = URL_SAFE_NO_PAD.decode(payload).ok()?;
    serde_json::from_slice(&bytes).ok()
}
