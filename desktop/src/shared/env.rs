use std::path::PathBuf;

pub const DATA_DIR_VAR: &str = "DREAMYSTUDIO_DATA_DIR";

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
    fn makes_relative_values_absolute() {
        let found = data_dir_from(Some("relative".to_string())).unwrap();
        assert!(found.is_absolute());
        assert!(found.ends_with("relative"));
    }
}
