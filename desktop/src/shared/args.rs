use std::path::PathBuf;

pub const DATA_DIR_FLAG: &str = "--data-dir";

pub fn data_dir_from<I>(args: I) -> Option<PathBuf>
where
    I: IntoIterator<Item = String>,
{
    let prefix = format!("{DATA_DIR_FLAG}=");
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let value = match arg.strip_prefix(&prefix) {
            Some(inline) => Some(inline.to_string()),
            None if arg == DATA_DIR_FLAG => args.next(),
            None => None,
        };
        if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
            return Some(absolute(PathBuf::from(value)));
        }
    }
    None
}

pub fn data_dir() -> Option<PathBuf> {
    data_dir_from(std::env::args().skip(1))
}

fn absolute(path: PathBuf) -> PathBuf {
    std::path::absolute(&path).unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }

    fn expected() -> PathBuf {
        std::path::absolute("data/ds").unwrap()
    }

    #[test]
    fn reads_a_separate_value() {
        let found = data_dir_from(args(&["--data-dir", "data/ds"]));
        assert_eq!(found, Some(expected()));
    }

    #[test]
    fn reads_an_inline_value() {
        let found = data_dir_from(args(&["--other", "--data-dir=data/ds"]));
        assert_eq!(found, Some(expected()));
    }

    #[test]
    fn is_absent_without_the_flag() {
        assert_eq!(data_dir_from(args(&["--other", "value"])), None);
        assert_eq!(data_dir_from(args(&[])), None);
    }

    #[test]
    fn ignores_a_flag_without_a_value() {
        assert_eq!(data_dir_from(args(&["--data-dir"])), None);
        assert_eq!(data_dir_from(args(&["--data-dir="])), None);
        assert_eq!(data_dir_from(args(&["--data-dir", "  "])), None);
    }

    #[test]
    fn makes_relative_values_absolute() {
        let found = data_dir_from(args(&["--data-dir", "relative"])).unwrap();
        assert!(found.is_absolute());
        assert!(found.ends_with("relative"));
    }
}
