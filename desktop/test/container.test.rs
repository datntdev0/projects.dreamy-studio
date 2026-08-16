use super::AppContainer;
use tempfile::tempdir;

#[test]
fn derives_paths_from_root_without_creating_them() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("DreamyStudio");

    let container = AppContainer::from_root(root.clone());

    assert_eq!(container.directories.root, root);
    assert_eq!(container.directories.logs, root.join("logs"));
    assert_eq!(container.database_path, root.join("application.dreamydb"));
    assert!(!root.exists());
}
