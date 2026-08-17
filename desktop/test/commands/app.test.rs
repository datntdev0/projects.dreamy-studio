use super::AppInfo;
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
