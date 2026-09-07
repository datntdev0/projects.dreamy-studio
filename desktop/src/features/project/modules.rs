use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectResult;

pub const MODULES: [&str; 7] = [
    "scripting",
    "character",
    "world",
    "storyboard",
    "audiobook",
    "canvas",
    "video",
];

const AUDIOBOOK_MODULES: [&str; 2] = ["scripting", "audiobook"];
const FILMSERIES_MODULES: [&str; 6] = [
    "scripting",
    "character",
    "world",
    "storyboard",
    "canvas",
    "video",
];

pub fn template_modules(template: &str) -> &'static [&'static str] {
    match template {
        "audiobook" => &AUDIOBOOK_MODULES,
        "filmseries" => &FILMSERIES_MODULES,
        _ => &[],
    }
}

pub fn effective_modules(template: &str, extra: &[String]) -> Vec<String> {
    let required = template_modules(template);
    MODULES
        .iter()
        .filter(|id| required.contains(id) || extra.iter().any(|value| value == *id))
        .map(|id| (*id).to_string())
        .collect()
}

pub fn extra_modules(template: &str, requested: &[String]) -> ProjectResult<Vec<String>> {
    if let Some(unknown) = requested
        .iter()
        .find(|value| !MODULES.contains(&value.as_str()))
    {
        return Err(ProjectError::invalid(format!("unknown module {unknown}")));
    }
    let required = template_modules(template);
    Ok(MODULES
        .iter()
        .filter(|id| !required.contains(id) && requested.iter().any(|value| value == *id))
        .map(|id| (*id).to_string())
        .collect())
}

pub fn decode_modules(raw: &str) -> Vec<String> {
    serde_json::from_str(raw).unwrap_or_default()
}

pub fn encode_modules(modules: &[String]) -> String {
    serde_json::to_string(modules).unwrap_or_else(|_| "[]".to_string())
}

#[cfg(test)]
#[path = "../../../test/features/project/modules.test.rs"]
mod tests;
