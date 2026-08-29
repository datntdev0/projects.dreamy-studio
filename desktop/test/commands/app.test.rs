use super::*;
use crate::testing::app::MockHost;
use serde_json::json;

#[test]
fn serializes_name_and_version() {
    let info = AppInfo::new("Dreamy Studio", "0.0.0");

    let value = serde_json::to_value(&info).unwrap();

    assert_eq!(
        value,
        json!({ "name": "Dreamy Studio", "version": "0.0.0" })
    );
}

#[test]
fn app_info_reports_the_package_name_and_version() {
    let host = MockHost::new();
    let handle = host.handle();
    let package = handle.package_info();
    let expected = AppInfo::new(package.name.clone(), package.version.to_string());

    assert_eq!(app_info(handle), expected);
}
