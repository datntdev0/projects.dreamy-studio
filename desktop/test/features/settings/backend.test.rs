use super::*;
use crate::features::settings::models::AppSettings;
use serde_json::json;

#[test]
fn devices_parse_from_their_names() {
    assert_eq!(Device::parse("cpu"), Ok(Device::Cpu));
    assert_eq!(Device::parse("cuda"), Ok(Device::Cuda));
    assert!(Device::parse("CUDA").is_err());
    assert_eq!(Device::Cuda.as_str(), "cuda");
    assert_eq!(Device::Cpu.as_str(), "cpu");
}

#[test]
fn the_device_defaults_to_cpu() {
    assert_eq!(BackendSettings::default().device(), Device::Cpu);
}

#[test]
fn invalid_backend_values_are_ignored() {
    let settings: AppSettings =
        serde_json::from_value(json!({ "backend": { "device": "tpu" } })).unwrap();
    assert_eq!(settings.backend.device, None);

    let settings: AppSettings = serde_json::from_value(json!({ "backend": 3 })).unwrap();
    assert!(settings.backend.is_empty());
}

#[test]
fn the_backend_section_round_trips_and_is_omitted_when_empty() {
    let settings: AppSettings =
        serde_json::from_value(json!({ "backend": { "device": "cuda" }, "other": true })).unwrap();
    assert_eq!(settings.backend.device(), Device::Cuda);

    let value = serde_json::to_value(&settings).unwrap();
    assert_eq!(value["backend"], json!({ "device": "cuda" }));
    assert_eq!(value["other"], true);

    let mixed: AppSettings =
        serde_json::from_value(json!({ "backend": { "device": "cpu", "port": 9 } })).unwrap();
    let value = serde_json::to_value(&mixed).unwrap();
    assert_eq!(value["backend"], json!({ "device": "cpu", "port": 9 }));

    let empty = serde_json::to_value(AppSettings::default()).unwrap();
    assert!(empty.get("backend").is_none());
}
