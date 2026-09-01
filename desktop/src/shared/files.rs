use std::fs;
use std::fs::File;
use std::io::ErrorKind;
use std::io::Read;
use std::io::Result;
use std::io::Seek;
use std::io::SeekFrom;
use std::path::Path;

pub fn remove_if_exists(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

pub fn read_if_exists(path: &Path) -> Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn read_range(path: &Path, start: u64, len: u64) -> Result<Vec<u8>> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(start))?;
    let mut bytes = Vec::new();
    file.take(len).read_to_end(&mut bytes)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("dreamy-files-{name}-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn remove_if_exists_ignores_a_missing_file() {
        let dir = scratch("remove");
        let file = dir.join("a.bin");
        remove_if_exists(&file).unwrap();
        fs::write(&file, b"x").unwrap();
        remove_if_exists(&file).unwrap();
        assert!(!file.exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_if_exists_reports_a_missing_file_as_none() {
        let dir = scratch("read");
        let file = dir.join("a.bin");
        assert_eq!(read_if_exists(&file).unwrap(), None);
        fs::write(&file, b"abc").unwrap();
        assert_eq!(read_if_exists(&file).unwrap(), Some(b"abc".to_vec()));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_range_returns_the_requested_slice() {
        let dir = scratch("range");
        let file = dir.join("a.bin");
        fs::write(&file, b"0123456789").unwrap();
        assert_eq!(read_range(&file, 2, 4).unwrap(), b"2345");
        assert_eq!(read_range(&file, 8, 10).unwrap(), b"89");
        fs::remove_dir_all(&dir).unwrap();
    }
}
