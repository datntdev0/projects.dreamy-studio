use std::path::Path;
use std::path::PathBuf;

pub const DATA_DIR_VAR: &str = "DREAMYSTUDIO_DATA_DIR";
pub const PORTABLE_MARKER: &str = "portable.txt";
pub const PORTABLE_DATA_DIR: &str = "data";
pub const WEBVIEW_DATA_VAR: &str = "WEBVIEW2_USER_DATA_FOLDER";

pub fn portable_data_dir_from(executable: &Path) -> Option<PathBuf> {
    let directory = executable.parent()?;
    if directory.join(PORTABLE_MARKER).is_file() {
        Some(directory.join(PORTABLE_DATA_DIR))
    } else {
        None
    }
}

pub fn portable_data_dir() -> Option<PathBuf> {
    portable_data_dir_from(&std::env::current_exe().ok()?)
}

pub fn isolate_webview_data() {
    if std::env::var_os(WEBVIEW_DATA_VAR).is_some() {
        return;
    }
    if let Some(root) = portable_data_dir() {
        unsafe { std::env::set_var(WEBVIEW_DATA_VAR, root.join("webview")) };
    }
}

pub fn data_dir_from(value: Option<String>) -> Option<PathBuf> {
    value
        .filter(|value| !value.trim().is_empty())
        .map(|value| absolute(PathBuf::from(value)))
}

pub fn data_dir() -> Option<PathBuf> {
    data_dir_from(std::env::var(DATA_DIR_VAR).ok())
}

fn absolute(path: PathBuf) -> PathBuf {
    std::path::absolute(&path).unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_value() {
        let found = data_dir_from(Some("data/ds".to_string()));
        assert_eq!(found, Some(std::path::absolute("data/ds").unwrap()));
    }

    #[test]
    fn is_absent_without_the_variable() {
        assert_eq!(data_dir_from(None), None);
    }

    #[test]
    fn ignores_an_empty_value() {
        assert_eq!(data_dir_from(Some(String::new())), None);
        assert_eq!(data_dir_from(Some("  ".to_string())), None);
    }

    #[test]
    fn portable_directory_requires_the_marker() {
        let dir = std::env::temp_dir().join(format!("dreamy-portable-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let executable = dir.join("DreamyStudio.exe");
        assert_eq!(portable_data_dir_from(&executable), None);

        std::fs::write(dir.join(PORTABLE_MARKER), "").unwrap();
        assert_eq!(
            portable_data_dir_from(&executable),
            Some(dir.join(PORTABLE_DATA_DIR))
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn makes_relative_values_absolute() {
        let found = data_dir_from(Some("relative".to_string())).unwrap();
        assert!(found.is_absolute());
        assert!(found.ends_with("relative"));
    }
}
