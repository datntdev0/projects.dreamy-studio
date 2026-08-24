use super::*;
use crate::features::settings::llm::CliSettings;
use crate::features::settings::models::AppSettings;
use crate::features::translation::models::DictEntry;
use tempfile::TempDir;

const CLAUDE: &CliSpec = &crate::features::settings::llm::CLI_SPECS[0];
const ANTIGRAVITY: &CliSpec = &crate::features::settings::llm::CLI_SPECS[1];
const CODEX: &CliSpec = &crate::features::settings::llm::CLI_SPECS[2];

fn job(passage: Option<usize>) -> TranslateJob {
    TranslateJob {
        target: "VI".to_string(),
        passage,
        title: "Chapter one".to_string(),
        paragraphs: vec!["First".to_string(), "Second".to_string()],
        guidelines: "Keep names".to_string(),
        dict: vec![DictEntry {
            id: 1,
            src: "Alice".to_string(),
            dst: "Alis".to_string(),
            kind: "name".to_string(),
            note: "heroine".to_string(),
        }],
    }
}

fn feature(model: Option<&str>, effort: Option<Effort>, args: Option<&str>) -> FeatureSettings {
    FeatureSettings {
        provider: None,
        model: model.map(String::from),
        effort,
        args: args.map(String::from),
    }
}

fn script(dir: &TempDir, stdout: &str, stderr: &str, code: i32) -> String {
    #[cfg(windows)]
    {
        let path = dir.path().join("cli.cmd");
        let body = format!(
            "@echo off\r\nif not \"{stderr}\"==\"\" echo {stderr} 1>&2\r\necho {stdout}\r\nexit /b {code}\r\n"
        );
        std::fs::write(&path, body).unwrap();
        path.to_string_lossy().into_owned()
    }
    #[cfg(not(windows))]
    {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.path().join("cli");
        let body = format!(
            "#!/bin/sh\ncat >/dev/null\necho '{stderr}' 1>&2\necho '{stdout}'\nexit {code}\n"
        );
        std::fs::write(&path, body).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path.to_string_lossy().into_owned()
    }
}

fn client(dir: &TempDir, provider: Option<(&str, &str)>) -> LlmClient {
    let repository = SettingsRepository::new(dir.path().join("settings.json"));
    let mut settings = AppSettings::default();
    if let Some((id, path)) = provider {
        settings.llm.providers.insert(
            id.to_string(),
            CliSettings {
                path: Some(path.to_string()),
            },
        );
        settings.llm.features.insert(
            "knowledge".to_string(),
            FeatureSettings {
                provider: Some(id.to_string()),
                ..FeatureSettings::default()
            },
        );
    }
    repository.save(&settings).unwrap();
    LlmClient::new(repository, "knowledge", "knowledge analysis")
}

fn assistant_client(dir: &TempDir, provider: Option<(&str, &str)>) -> LlmClient {
    let repository = SettingsRepository::new(dir.path().join("settings.json"));
    let mut settings = AppSettings::default();
    if let Some((id, path)) = provider {
        settings.llm.providers.insert(
            id.to_string(),
            CliSettings {
                path: Some(path.to_string()),
            },
        );
        settings.llm.features.insert(
            "assistant".to_string(),
            FeatureSettings {
                provider: Some(id.to_string()),
                ..FeatureSettings::default()
            },
        );
    }
    repository.save(&settings).unwrap();
    LlmClient::new(repository, "assistant", "assistant")
}

fn strings(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| item.to_string()).collect()
}

fn translator(dir: &TempDir, provider: Option<(&str, &str)>) -> LlmTranslator {
    let repository = SettingsRepository::new(dir.path().join("settings.json"));
    let mut settings = AppSettings::default();
    if let Some((id, path)) = provider {
        settings.llm.providers.insert(
            id.to_string(),
            CliSettings {
                path: Some(path.to_string()),
            },
        );
        settings.llm.features.insert(
            FEATURE.to_string(),
            FeatureSettings {
                provider: Some(id.to_string()),
                ..FeatureSettings::default()
            },
        );
    }
    repository.save(&settings).unwrap();
    LlmTranslator::new(repository)
}

#[test]
fn splits_arguments_with_quotes() {
    assert_eq!(
        split_args("--a  \"two words\" 'x y' --b=1 \"\""),
        ["--a", "two words", "x y", "--b=1", ""]
    );
    assert!(split_args("   ").is_empty());
}

#[test]
fn claude_arguments_carry_model_effort_and_extras() {
    let args = invocation_args(
        CLAUDE,
        &feature(Some("sonnet"), Some(Effort::High), Some("--verbose")),
    )
    .unwrap();

    assert_eq!(
        args,
        [
            "-p",
            "--output-format",
            "text",
            "--no-session-persistence",
            "--tools",
            "",
            "--model",
            "sonnet",
            "--effort",
            "high",
            "--verbose"
        ]
    );
}

#[test]
fn codex_arguments_end_with_the_stdin_marker() {
    let args = invocation_args(
        CODEX,
        &feature(Some("gpt"), Some(Effort::Low), Some("--color never")),
    )
    .unwrap();

    assert_eq!(args[0], "exec");
    assert_eq!(args.last().map(String::as_str), Some("-"));
    assert!(args.windows(2).any(|pair| pair == ["-m", "gpt"]));
    assert!(
        args.windows(2)
            .any(|pair| pair == ["-c", "model_reasoning_effort=\"low\""])
    );
    assert!(args.windows(2).any(|pair| pair == ["--color", "never"]));
}

#[test]
fn unsupported_provider_is_an_error() {
    let error = invocation_args(ANTIGRAVITY, &FeatureSettings::default()).unwrap_err();

    assert!(error.contains("Antigravity CLI"));
}

#[test]
fn prompt_has_guidelines_dictionary_and_source() {
    let prompt = build_prompt(&job(None));

    assert!(prompt.contains("into Vietnamese"));
    assert!(prompt.contains("Keep names"));
    assert!(prompt.contains("- Alice => Alis (name): heroine"));
    assert!(prompt.contains("\"title\": \"Chapter one\""));
    assert!(prompt.contains("exactly 2 translated strings"));
}

#[test]
fn passage_prompt_leaves_the_title_out() {
    let mut passage = job(Some(2));
    passage.target = "EN".to_string();
    passage.paragraphs = vec!["Second".to_string()];

    let prompt = build_prompt(&passage);

    assert!(prompt.contains("into English"));
    assert!(!prompt.contains("Chapter one"));
    assert!(prompt.contains("exactly 1 translated strings"));
}

#[test]
fn parses_json_wrapped_in_a_code_fence() {
    let text = "```json\n{\"title\": \"Chuong mot\", \"paragraphs\": [\"Mot\", \"Hai\"]}\n```";

    let run = parse_output(text, &job(None)).unwrap();

    assert_eq!(run.title, "Chuong mot");
    assert_eq!(run.paragraphs, ["Mot", "Hai"]);
}

#[test]
fn missing_title_falls_back_to_the_original() {
    let run = parse_output("{\"paragraphs\": [\"Mot\", \"Hai\"]}", &job(None)).unwrap();

    assert_eq!(run.title, "Chapter one");
}

#[test]
fn rejects_a_wrong_paragraph_count() {
    let error = parse_output("{\"paragraphs\": [\"Mot\"]}", &job(None)).unwrap_err();

    assert!(error.contains("1 paragraphs but 2"));
}

#[test]
fn rejects_output_without_json() {
    assert!(parse_output("Sorry, I cannot.", &job(None)).is_err());
    assert!(parse_output("{ not json }", &job(None)).is_err());
}

#[test]
fn fails_without_a_translation_provider() {
    let dir = TempDir::new().unwrap();
    let translator = translator(&dir, None);

    let result = translator.translate(
        &job(None),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(false),
    );

    match result {
        Err(TranslateError::Failed(message)) => assert!(message.contains("Settings > LLM")),
        other => panic!("unexpected result: {other:?}"),
    }
}

#[test]
fn fails_when_the_configured_path_is_missing() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("missing").to_string_lossy().into_owned();
    let translator = translator(&dir, Some(("claude", &missing)));

    let result = translator.translate(
        &job(None),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(false),
    );

    match result {
        Err(TranslateError::Failed(message)) => assert!(message.contains("was not found")),
        other => panic!("unexpected result: {other:?}"),
    }
}

#[test]
fn cancelled_before_start_does_not_touch_the_provider() {
    let dir = TempDir::new().unwrap();
    let translator = translator(&dir, None);

    let result = translator.translate(
        &job(None),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(true),
    );

    assert!(matches!(result, Err(TranslateError::Cancelled)));
}

#[test]
fn translates_through_the_configured_cli() {
    let dir = TempDir::new().unwrap();
    let path = script(
        &dir,
        "{\"title\":\"Chuong mot\",\"paragraphs\":[\"Mot\",\"Hai\"]}",
        "",
        0,
    );
    let translator = translator(&dir, Some(("claude", &path)));
    let reported = std::sync::Mutex::new(Vec::new());

    let run = translator
        .translate(
            &job(None),
            &TaskLog::none(),
            &|value| reported.lock().unwrap().push(value),
            &AtomicBool::new(false),
        )
        .unwrap();

    assert_eq!(run.title, "Chuong mot");
    assert_eq!(run.paragraphs, ["Mot", "Hai"]);
    assert_eq!(*reported.lock().unwrap(), [10, 100]);
}

#[test]
fn reports_the_cli_failure_detail() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "", "not signed in", 3);
    let translator = translator(&dir, Some(("codex", &path)));

    let result = translator.translate(
        &job(None),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(false),
    );

    match result {
        Err(TranslateError::Failed(message)) => {
            assert!(message.contains("Codex CLI exited"));
            assert!(message.contains("not signed in"));
        }
        other => panic!("unexpected result: {other:?}"),
    }
}

#[test]
fn client_names_its_label_when_no_provider_is_set() {
    let dir = TempDir::new().unwrap();
    let client = client(&dir, None);

    let result = client.complete(
        "test",
        "prompt".to_string(),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(false),
    );

    match result {
        Err(ClientError::Failed(message)) => assert_eq!(
            message,
            "No LLM provider is set for knowledge analysis. Choose one in Settings > LLM."
        ),
        other => panic!("unexpected result: {other:?}"),
    }
}

#[test]
fn client_rejects_a_cli_without_the_feature() {
    let dir = TempDir::new().unwrap();
    let repository = SettingsRepository::new(dir.path().join("settings.json"));
    let mut settings = AppSettings::default();
    settings.llm.features.insert(
        "knowledge".to_string(),
        FeatureSettings {
            provider: Some("unknown".to_string()),
            ..FeatureSettings::default()
        },
    );
    repository.save(&settings).unwrap();
    let client = LlmClient::new(repository, "knowledge", "knowledge analysis");

    let result = client.complete(
        "test",
        "prompt".to_string(),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(false),
    );

    match result {
        Err(ClientError::Failed(message)) => {
            assert_eq!(message, "unknown cannot be used for knowledge analysis.")
        }
        other => panic!("unexpected result: {other:?}"),
    }
}

#[test]
fn client_rejects_an_unsupported_cli_with_its_label() {
    let error = build_args(
        ANTIGRAVITY,
        &FeatureSettings::default(),
        "knowledge analysis",
        Mode::Once,
        true,
        &[],
    )
    .unwrap_err();

    assert_eq!(
        error,
        "Antigravity CLI cannot be used for knowledge analysis yet."
    );
}

#[test]
fn client_is_cancelled_before_it_resolves_anything() {
    let dir = TempDir::new().unwrap();
    let client = client(&dir, None);

    let result = client.complete(
        "test",
        "prompt".to_string(),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(true),
    );

    assert!(matches!(result, Err(ClientError::Cancelled)));
}

#[test]
fn client_returns_the_stdout_text() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "analysis result", "", 0);
    let client = client(&dir, Some(("claude", &path)));
    let reported = std::sync::Mutex::new(Vec::new());

    let text = client
        .complete(
            "test",
            "prompt".to_string(),
            &TaskLog::none(),
            &|value| reported.lock().unwrap().push(value),
            &AtomicBool::new(false),
        )
        .unwrap();

    assert!(text.contains("analysis result"));
    assert_eq!(*reported.lock().unwrap(), [10]);
}

#[test]
fn client_reports_the_cli_failure_detail() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "", "not signed in", 3);
    let client = client(&dir, Some(("codex", &path)));

    let result = client.complete(
        "test",
        "prompt".to_string(),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(false),
    );

    match result {
        Err(ClientError::Failed(message)) => {
            assert!(message.contains("Codex CLI exited"));
            assert!(message.contains("not signed in"));
        }
        other => panic!("unexpected result: {other:?}"),
    }
}

#[test]
fn claude_session_arguments_name_or_resume_the_session() {
    let feature = FeatureSettings::default();

    let start = build_args(CLAUDE, &feature, "x", Mode::Start("abc"), true, &[]).unwrap();
    let resume = build_args(CLAUDE, &feature, "x", Mode::Resume("abc"), true, &[]).unwrap();

    assert!(start.windows(2).any(|pair| pair == ["--session-id", "abc"]));
    assert!(resume.windows(2).any(|pair| pair == ["--resume", "abc"]));
    assert!(!start.contains(&"--no-session-persistence".to_string()));
    assert!(!resume.contains(&"--no-session-persistence".to_string()));
}

#[test]
fn codex_session_arguments_read_json_and_resume_by_thread() {
    let feature = feature(Some("gpt"), None, None);

    let start = build_args(CODEX, &feature, "x", Mode::Start("ignored"), true, &[]).unwrap();
    let resume = build_args(CODEX, &feature, "x", Mode::Resume("thread-1"), true, &[]).unwrap();

    assert!(start.contains(&"--json".to_string()));
    assert!(!start.contains(&"--ephemeral".to_string()));
    assert_eq!(start.last().map(String::as_str), Some("-"));
    assert_eq!(&resume[..2], ["exec", "resume"]);
    assert!(resume.windows(2).any(|pair| pair == ["-m", "gpt"]));
    assert_eq!(&resume[resume.len() - 2..], ["thread-1", "-"]);
}

#[test]
fn codex_json_events_give_the_thread_and_the_last_message() {
    let stdout = "{\"type\":\"thread.started\",\"thread_id\":\"t1\"}\nnot json\n{\"type\":\"item.completed\",\"item\":{\"type\":\"reasoning\",\"text\":\"hm\"}}\n{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"first\"}}\n{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"last\"}}\n";

    let (text, session) = reply_of(CODEX, Mode::Start("x"), stdout.to_string()).unwrap();

    assert_eq!(text, "last");
    assert_eq!(session.as_deref(), Some("t1"));
    assert!(reply_of(CODEX, Mode::Resume("t1"), "{}\n".to_string()).is_err());
}

#[test]
fn plain_output_is_returned_as_is_without_a_session() {
    let (text, session) = reply_of(CLAUDE, Mode::Start("x"), "hello".to_string()).unwrap();

    assert_eq!(text, "hello");
    assert_eq!(session, None);
    assert_eq!(
        reply_of(CODEX, Mode::Once, "plain".to_string()).unwrap().0,
        "plain"
    );
}

#[test]
fn start_returns_the_generated_claude_session_and_resume_keeps_it() {
    let dir = TempDir::new().unwrap();
    let cli = crate::testing::cli::ScriptedCli::new(dir.path(), &["one", "two"]);
    let client = client(&dir, Some(("claude", &cli.path)));
    let cancel = AtomicBool::new(false);
    let reported = std::sync::Mutex::new(Vec::new());
    let progress = |value| reported.lock().unwrap().push(value);

    let first = client
        .start(
            "test",
            "hello".to_string(),
            &TaskLog::none(),
            &progress,
            &cancel,
        )
        .unwrap();
    let second = client
        .resume(
            "test",
            &first.session,
            "again".to_string(),
            &TaskLog::none(),
            &progress,
            &cancel,
        )
        .unwrap();

    assert!(first.text.contains("one"));
    assert!(second.text.contains("two"));
    assert_eq!(second.session, first.session);
    assert!(
        cli.args(1)
            .contains(&format!("--session-id {}", first.session))
    );
    assert!(cli.args(2).contains(&format!("--resume {}", first.session)));
    assert!(cli.stdin(2).contains("again"));
    assert_eq!(*reported.lock().unwrap(), [10]);
}

#[test]
fn forget_removes_the_stored_session_of_the_cli() {
    let dir = TempDir::new().unwrap();
    let client = client(&dir, Some(("claude", "unused")));
    let project = dir
        .path()
        .join("llm")
        .join("claude")
        .join("projects")
        .join("p");
    std::fs::create_dir_all(project.join("abc")).unwrap();
    std::fs::write(project.join("abc.jsonl"), "{}").unwrap();
    std::fs::write(project.join("keep.jsonl"), "{}").unwrap();

    client.forget("abc");

    assert!(!project.join("abc.jsonl").exists());
    assert!(!project.join("abc").exists());
    assert!(project.join("keep.jsonl").exists());
}

#[test]
fn forget_finds_a_codex_rollout_by_thread_id() {
    let dir = TempDir::new().unwrap();
    let client = client(&dir, Some(("codex", "unused")));
    let day = dir
        .path()
        .join("llm")
        .join("codex")
        .join("sessions")
        .join("2026")
        .join("11")
        .join("18");
    std::fs::create_dir_all(&day).unwrap();
    std::fs::write(day.join("rollout-2026-11-18T10-00-00-t1.jsonl"), "{}").unwrap();
    std::fs::write(day.join("rollout-2026-11-18T10-00-00-t2.jsonl"), "{}").unwrap();

    client.forget("t1");

    assert!(!day.join("rollout-2026-11-18T10-00-00-t1.jsonl").exists());
    assert!(day.join("rollout-2026-11-18T10-00-00-t2.jsonl").exists());
}

#[test]
fn a_single_call_logs_the_command_the_prompt_and_the_response() {
    let dir = TempDir::new().unwrap();
    let cli = crate::testing::cli::ScriptedCli::new(dir.path(), &["translated text"]);
    let client = client(&dir, Some(("claude", &cli.path)));
    let logs = TempDir::new().unwrap();
    let run = crate::features::pipeline::log::RunLog::create(
        logs.path(),
        chrono::Local::now(),
        "translation",
        3,
    );
    let task = run.task(5, "chp0001");

    client
        .complete(
            "test",
            "the prompt".to_string(),
            &task,
            &|_| {},
            &AtomicBool::new(false),
        )
        .unwrap();

    let folder = run.dir().unwrap();
    let log = std::fs::read_to_string(folder.join("pipeline.log")).unwrap();
    assert!(log.contains("[task 5 chp0001] exchange 1 (test, single call): "));
    assert!(log.contains("--no-session-persistence"));
    assert!(log.contains("exchange 1 prompt: t5-chp0001-exchange-1-test-prompt.txt (10 bytes"));
    assert!(log.contains("exchange 1 response: t5-chp0001-exchange-1-test-response.txt"));
    let prompt =
        std::fs::read_to_string(folder.join("t5-chp0001-exchange-1-test-prompt.txt")).unwrap();
    let response =
        std::fs::read_to_string(folder.join("t5-chp0001-exchange-1-test-response.txt")).unwrap();
    assert_eq!(prompt, "the prompt");
    assert!(response.contains("translated text"));
}

#[test]
fn a_failing_call_logs_the_failure_and_keeps_the_stderr() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "", "not signed in", 3);
    let client = client(&dir, Some(("codex", &path)));
    let logs = TempDir::new().unwrap();
    let run = crate::features::pipeline::log::RunLog::create(
        logs.path(),
        chrono::Local::now(),
        "analysis",
        1,
    );
    let task = run.task(1, "chp0001");

    let result = client.complete(
        "test",
        "prompt".to_string(),
        &task,
        &|_| {},
        &AtomicBool::new(false),
    );

    assert!(result.is_err());
    let folder = run.dir().unwrap();
    let log = std::fs::read_to_string(folder.join("pipeline.log")).unwrap();
    assert!(log.contains("exchange 1 stderr: t1-chp0001-exchange-1-test-stderr.txt"));
    assert!(log.contains("exchange failed: Codex CLI exited"));
    let stderr =
        std::fs::read_to_string(folder.join("t1-chp0001-exchange-1-test-stderr.txt")).unwrap();
    assert!(stderr.contains("not signed in"));
}

#[test]
fn extra_arguments_close_the_claude_arguments() {
    let args = build_args(
        CLAUDE,
        &feature(Some("sonnet"), None, Some("--verbose")),
        "x",
        Mode::Start("abc"),
        true,
        &strings(&["--mcp-config", "m.json"]),
    )
    .unwrap();

    assert_eq!(
        args[args.len() - 3..],
        ["--verbose", "--mcp-config", "m.json"]
    );
}

#[test]
fn extra_arguments_precede_the_codex_resume_id_and_the_stdin_marker() {
    let extras = strings(&["-c", "mcp_servers.dreamy.enabled=true"]);
    let feature = feature(Some("gpt"), None, Some("--color never"));

    let resume = build_args(CODEX, &feature, "x", Mode::Resume("t1"), true, &extras).unwrap();
    let start = build_args(CODEX, &feature, "x", Mode::Start("x"), true, &extras).unwrap();

    assert_eq!(
        resume[resume.len() - 5..],
        ["never", "-c", "mcp_servers.dreamy.enabled=true", "t1", "-"]
    );
    assert_eq!(
        start[start.len() - 4..],
        ["never", "-c", "mcp_servers.dreamy.enabled=true", "-"]
    );
}

#[test]
fn empty_extras_leave_the_arguments_unchanged() {
    let feature = feature(Some("sonnet"), Some(Effort::High), Some("--verbose"));

    let with = build_args(CLAUDE, &feature, "x", Mode::Once, true, &[]).unwrap();

    assert_eq!(with, invocation_args(CLAUDE, &feature).unwrap());
    assert!(with.windows(2).any(|pair| pair == ["--tools", ""]));
}

#[test]
fn claude_keeps_its_tools_off_only_when_asked() {
    let feature = FeatureSettings::default();

    let off = build_args(CLAUDE, &feature, "x", Mode::Once, true, &[]).unwrap();
    let on = build_args(CLAUDE, &feature, "x", Mode::Once, false, &[]).unwrap();

    assert!(off.contains(&"--tools".to_string()));
    assert!(!on.contains(&"--tools".to_string()));
}

#[test]
fn the_assistant_runs_claude_without_the_tools_flag() {
    let dir = TempDir::new().unwrap();
    let cli = crate::testing::cli::ScriptedCli::new(dir.path(), &["one"]);
    let client = assistant_client(&dir, Some(("claude", &cli.path)));

    client
        .start(
            "test",
            "hi".to_string(),
            &TaskLog::none(),
            &|_| {},
            &AtomicBool::new(false),
        )
        .unwrap();

    assert!(cli.args(1).contains("--session-id"));
    assert!(!cli.args(1).contains("--tools"));
}

#[test]
fn translation_and_knowledge_runs_keep_the_tools_flag() {
    let dir = TempDir::new().unwrap();
    let cli = crate::testing::cli::ScriptedCli::new(dir.path(), &["one"]);
    let client = client(&dir, Some(("claude", &cli.path)));

    client
        .start(
            "test",
            "hi".to_string(),
            &TaskLog::none(),
            &|_| {},
            &AtomicBool::new(false),
        )
        .unwrap();

    assert!(cli.args(1).contains("--tools"));
}

#[test]
fn start_with_and_resume_with_pass_extra_arguments_and_environment() {
    let dir = TempDir::new().unwrap();
    let cli = crate::testing::cli::ScriptedCli::new(dir.path(), &["one", "two"]);
    let client = assistant_client(&dir, Some(("claude", &cli.path)));
    let extras = Extras {
        args: strings(&["--mcp-config", "m.json"]),
        env: vec![("DREAMY_MCP_TOKEN".to_string(), "tok-123".to_string())],
    };
    let cancel = AtomicBool::new(false);

    let first = client
        .start_with(
            "test",
            "hello".to_string(),
            &TaskLog::none(),
            &|_| {},
            &cancel,
            &extras,
        )
        .unwrap();
    client
        .resume_with(
            "test",
            &first.session,
            "again".to_string(),
            &TaskLog::none(),
            &|_| {},
            &cancel,
            &extras,
        )
        .unwrap();

    assert!(cli.args(1).contains("--mcp-config m.json"));
    assert!(cli.args(2).contains("--mcp-config m.json"));
    assert_eq!(cli.token(1), "tok-123");
    assert_eq!(cli.token(2), "tok-123");
}

#[test]
fn the_environment_is_left_alone_without_extras() {
    let dir = TempDir::new().unwrap();
    let cli = crate::testing::cli::ScriptedCli::new(dir.path(), &["one"]);
    let client = assistant_client(&dir, Some(("claude", &cli.path)));

    client
        .start(
            "test",
            "hello".to_string(),
            &TaskLog::none(),
            &|_| {},
            &AtomicBool::new(false),
        )
        .unwrap();

    assert!(!cli.token(1).contains("tok-123"));
}

#[test]
fn provider_returns_the_configured_cli_id() {
    let dir = TempDir::new().unwrap();
    let client = assistant_client(&dir, Some(("codex", "unused")));

    assert_eq!(client.provider().unwrap(), "codex");
}

#[test]
fn provider_fails_when_none_is_set_or_the_cli_lacks_the_feature() {
    let first = TempDir::new().unwrap();
    let second = TempDir::new().unwrap();
    let unset = assistant_client(&first, None);
    let unknown = assistant_client(&second, Some(("unknown", "unused")));

    match unset.provider() {
        Err(ClientError::Failed(message)) => {
            assert_eq!(
                message,
                "No LLM provider is set for assistant. Choose one in Settings > LLM."
            )
        }
        other => panic!("unexpected result: {other:?}"),
    }
    match unknown.provider() {
        Err(ClientError::Failed(message)) => {
            assert_eq!(message, "unknown cannot be used for assistant.")
        }
        other => panic!("unexpected result: {other:?}"),
    }
}
