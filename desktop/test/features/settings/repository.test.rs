use super::*;
use crate::features::settings::models::GeneralSettings;
use crate::features::settings::models::Language;
use crate::features::settings::models::Theme;
use serde_json::json;
use tempfile::TempDir;

fn repository(dir: &TempDir) -> SettingsRepository {
    SettingsRepository::new(dir.path().join(SETTINGS_FILE))
}

fn general(language: Language, theme: Theme) -> GeneralSettings {
    GeneralSettings {
        language: Some(language),
        theme: Some(theme),
    }
}

#[test]
fn loads_defaults_when_the_file_is_missing() {
    let dir = TempDir::new().unwrap();
    assert_eq!(repository(&dir).load().unwrap(), AppSettings::default());
}

#[test]
fn saves_and_loads_the_general_section() {
    let dir = TempDir::new().unwrap();
    let repo = repository(&dir);
    let mut settings = AppSettings::default();
    settings.general = general(Language::En, Theme::Light);
    repo.save(&settings).unwrap();
    assert_eq!(repo.load().unwrap(), settings);
    let text = fs::read_to_string(repo.path()).unwrap();
    let value: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(
        value,
        json!({ "general": { "language": "en", "theme": "light" } })
    );
}

#[test]
fn creates_the_parent_directory_and_leaves_no_temp_file() {
    let dir = TempDir::new().unwrap();
    let repo = SettingsRepository::new(dir.path().join("nested").join(SETTINGS_FILE));
    repo.save(&AppSettings::default()).unwrap();
    assert!(repo.path().is_file());
    assert!(!repo.sibling(TEMP_SUFFIX).exists());
}

#[test]
fn keeps_sections_it_does_not_know() {
    let dir = TempDir::new().unwrap();
    let repo = repository(&dir);
    fs::write(
        repo.path(),
        r#"{"backend":{"provider":"x"},"general":{"theme":"dark"}}"#,
    )
    .unwrap();
    let mut settings = repo.load().unwrap();
    settings.general.language = Some(Language::Vi);
    repo.save(&settings).unwrap();
    let value: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(repo.path()).unwrap()).unwrap();
    assert_eq!(value["backend"], json!({ "provider": "x" }));
    assert_eq!(
        value["general"],
        json!({ "language": "vi", "theme": "dark" })
    );
}

#[test]
fn ignores_unknown_values_without_dropping_the_rest() {
    let dir = TempDir::new().unwrap();
    let repo = repository(&dir);
    fs::write(
        repo.path(),
        r#"{"general":{"language":"fr","theme":"light"}}"#,
    )
    .unwrap();
    let loaded = repo.load().unwrap();
    assert_eq!(loaded.general.language, None);
    assert_eq!(loaded.general.theme, Some(Theme::Light));
}

#[test]
fn sets_an_unreadable_file_aside_and_starts_over() {
    let dir = TempDir::new().unwrap();
    let repo = repository(&dir);
    fs::write(repo.path(), "{ not json").unwrap();
    assert_eq!(repo.load().unwrap(), AppSettings::default());
    assert!(!repo.path().exists());
    assert_eq!(
        fs::read_to_string(repo.sibling(INVALID_SUFFIX)).unwrap(),
        "{ not json"
    );
}
