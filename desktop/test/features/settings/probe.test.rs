use super::*;
use std::ffi::OsString;
use tempfile::TempDir;

const TEST_SPEC: CliSpec = CliSpec {
    id: "tool",
    command: "tool",
    name: "Tool CLI",
    caps: &["knowledge"],
    profile_env: Some("DREAMY_TEST_PROFILE"),
    env: &[],
    login_args: &["login"],
    logout_args: Some(&["logout"]),
    status_args: Some(&["status"]),
    token_file: None,
};

const PLAIN_SPEC: CliSpec = CliSpec {
    id: "plain",
    command: "plain",
    name: "Plain CLI",
    caps: &["knowledge"],
    profile_env: None,
    env: &[],
    login_args: &[],
    logout_args: None,
    status_args: None,
    token_file: None,
};

fn script(dir: &TempDir, name: &str, version: &str, code: i32) -> String {
    #[cfg(windows)]
    {
        let path = dir.path().join(format!("{name}.cmd"));
        let body = format!(
            "@echo off\r\nif \"%1\"==\"--version\" goto version\r\necho %DREAMY_TEST_PROFILE%\r\nexit /b {code}\r\n:version\r\necho {version}\r\nexit /b 0\r\n"
        );
        std::fs::write(&path, body).unwrap();
        path.to_string_lossy().into_owned()
    }
    #[cfg(not(windows))]
    {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.path().join(name);
        let body = format!(
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo \"{version}\"; exit 0; fi\necho \"$DREAMY_TEST_PROFILE\"\nexit {code}\n"
        );
        std::fs::write(&path, body).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path.to_string_lossy().into_owned()
    }
}

#[test]
fn parses_the_version_out_of_common_outputs() {
    assert_eq!(parse_version("2.1.325 (Claude Code)\n"), "2.1.325");
    assert_eq!(parse_version("codex-cli 0.169.0"), "0.169.0");
    assert_eq!(parse_version("\n\nv1.0.3\n"), "1.0.3");
    assert_eq!(parse_version("unknown build"), "unknown build");
    assert_eq!(parse_version("  \n"), "");
}

#[test]
fn resolves_a_command_from_the_search_path() {
    let dir = TempDir::new().unwrap();
    let file = script(&dir, "tool", "tool 1.2.3", 0);
    let search = std::env::join_paths([dir.path()]).unwrap();
    let found = resolve_command("tool", &search, ".EXE;.CMD");
    assert_eq!(found, Some(PathBuf::from(file)));
}

#[test]
fn does_not_resolve_a_command_that_is_missing() {
    let dir = TempDir::new().unwrap();
    let search = std::env::join_paths([dir.path()]).unwrap();
    assert_eq!(resolve_command("tool", &search, ".EXE;.CMD"), None);
    assert_eq!(resolve_command("tool", &OsString::new(), ""), None);
}

#[test]
fn reports_a_configured_path_that_does_not_exist() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("nope.cmd");
    let result = probe(&TEST_SPEC, &missing.to_string_lossy(), dir.path());
    assert!(!result.found);
    assert!(!result.ok);
    assert!(result.error.starts_with("File not found"));
}

#[test]
fn reports_the_version_and_a_signed_in_profile() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "tool", "tool 1.2.3", 0);
    let result = probe(&TEST_SPEC, &path, dir.path());
    assert!(result.found);
    assert!(result.ok, "{}", result.error);
    assert_eq!(result.version, "1.2.3");
    assert_eq!(result.signed_in, Some(true));
    assert!(!result.account.is_empty());
    assert!(TEST_SPEC.profile_dir(dir.path()).is_dir());
}

#[test]
fn runs_the_cli_with_the_profile_directory_in_its_environment() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "tool", "tool 1.2.3", 0);
    let output = capture(command(
        &TEST_SPEC,
        Path::new(&path),
        &["status"],
        dir.path(),
    ))
    .unwrap();
    let profile = TEST_SPEC.profile_dir(dir.path());
    assert_eq!(output.stdout.trim(), profile.to_string_lossy());
}

#[test]
fn reports_a_profile_that_is_not_signed_in() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "tool", "tool 1.2.3", 1);
    let result = probe(&TEST_SPEC, &path, dir.path());
    assert!(result.ok);
    assert_eq!(result.signed_in, Some(false));
    assert_eq!(result.account, "");
}

#[test]
fn leaves_the_sign_in_unknown_without_a_status_command() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "plain", "plain 0.1.0", 0);
    let result = probe(&PLAIN_SPEC, &path, dir.path());
    assert!(result.ok);
    assert_eq!(result.version, "0.1.0");
    assert_eq!(result.signed_in, None);
    assert!(!dir.path().join("llm").exists());
}

#[test]
fn reports_a_command_that_fails_to_report_its_version() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("broken.cmd");
    #[cfg(windows)]
    std::fs::write(
        &path,
        "@echo off\r\necho broken install 1>&2\r\nexit /b 3\r\n",
    )
    .unwrap();
    #[cfg(not(windows))]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::write(&path, "#!/bin/sh\necho broken install >&2\nexit 3\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    let result = probe(&PLAIN_SPEC, &path.to_string_lossy(), dir.path());
    assert!(result.found);
    assert!(!result.ok);
    assert!(result.error.contains("broken install"), "{}", result.error);
}

#[test]
fn signs_out_through_the_cli() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "tool", "tool 1.2.3", 0);
    assert_eq!(logout(&TEST_SPEC, &path, dir.path()), Ok(()));
    let failing = script(&dir, "failing", "tool 1.2.3", 2);
    assert!(logout(&TEST_SPEC, &failing, dir.path()).is_err());
}

#[test]
fn cannot_sign_out_of_a_cli_without_a_logout_command() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "plain", "plain 0.1.0", 0);
    assert!(logout(&PLAIN_SPEC, &path, dir.path()).is_err());
}

#[test]
fn needs_an_installed_cli_to_sign_in() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("nope.cmd");
    assert!(login(&TEST_SPEC, &missing.to_string_lossy(), dir.path()).is_err());
}

#[test]
fn reads_the_account_from_json_and_plain_output() {
    let json = Captured {
        success: true,
        status: String::new(),
        stdout: r#"{"loggedIn":true,"email":"user@example.com"}"#.to_string(),
        stderr: String::new(),
    };
    assert_eq!(account_of(&json), "user@example.com");
    let anonymous = Captured {
        stdout: r#"{"loggedIn":true}"#.to_string(),
        ..json
    };
    assert_eq!(account_of(&anonymous), "");
    let plain = Captured {
        success: true,
        status: String::new(),
        stdout: "WARNING: ignore me\nLogged in using ChatGPT\n".to_string(),
        stderr: String::new(),
    };
    assert_eq!(account_of(&plain), "Logged in using ChatGPT");
}
