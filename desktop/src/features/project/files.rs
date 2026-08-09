use crate::features::project::models::DirEntry;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectErrorCode;
use crate::features::project::models::ProjectResult;
use std::fs;
use std::io::ErrorKind;
use std::path::Component;
use std::path::Path;
use std::path::PathBuf;

pub const PROJECTS_DIR: &str = "projects";

#[derive(Debug, Clone)]
pub struct ProjectFiles {
    root: PathBuf,
}

impl ProjectFiles {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn project_dir(&self, folder: &str) -> PathBuf {
        self.root.join(folder)
    }

    pub fn folder_taken(&self, folder: &str) -> bool {
        self.project_dir(folder).exists()
    }

    pub fn create_dir(&self, folder: &str) -> ProjectResult<()> {
        fs::create_dir_all(self.project_dir(folder))?;
        Ok(())
    }

    pub fn remove_dir(&self, folder: &str) -> ProjectResult<()> {
        match fs::remove_dir_all(self.project_dir(folder)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    pub fn list(&self, folder: &str, relative: &str) -> ProjectResult<Vec<DirEntry>> {
        let base = self.project_dir(folder);
        let requested = Path::new(relative);
        if requested.is_absolute()
            || requested.components().any(|part| {
                matches!(
                    part,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(path_error(
                "directory path must stay inside the project folder",
            ));
        }
        if relative.is_empty() || relative == "." {
            let metadata = match base.symlink_metadata() {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
                Err(error) => return Err(error.into()),
            };
            if metadata.file_type().is_symlink() {
                return Err(path_error("project folder must not be a symlink"));
            }
            let canonical_base = base.canonicalize()?;
            return read_entries(&canonical_base);
        }
        let base_metadata = base
            .symlink_metadata()
            .map_err(|_| path_error("project folder does not exist"))?;
        if base_metadata.file_type().is_symlink() {
            return Err(path_error("project folder must not be a symlink"));
        }
        let canonical_base = base.canonicalize()?;
        let mut target = base.clone();
        for component in requested.components() {
            if let Component::Normal(part) = component {
                target.push(part);
                let metadata = target
                    .symlink_metadata()
                    .map_err(|_| path_error("directory path is invalid"))?;
                if metadata.file_type().is_symlink() {
                    return Err(path_error("symlinks cannot be followed"));
                }
                let canonical = target
                    .canonicalize()
                    .map_err(|_| path_error("directory path is invalid"))?;
                if !canonical.starts_with(&canonical_base) {
                    return Err(path_error("directory path escapes the project folder"));
                }
            }
        }
        let canonical_target = target
            .canonicalize()
            .map_err(|_| path_error("directory path is invalid"))?;
        if !canonical_target.is_dir() {
            return Err(path_error("path is not a directory"));
        }
        read_entries(&canonical_target)
    }
}

fn read_entries(path: &Path) -> ProjectResult<Vec<DirEntry>> {
    let mut entries = Vec::new();
    for item in fs::read_dir(path)? {
        let item = item?;
        let kind = item.file_type()?;
        let metadata = item.path().symlink_metadata()?;
        entries.push(DirEntry {
            name: item.file_name().to_string_lossy().into_owned(),
            kind: if kind.is_dir() { "dir" } else { "file" }.to_string(),
            size: if kind.is_symlink() || kind.is_dir() {
                0
            } else {
                metadata.len()
            },
        });
    }
    entries.sort_by(|left, right| {
        (left.kind != "dir")
            .cmp(&(right.kind != "dir"))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

fn path_error(detail: &str) -> ProjectError {
    ProjectError::new(ProjectErrorCode::PathInvalid, detail)
}

pub fn slug(name: &str) -> String {
    let mut slug = String::new();
    let mut dash = false;
    for character in name.chars() {
        let normalized = decompose(character);
        for c in normalized.chars() {
            if c.is_ascii_alphanumeric() {
                slug.push(c.to_ascii_lowercase());
                dash = false;
            } else if !dash && !slug.is_empty() {
                slug.push('-');
                dash = true;
            }
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "project".to_string()
    } else {
        slug
    }
}

const VIETNAMESE: [(char, &str); 5] = [
    ('a', "àáạảãâầấậẩẫăằắặẳẵ"),
    ('e', "èéẹẻẽêềếệểễ"),
    ('i', "ìíịỉĩ"),
    ('o', "òóọỏõôồốộổỗơờớợởỡ"),
    ('u', "ùúụủũưừứựửữ"),
];

const COMBINING_MARKS: std::ops::RangeInclusive<char> = '\u{0300}'..='\u{036F}';

fn decompose(character: char) -> String {
    let lower = character.to_lowercase().next().unwrap_or(character);
    if COMBINING_MARKS.contains(&lower) {
        return String::new();
    }
    if let Some(base) = vietnamese_base(lower) {
        return base.to_string();
    }
    match lower {
        'ä' | 'ǟ' | 'ǎ' | 'å' | 'ā' | 'ą' => "a".to_string(),
        'ç' | 'ć' | 'č' => "c".to_string(),
        'ð' | 'ď' | 'đ' => "d".to_string(),
        'ë' | 'ē' | 'ė' | 'ę' | 'ě' => "e".to_string(),
        'ï' | 'ī' => "i".to_string(),
        'ñ' | 'ń' => "n".to_string(),
        'ö' | 'ø' | 'ō' => "o".to_string(),
        'ü' | 'ū' => "u".to_string(),
        'ý' | 'ỳ' | 'ỵ' | 'ỷ' | 'ỹ' | 'ÿ' => "y".to_string(),
        'š' => "s".to_string(),
        'ž' => "z".to_string(),
        'æ' => "ae".to_string(),
        'œ' => "oe".to_string(),
        'þ' => "th".to_string(),
        'ß' => "ss".to_string(),
        other => other.to_string(),
    }
}

fn vietnamese_base(character: char) -> Option<char> {
    for (base, group) in VIETNAMESE {
        if group.contains(character) {
            return Some(base);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_strips_vietnamese_diacritics() {
        assert_eq!(slug("Gió Muộn — Audiobook"), "gio-muon-audiobook");
        assert_eq!(slug("Đường về Ánh Sáng"), "duong-ve-anh-sang");
        assert_eq!(slug("Tro Dưới Biển"), "tro-duoi-bien");
    }

    #[test]
    fn slug_ignores_combining_marks_and_falls_back() {
        assert_eq!(slug("Ca\u{0302}u chuye\u{0323}n"), "cau-chuyen");
        assert_eq!(slug("日本語"), "project");
        assert_eq!(slug("  --  "), "project");
        assert_eq!(slug("Harrowmere: Part 1"), "harrowmere-part-1");
    }
}
