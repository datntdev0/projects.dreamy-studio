use super::*;
use serde_json::json;

fn screen() -> WindowBounds {
    WindowBounds::new(0, 0, 1920, 1080)
}

fn settings(x: i32, y: i32, width: u32, height: u32) -> WindowSettings {
    WindowSettings::new(WindowBounds::new(x, y, width, height), false)
}

#[test]
fn a_window_inside_a_monitor_is_reachable() {
    assert!(settings(100, 80, 1280, 800).is_reachable(&[screen()]));
}

#[test]
fn a_window_on_a_secondary_monitor_is_reachable_while_it_exists() {
    let second = WindowBounds::new(1920, 0, 1920, 1080);
    let window = settings(2000, 100, 1280, 800);
    assert!(window.is_reachable(&[screen(), second]));
    assert!(!window.is_reachable(&[screen()]));
}

#[test]
fn a_window_that_only_touches_the_edge_is_not_reachable() {
    assert!(!settings(1900, 100, 1280, 800).is_reachable(&[screen()]));
    assert!(!settings(100, 1060, 1280, 800).is_reachable(&[screen()]));
}

#[test]
fn a_window_partly_off_screen_is_reachable_when_enough_is_visible() {
    assert!(settings(-1000, 100, 1280, 800).is_reachable(&[screen()]));
}

#[test]
fn an_empty_window_or_no_monitor_is_not_reachable() {
    assert!(!settings(0, 0, 0, 800).is_reachable(&[screen()]));
    assert!(!settings(0, 0, 1280, 0).is_reachable(&[screen()]));
    assert!(!settings(0, 0, 1280, 800).is_reachable(&[]));
}

#[test]
fn bounds_round_trip_through_settings() {
    let bounds = WindowBounds::new(-5, 7, 960, 540);
    assert_eq!(WindowSettings::new(bounds, true).bounds(), bounds);
}

#[test]
fn maximized_defaults_to_false_when_missing() {
    let parsed: WindowSettings =
        serde_json::from_value(json!({ "x": 1, "y": 2, "width": 3, "height": 4 })).unwrap();
    assert!(!parsed.maximized);
}
