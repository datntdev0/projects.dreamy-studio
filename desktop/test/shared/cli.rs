use std::path::Path;
use std::path::PathBuf;

pub struct ScriptedCli {
    folder: PathBuf,
    pub path: String,
}

impl ScriptedCli {
    pub fn new(dir: &Path, replies: &[&str]) -> Self {
        let folder = dir.join("scripted-cli");
        std::fs::create_dir_all(&folder).unwrap();
        for (index, reply) in replies.iter().enumerate() {
            std::fs::write(folder.join(format!("reply{}.txt", index + 1)), reply).unwrap();
        }
        let path = write_script(&folder);
        Self { folder, path }
    }

    pub fn calls(&self) -> usize {
        std::fs::read_to_string(self.folder.join("count"))
            .map(|text| text.trim().parse().unwrap_or(0))
            .unwrap_or(0)
    }

    pub fn args(&self, call: usize) -> String {
        self.read(&format!("args{call}.txt"))
    }

    pub fn token(&self, call: usize) -> String {
        self.read(&format!("env{call}.txt")).trim().to_string()
    }

    pub fn stdin(&self, call: usize) -> String {
        self.read(&format!("stdin{call}.txt"))
    }

    fn read(&self, name: &str) -> String {
        std::fs::read_to_string(self.folder.join(name)).unwrap_or_default()
    }
}

#[cfg(windows)]
fn write_script(folder: &Path) -> String {
    let path = folder.join("cli.cmd");
    let dir = folder.display();
    let body = format!(
        "@echo off\r\nsetlocal enabledelayedexpansion\r\nset n=0\r\nif exist \"{dir}\\count\" set /p n=<\"{dir}\\count\"\r\nset /a n+=1\r\necho !n!>\"{dir}\\count\"\r\necho %* >\"{dir}\\args!n!.txt\"\r\n>\"{dir}\\env!n!.txt\" echo %DREAMY_MCP_TOKEN%\r\nfindstr \"^\" >\"{dir}\\stdin!n!.txt\"\r\nif not exist \"{dir}\\reply!n!.txt\" exit /b 9\r\ntype \"{dir}\\reply!n!.txt\"\r\nexit /b 0\r\n"
    );
    std::fs::write(&path, body).unwrap();
    path.to_string_lossy().into_owned()
}

#[cfg(not(windows))]
fn write_script(folder: &Path) -> String {
    use std::os::unix::fs::PermissionsExt;
    let path = folder.join("cli");
    let dir = folder.display();
    let body = format!(
        "#!/bin/sh\nd=\"{dir}\"\nn=$(cat \"$d/count\" 2>/dev/null || echo 0)\nn=$((n+1))\necho $n > \"$d/count\"\necho \"$@\" > \"$d/args$n.txt\"\necho \"$DREAMY_MCP_TOKEN\" > \"$d/env$n.txt\"\ncat > \"$d/stdin$n.txt\"\n[ -f \"$d/reply$n.txt\" ] || exit 9\ncat \"$d/reply$n.txt\"\n"
    );
    std::fs::write(&path, body).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    path.to_string_lossy().into_owned()
}
