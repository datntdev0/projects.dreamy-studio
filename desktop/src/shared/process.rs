const DETAIL_LIMIT: usize = 400;

pub fn failure_snippet(stdout: &str, stderr: &str) -> String {
    let source = if stderr.trim().is_empty() {
        stdout
    } else {
        stderr
    };
    source.trim().chars().take(DETAIL_LIMIT).collect()
}
