use super::*;
use crate::commands::workspace::MAIN_WINDOW_LABEL;
use crate::testing::app::MockHost;

fn main_window(host: &MockHost) -> WebviewWindow<tauri::test::MockRuntime> {
    host.handle().get_webview_window(MAIN_WINDOW_LABEL).unwrap()
}

fn saved(maximized: bool) -> WindowSettings {
    WindowSettings::new(WindowBounds::new(10, 20, 800, 600), maximized)
}

#[test]
fn background_follows_the_theme() {
    let host = MockHost::with_window(MAIN_WINDOW_LABEL);

    apply_background(&main_window(&host), Theme::Light);
    apply_background(&main_window(&host), Theme::Dark);
}

#[test]
fn remembered_bounds_are_kept_and_saved_on_persist() {
    let host = MockHost::with_window(MAIN_WINDOW_LABEL);
    let window = main_window(&host);
    let remembered: Remembered = Arc::new(Mutex::new(None));

    remember(&window, &remembered);
    persist(&host.handle(), &window, &remembered);

    assert!(lock(&remembered).is_some());
    let app = host.handle();
    let service = app.state::<SettingsService>();
    assert!(service.window().is_some());
}

#[test]
fn persist_falls_back_to_the_saved_window_when_nothing_is_remembered() {
    let host = MockHost::with_window(MAIN_WINDOW_LABEL);
    let window = main_window(&host);
    let app = host.handle();
    let service = app.state::<SettingsService>();
    service.save_window(saved(false)).unwrap();
    let remembered: Remembered = Arc::new(Mutex::new(None));

    persist(&host.handle(), &window, &remembered);

    assert!(service.window().is_some());
}

#[test]
fn window_events_remember_the_bounds_and_ignore_other_events() {
    let host = MockHost::with_window(MAIN_WINDOW_LABEL);
    let window = main_window(&host);
    let remembered: Remembered = Arc::new(Mutex::new(None));

    handle(
        &host.handle(),
        &window,
        &remembered,
        &WindowEvent::Focused(true),
    );
    assert!(lock(&remembered).is_none());
    handle(
        &host.handle(),
        &window,
        &remembered,
        &WindowEvent::Moved(PhysicalPosition::new(1, 2)),
    );
    assert!(lock(&remembered).is_some());
    *lock(&remembered) = None;
    handle(
        &host.handle(),
        &window,
        &remembered,
        &WindowEvent::Resized(PhysicalSize::new(300, 200)),
    );

    assert!(lock(&remembered).is_some());
}

#[test]
fn prepare_without_saved_settings_shows_the_window() {
    let host = MockHost::with_window(MAIN_WINDOW_LABEL);

    prepare(&main_window(&host), &host.handle(), None);

    assert!(main_window(&host).is_visible().unwrap());
}

#[test]
fn prepare_with_saved_settings_shows_the_window() {
    let host = MockHost::with_window(MAIN_WINDOW_LABEL);

    prepare(&main_window(&host), &host.handle(), Some(saved(true)));

    assert!(main_window(&host).is_visible().unwrap());
}

#[test]
fn monitor_bounds_lists_the_available_monitors() {
    let host = MockHost::with_window(MAIN_WINDOW_LABEL);

    let monitors = monitor_bounds(&main_window(&host));

    assert!(monitors.len() <= 1);
}

#[test]
fn current_bounds_are_known_for_a_normal_window() {
    let host = MockHost::with_window(MAIN_WINDOW_LABEL);

    assert!(current_bounds(&main_window(&host)).is_some());
}
