use super::*;
use crate::features::settings::llm::CliSettings;
use crate::features::settings::models::Language;
use crate::features::settings::models::RightTab;
use crate::features::settings::models::Theme;
use crate::features::settings::repository::SETTINGS_FILE;
use crate::features::settings::window::WindowBounds;
use tempfile::TempDir;

fn service(dir: &TempDir) -> SettingsService {
    SettingsService::new(SettingsRepository::new(dir.path().join(SETTINGS_FILE)))
}

#[test]
fn starts_with_no_choices() {
    let dir = TempDir::new().unwrap();
    assert_eq!(service(&dir).general(), GeneralSettings::default());
}

#[test]
fn persists_the_saved_general_settings() {
    let dir = TempDir::new().unwrap();
    let general = GeneralSettings {
        language: Some(Language::En),
        theme: Some(Theme::Light),
    };
    let saved = service(&dir).save_general(general.clone()).unwrap();
    assert_eq!(saved, general);
    assert_eq!(service(&dir).general(), general);
}

#[test]
fn view_reports_the_data_directory_and_the_file() {
    let dir = TempDir::new().unwrap();
    let view = service(&dir).view();
    assert_eq!(view.data_dir, dir.path().to_string_lossy());
    assert_eq!(view.file, dir.path().join(SETTINGS_FILE).to_string_lossy());
}

fn layout() -> LayoutSettings {
    LayoutSettings {
        explorer_open: Some(false),
        inspector_open: Some(true),
        bottom_open: Some(true),
        right_tab: Some(RightTab::Assistant),
        explorer_size: Some(300),
        inspector_size: Some(360),
        bottom_size: Some(240),
    }
}

#[test]
fn starts_with_an_empty_layout() {
    let dir = TempDir::new().unwrap();
    assert_eq!(service(&dir).view().layout, LayoutSettings::default());
}

#[test]
fn persists_the_saved_layout_next_to_the_other_sections() {
    let dir = TempDir::new().unwrap();
    let service = service(&dir);
    let window = WindowSettings::new(WindowBounds::new(1, 2, 1280, 800), false);
    service.save_window(window).unwrap();
    assert_eq!(service.save_layout(layout()).unwrap(), layout());
    assert_eq!(service.view().layout, layout());
    assert_eq!(service.window(), Some(window));
    assert_eq!(service.view().layout, layout());
}

#[test]
fn ignores_layout_values_of_the_wrong_type() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join(SETTINGS_FILE);
    std::fs::write(
        &path,
        r#"{"layout":{"explorerOpen":"yes","rightTab":"other","explorerSize":-4,"bottomSize":210}}"#,
    )
    .unwrap();
    let loaded = service(&dir).view().layout;
    assert_eq!(loaded.explorer_open, None);
    assert_eq!(loaded.right_tab, None);
    assert_eq!(loaded.explorer_size, None);
    assert_eq!(loaded.bottom_size, Some(210));
}

#[test]
fn has_no_window_until_one_is_saved() {
    let dir = TempDir::new().unwrap();
    assert_eq!(service(&dir).window(), None);
}

#[test]
fn saving_the_window_keeps_the_general_settings() {
    let dir = TempDir::new().unwrap();
    let general = GeneralSettings {
        language: Some(Language::En),
        theme: Some(Theme::Light),
    };
    let window = WindowSettings::new(WindowBounds::new(10, 20, 1280, 800), true);
    let service = service(&dir);
    service.save_general(general.clone()).unwrap();
    service.save_window(window).unwrap();
    assert_eq!(service.window(), Some(window));
    assert_eq!(service.general(), general);
}

#[test]
fn saving_the_general_settings_keeps_the_window() {
    let dir = TempDir::new().unwrap();
    let window = WindowSettings::new(WindowBounds::new(10, 20, 1280, 800), false);
    let service = service(&dir);
    service.save_window(window).unwrap();
    service.save_general(GeneralSettings::default()).unwrap();
    assert_eq!(service.window(), Some(window));
}

#[test]
fn reports_a_failure_to_write() {
    let dir = TempDir::new().unwrap();
    let blocked = dir.path().join("blocked");
    std::fs::write(&blocked, "file").unwrap();
    let service = SettingsService::new(SettingsRepository::new(blocked.join(SETTINGS_FILE)));
    assert!(service.save_general(GeneralSettings::default()).is_err());
}

#[test]
fn lists_every_cli_with_defaults_before_anything_is_saved() {
    let dir = TempDir::new().unwrap();
    let view = service(&dir).llm_view();
    let ids: Vec<_> = view.providers.iter().map(|provider| provider.id).collect();
    assert_eq!(ids, ["claude", "antigravity", "codex"]);
    assert!(
        view.providers
            .iter()
            .all(|provider| provider.path.is_empty())
    );
}

#[test]
fn gives_each_isolated_cli_a_profile_directory_in_the_data_directory() {
    let dir = TempDir::new().unwrap();
    let view = service(&dir).llm_view();
    let claude = &view.providers[0];
    let expected = dir.path().join("llm").join("claude");
    assert_eq!(claude.profile_env, Some("CLAUDE_CONFIG_DIR"));
    assert_eq!(
        claude.profile_dir,
        Some(expected.to_string_lossy().into_owned())
    );
    let antigravity = &view.providers[1];
    assert_eq!(antigravity.profile_dir, None);
    assert!(!antigravity.can_detect_login);
    assert!(!antigravity.can_logout);
}

#[test]
fn persists_a_cli_and_trims_what_was_typed() {
    let dir = TempDir::new().unwrap();
    let provider = CliSettings {
        path: Some("  C:/tools/claude.cmd ".to_string()),
    };
    service(&dir).save_llm_provider("claude", provider).unwrap();
    let view = service(&dir).llm_view();
    assert_eq!(view.providers[0].path, "C:/tools/claude.cmd");
    assert!(view.providers[2].path.is_empty());
}

#[test]
fn rejects_an_unknown_cli() {
    let dir = TempDir::new().unwrap();
    let service = service(&dir);
    assert!(
        service
            .save_llm_provider("gemini", CliSettings::default())
            .is_err()
    );
    assert!(service.probe_llm("gemini").is_err());
    assert!(service.login_llm("gemini").is_err());
    assert!(service.logout_llm("gemini").is_err());
}

#[test]
fn saving_the_llm_settings_keeps_the_other_sections() {
    let dir = TempDir::new().unwrap();
    let service = service(&dir);
    let general = GeneralSettings {
        language: Some(Language::En),
        theme: Some(Theme::Light),
    };
    service.save_general(general.clone()).unwrap();
    service
        .save_llm_provider("claude", CliSettings::default())
        .unwrap();
    assert_eq!(service.general(), general);
}

#[test]
fn ignores_the_removed_default_enabled_and_args_keys_in_a_stored_file() {
    let dir = TempDir::new().unwrap();
    std::fs::write(
        dir.path().join(SETTINGS_FILE),
        r#"{"llm":{"default":"claude","providers":{"claude":{"enabled":false,"args":"--x","path":"x"}}}}"#,
    )
    .unwrap();
    let view = service(&dir).llm_view();
    assert_eq!(view.providers[0].path, "x");
}

#[test]
fn only_isolated_clis_have_a_profile_directory_to_open() {
    let dir = TempDir::new().unwrap();
    let service = service(&dir);
    let opened = service.llm_profile_dir("codex").unwrap();
    assert!(opened.is_dir());
    assert!(service.llm_profile_dir("antigravity").is_err());
}
