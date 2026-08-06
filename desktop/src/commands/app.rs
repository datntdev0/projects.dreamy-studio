use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

impl AppInfo {
    pub fn new(name: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            version: version.into(),
        }
    }
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    let package = app.package_info();
    AppInfo::new(package.name.clone(), package.version.to_string())
}

#[cfg(test)]
mod tests {
    use super::AppInfo;
    use serde_json::json;

    #[test]
    fn serializes_name_and_version() {
        let info = AppInfo::new("Dreamy Studio", "0.1.0");

        let value = serde_json::to_value(&info).unwrap();

        assert_eq!(
            value,
            json!({ "name": "Dreamy Studio", "version": "0.1.0" })
        );
    }
}
