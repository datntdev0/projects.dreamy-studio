#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedPath {
    pub path: String,
    pub key: String,
    pub name: String,
}

impl NormalizedPath {
    pub fn new(chosen: &str) -> Self {
        let path = normalize(chosen);
        let key = path_key(&path);
        let name = folder_name(&path);
        Self { path, key, name }
    }
}

fn is_separator(character: char) -> bool {
    character == '\\' || character == '/'
}

fn is_drive_prefix(text: &str) -> bool {
    let mut characters = text.chars();
    match (characters.next(), characters.next(), characters.next()) {
        (Some(letter), Some(':'), None) => letter.is_ascii_alphabetic(),
        _ => false,
    }
}

fn is_drive_root(path: &str) -> bool {
    match path.char_indices().nth(2) {
        Some((index, separator)) => {
            is_drive_prefix(&path[..index]) && is_separator(separator) && path.len() == index + 1
        }
        None => false,
    }
}

pub fn normalize(chosen: &str) -> String {
    let trimmed = chosen.trim_end_matches(is_separator);
    if trimmed.len() == chosen.len() {
        return chosen.to_string();
    }
    let separator = &chosen[trimmed.len()..trimmed.len() + 1];
    if trimmed.is_empty() || is_drive_prefix(trimmed) {
        return format!("{trimmed}{separator}");
    }
    trimmed.to_string()
}

pub fn path_key(path: &str) -> String {
    path.replace('/', "\\").to_lowercase()
}

pub fn folder_name(path: &str) -> String {
    if is_drive_root(path) || path.chars().all(is_separator) {
        return path.to_string();
    }
    match path.rsplit(is_separator).next() {
        Some(name) if !name.is_empty() => name.to_string(),
        _ => path.to_string(),
    }
}
