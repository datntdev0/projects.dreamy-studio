use super::*;

#[test]
fn starts_stopped_without_a_port() {
    let monitor = BackendMonitor::new();

    assert_eq!(monitor.state(), MonitorState::Stopped);
    assert_eq!(monitor.port(), None);
}

#[test]
fn exposes_the_port_only_while_running() {
    let monitor = BackendMonitor::new();

    monitor.set(MonitorState::Running(5000));
    assert_eq!(monitor.port(), Some(5000));

    monitor.set(MonitorState::Starting);
    assert_eq!(monitor.port(), None);
}

#[test]
fn clones_share_the_same_state() {
    let monitor = BackendMonitor::new();
    let other = monitor.clone();

    other.set(MonitorState::Error("boom".to_string()));

    assert_eq!(monitor.state(), MonitorState::Error("boom".to_string()));
}

#[test]
fn lose_marks_only_the_matching_running_port_as_failed() {
    let monitor = BackendMonitor::new();
    monitor.set(MonitorState::Running(5000));

    monitor.lose(6000, "gone".to_string());
    assert_eq!(monitor.state(), MonitorState::Running(5000));

    monitor.lose(5000, "gone".to_string());
    assert_eq!(monitor.state(), MonitorState::Error("gone".to_string()));

    monitor.set(MonitorState::Starting);
    monitor.lose(5000, "late".to_string());
    assert_eq!(monitor.state(), MonitorState::Starting);
}
