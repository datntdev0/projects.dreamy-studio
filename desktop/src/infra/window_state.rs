use crate::features::settings::models::Theme;
use crate::features::settings::service::SettingsService;
use crate::features::settings::window::WindowBounds;
use crate::features::settings::window::WindowSettings;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Monitor;
use tauri::PhysicalPosition;
use tauri::PhysicalSize;
use tauri::WebviewWindow;
use tauri::WindowEvent;
use tauri::window::Color;

type Remembered = Arc<Mutex<Option<WindowBounds>>>;

pub fn apply_background(window: &WebviewWindow, theme: Theme) {
    let (red, green, blue) = theme.background();
    if let Err(error) = window.set_background_color(Some(Color(red, green, blue, 255))) {
        eprintln!("cannot set window background: {error}");
    }
}

pub fn prepare(window: &WebviewWindow, app: &AppHandle, saved: Option<WindowSettings>) {
    if let Some(saved) = saved {
        restore(window, &saved);
    }
    let initial = current_bounds(window).or(saved.map(|saved| saved.bounds()));
    watch(window, app, initial);
    if let Err(error) = window.show() {
        eprintln!("cannot show window: {error}");
    }
}

fn restore(window: &WebviewWindow, saved: &WindowSettings) {
    if saved.is_reachable(&monitor_bounds(window)) {
        let _ = window.set_size(PhysicalSize::new(saved.width, saved.height));
        let _ = window.set_position(PhysicalPosition::new(saved.x, saved.y));
    }
    if saved.maximized {
        let _ = window.maximize();
    }
}

fn monitor_bounds(window: &WebviewWindow) -> Vec<WindowBounds> {
    let monitors = window.available_monitors().unwrap_or_default();
    monitors.iter().map(bounds_of_monitor).collect()
}

fn bounds_of_monitor(monitor: &Monitor) -> WindowBounds {
    let position = monitor.position();
    let size = monitor.size();
    WindowBounds::new(position.x, position.y, size.width, size.height)
}

fn current_bounds(window: &WebviewWindow) -> Option<WindowBounds> {
    if window.is_minimized().unwrap_or(false) || window.is_maximized().unwrap_or(false) {
        return None;
    }
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    Some(WindowBounds::new(
        position.x,
        position.y,
        size.width,
        size.height,
    ))
}

fn watch(window: &WebviewWindow, app: &AppHandle, initial: Option<WindowBounds>) {
    let remembered: Remembered = Arc::new(Mutex::new(initial));
    let target = window.clone();
    let app = app.clone();
    window.on_window_event(move |event| handle(&app, &target, &remembered, event));
}

fn handle(app: &AppHandle, window: &WebviewWindow, remembered: &Remembered, event: &WindowEvent) {
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => remember(window, remembered),
        WindowEvent::CloseRequested { .. } => persist(app, window, remembered),
        _ => {}
    }
}

fn remember(window: &WebviewWindow, remembered: &Remembered) {
    if let Some(bounds) = current_bounds(window) {
        *lock(remembered) = Some(bounds);
    }
}

fn persist(app: &AppHandle, window: &WebviewWindow, remembered: &Remembered) {
    remember(window, remembered);
    let service = app.state::<SettingsService>();
    let known = *lock(remembered);
    let bounds = known.or_else(|| service.window().map(|saved| saved.bounds()));
    let Some(bounds) = bounds else {
        return;
    };
    let maximized = window.is_maximized().unwrap_or(false);
    if let Err(error) = service.save_window(WindowSettings::new(bounds, maximized)) {
        eprintln!("cannot save window state: {error}");
    }
}

fn lock(remembered: &Remembered) -> MutexGuard<'_, Option<WindowBounds>> {
    remembered
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
