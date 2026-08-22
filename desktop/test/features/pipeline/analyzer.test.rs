use super::*;
use crate::features::knowledge::ontology::Ontology;
use crate::features::settings::llm::CliSettings;
use crate::features::settings::llm::FeatureSettings;
use crate::features::settings::models::AppSettings;
use crate::testing::cli::ScriptedCli;
use tempfile::TempDir;

fn known(kind: &str, name: &str) -> KnownEntity {
    KnownEntity {
        kind: kind.to_string(),
        name: name.to_string(),
        titles: Vec::new(),
        aliases: Vec::new(),
        character: None,
    }
}

fn job(known: Vec<KnownEntity>) -> AnalyzeJob {
    AnalyzeJob {
        lang: "VI".to_string(),
        title: "Chapter one".to_string(),
        paragraphs: vec![
            "Wren lit the lamp.".to_string(),
            "The Guild met.".to_string(),
        ],
        ontology: Ontology::raw().to_string(),
        known,
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

fn analyzer(dir: &TempDir, provider: Option<(&str, &str)>) -> LlmAnalyzer {
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
    LlmAnalyzer::new(repository)
}

#[test]
fn prompt_carries_the_raw_ontology_verbatim() {
    let prompt = build_prompt(&job(Vec::new()));

    assert!(prompt.contains(&format!("```yaml\n{}```", Ontology::raw())));
}

#[test]
fn prompt_numbers_the_paragraphs_and_names_the_chapter_and_language() {
    let prompt = build_prompt(&job(Vec::new()));

    assert!(prompt.contains("Chapter title: Chapter one"));
    assert!(prompt.contains("Language of the text: Vietnamese"));
    assert!(prompt.contains("[1] Wren lit the lamp.\n[2] The Guild met.\n"));
}

#[test]
fn prompt_names_the_language_of_each_lang() {
    let mut item = job(Vec::new());
    item.lang = "EN".to_string();
    assert!(build_prompt(&item).contains("Language of the text: English"));

    item.lang = "src".to_string();
    assert!(build_prompt(&item).contains("Language of the text: the original language"));
}

#[test]
fn prompt_states_the_rules() {
    let prompt = build_prompt(&job(Vec::new()));

    assert!(prompt.contains("Entities have no description."));
    assert!(prompt.contains("A scalar fact has no value."));
    assert!(prompt.contains("A character is reached only through persona_of."));
    assert!(prompt.contains("attached to personas"));
    assert!(prompt.contains("titles and aliases only for personas"));
    assert!(prompt.contains("copied verbatim from the paragraph numbered \"p\""));
    assert!(
        prompt.contains("one entity per (type, name) and one fact per (pred, subject, object)")
    );
    assert!(prompt.contains("E1, E2"));
    assert!(prompt.contains("F1, F2"));
}

#[test]
fn prompt_ends_with_the_reply_contract() {
    let prompt = build_prompt(&job(Vec::new()));

    assert!(prompt.contains(
        "Reply with only one JSON object shaped like {\"entities\":[{\"id\":\"E1\",\"type\":\"persona\",\"name\":\"...\",\"titles\":[],\"aliases\":[],\"ev\":[{\"p\":1,\"q\":\"...\"}]}],\"facts\":[{\"id\":\"F1\",\"pred\":\"occupation\",\"subject\":\"E1\",\"object\":\"E2\",\"ev\":[{\"p\":1,\"q\":\"...\"}]}]}."
    ));
    assert!(prompt.contains("Omit `object` on scalar facts."));
    assert!(
        prompt
            .trim_end()
            .ends_with("Do not add commentary or code fences.")
    );
}

#[test]
fn prompt_has_no_known_section_without_known_entities() {
    let prompt = build_prompt(&job(Vec::new()));

    assert!(!prompt.contains("Known entities"));
}

#[test]
fn prompt_lists_every_known_entity() {
    let wren = KnownEntity {
        titles: vec!["lamplighter".to_string()],
        aliases: vec!["Wren Aldous".to_string(), "W.".to_string()],
        character: Some("Aldous".to_string()),
        ..known("persona", "Wren")
    };
    let guild = known("organization", "The Guild");
    let titled = KnownEntity {
        titles: vec!["Captain".to_string()],
        ..known("persona", "Mara")
    };

    let prompt = build_prompt(&job(vec![wren, guild, titled]));

    assert!(prompt.contains("Known entities"));
    assert!(prompt.contains(
        "- persona | Wren | aliases: Wren Aldous, W. | titles: lamplighter | character: Aldous\n"
    ));
    assert!(prompt.contains("- organization | The Guild\n"));
    assert!(prompt.contains("- persona | Mara | titles: Captain\n"));
    assert!(prompt.contains("reuse its exact name and type"));
    assert!(prompt.contains("never invent a new spelling"));
}

#[test]
fn known_entities_come_before_the_chapter_text() {
    let prompt = build_prompt(&job(vec![known("location", "Harbor")]));

    let known_at = prompt.find("- location | Harbor").unwrap();
    let chapter_at = prompt.find("Chapter title:").unwrap();
    assert!(known_at < chapter_at);
}

#[test]
fn fails_without_a_knowledge_provider() {
    let dir = TempDir::new().unwrap();
    let analyzer = analyzer(&dir, None);

    let result = analyzer.analyze(&job(Vec::new()), &|_| {}, &AtomicBool::new(false));

    assert_eq!(
        result,
        Err(AnalyzeError::Failed(
            "No LLM provider is set for knowledge analysis. Choose one in Settings > LLM."
                .to_string()
        ))
    );
}

#[test]
fn cancelled_before_start_does_not_touch_the_provider() {
    let dir = TempDir::new().unwrap();
    let analyzer = analyzer(&dir, None);

    let result = analyzer.analyze(&job(Vec::new()), &|_| {}, &AtomicBool::new(true));

    assert_eq!(result, Err(AnalyzeError::Cancelled));
}

#[test]
fn analyzes_through_the_configured_cli() {
    let dir = TempDir::new().unwrap();
    let reply = "{\"entities\":[{\"id\":\"E1\",\"type\":\"persona\",\"name\":\"Wren\",\"ev\":[{\"p\":1,\"q\":\"Wren lit the lamp.\"}]}],\"facts\":[{\"id\":\"F1\",\"pred\":\"occupation\",\"subject\":\"E1\",\"ev\":[{\"p\":1,\"q\":\"lit the lamp\"}]}]}";
    let path = script(&dir, reply, "", 0);
    let analyzer = analyzer(&dir, Some(("claude", &path)));
    let reported = std::sync::Mutex::new(Vec::new());

    let analysis = analyzer
        .analyze(
            &job(Vec::new()),
            &|value| reported.lock().unwrap().push(value),
            &AtomicBool::new(false),
        )
        .unwrap();

    assert_eq!(analysis.ontology, Ontology::get().version);
    assert_eq!(analysis.entities.len(), 1);
    assert_eq!(analysis.entities[0].name, "Wren");
    assert_eq!(analysis.facts.len(), 1);
    assert_eq!(analysis.facts[0].pred, "occupation");
    assert_eq!(reported.lock().unwrap().last(), Some(&100));
}

#[test]
fn fails_when_the_cli_does_not_return_json() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "I could not do it", "", 0);
    let analyzer = analyzer(&dir, Some(("claude", &path)));

    let result = analyzer.analyze(&job(Vec::new()), &|_| {}, &AtomicBool::new(false));

    assert_eq!(
        result,
        Err(AnalyzeError::Failed(
            "The model did not return a JSON result.".to_string()
        ))
    );
}

#[test]
fn reports_the_cli_failure_detail() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "", "not signed in", 3);
    let analyzer = analyzer(&dir, Some(("codex", &path)));

    let result = analyzer.analyze(&job(Vec::new()), &|_| {}, &AtomicBool::new(false));

    match result {
        Err(AnalyzeError::Failed(message)) => {
            assert!(message.contains("Codex CLI exited"));
            assert!(message.contains("not signed in"));
        }
        other => panic!("unexpected result: {other:?}"),
    }
}

const GOOD: &str = "{\"entities\":[{\"id\":\"E1\",\"type\":\"persona\",\"name\":\"Wren\",\"ev\":[{\"p\":1,\"q\":\"Wren lit the lamp.\"}]},{\"id\":\"E2\",\"type\":\"location\",\"name\":\"Harbor\",\"ev\":[]}],\"facts\":[{\"id\":\"F1\",\"pred\":\"resides_at\",\"subject\":\"E1\",\"object\":\"E2\",\"ev\":[{\"p\":1,\"q\":\"Wren lit the lamp.\"}]}]}";

const BAD: &str = "{\"entities\":[{\"id\":\"E1\",\"type\":\"persona\",\"name\":\"Wren\",\"ev\":[]},{\"id\":\"E2\",\"type\":\"location\",\"name\":\"Harbor\",\"ev\":[]}],\"facts\":[{\"id\":\"F1\",\"pred\":\"resides_at\",\"subject\":\"E2\",\"object\":\"E1\",\"ev\":[]},{\"id\":\"F2\",\"pred\":\"occupation\",\"subject\":\"E1\",\"ev\":[]}]}";

fn run(analyzer: &LlmAnalyzer) -> Result<ChapterAnalysis, AnalyzeError> {
    analyzer.analyze(&job(Vec::new()), &|_| {}, &AtomicBool::new(false))
}

#[test]
fn a_valid_reply_needs_one_call_and_starts_a_named_claude_session() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &[GOOD]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let analysis = run(&analyzer).unwrap();

    assert_eq!(cli.calls(), 1);
    assert_eq!(analysis.facts.len(), 1);
    let args = cli.args(1);
    assert!(args.contains("--session-id"));
    assert!(!args.contains("--no-session-persistence"));
    assert!(cli.stdin(1).contains("Chapter title: Chapter one"));
}

#[test]
fn sends_the_problems_back_into_the_same_claude_session() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &[BAD, GOOD]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let analysis = run(&analyzer).unwrap();

    assert_eq!(cli.calls(), 2);
    let session = cli
        .args(1)
        .split_whitespace()
        .skip_while(|word| *word != "--session-id")
        .nth(1)
        .unwrap()
        .to_string();
    let second = cli.args(2);
    assert!(second.contains(&format!("--resume {session}")));
    assert!(!second.contains("--session-id"));
    let retry = cli.stdin(2);
    assert!(retry.contains("Your reply breaks the ontology rules."));
    assert!(
        retry.contains(
            "fact F1: resides_at needs a subject of type persona, but Harbor is a location"
        )
    );
    assert!(!retry.contains("fact F2"));
    assert!(!retry.contains("Chapter title:"));
    assert_eq!(analysis.facts.len(), 1);
    assert_eq!(analysis.facts[0].subject, "E1");
    assert_eq!(analysis.facts[0].object.as_deref(), Some("E2"));
}

#[test]
fn asks_again_when_the_reply_is_not_json() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &["I could not do it", GOOD]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let analysis = run(&analyzer).unwrap();

    assert_eq!(cli.calls(), 2);
    assert!(
        cli.stdin(2)
            .contains("Your reply could not be used: The model did not return a JSON result.")
    );
    assert_eq!(analysis.entities.len(), 2);
}

#[test]
fn keeps_the_valid_part_after_the_last_retry() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &[BAD, BAD, BAD]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let analysis = run(&analyzer).unwrap();

    assert_eq!(cli.calls(), 3);
    assert_eq!(analysis.entities.len(), 2);
    assert_eq!(analysis.facts.len(), 1);
    assert_eq!(analysis.facts[0].pred, "occupation");
}

#[test]
fn fails_when_every_reply_is_unreadable() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &["no", "still no", "never"]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let result = run(&analyzer);

    assert_eq!(cli.calls(), 3);
    assert_eq!(
        result,
        Err(AnalyzeError::Failed(
            "The model did not return a JSON result.".to_string()
        ))
    );
}

#[test]
fn keeps_the_earlier_result_when_a_retry_call_fails() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &[BAD]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let analysis = run(&analyzer).unwrap();

    assert_eq!(cli.calls(), 2);
    assert_eq!(analysis.entities.len(), 2);
    assert_eq!(analysis.facts.len(), 1);
    assert_eq!(analysis.facts[0].pred, "occupation");
}

#[test]
fn caps_the_listed_problems() {
    let issues: Vec<String> = (1..=35).map(|number| format!("problem {number}")).collect();

    let request = fix_request(&issues);

    assert!(request.contains("- problem 30\n"));
    assert!(!request.contains("problem 31"));
    assert!(request.contains("- and 5 more problems of the same kind\n"));
    assert!(request.contains("complete corrected JSON object"));
}

#[test]
fn continues_a_codex_thread_with_resume() {
    let dir = TempDir::new().unwrap();
    let first = codex_message(BAD);
    let second = codex_message(GOOD);
    let cli = ScriptedCli::new(dir.path(), &[&first, &second]);
    let analyzer = analyzer(&dir, Some(("codex", &cli.path)));

    let analysis = run(&analyzer).unwrap();

    assert_eq!(cli.calls(), 2);
    assert!(cli.args(1).contains("--json"));
    assert!(!cli.args(1).contains("--ephemeral"));
    let second = cli.args(2);
    assert!(second.contains("exec resume"));
    assert!(second.contains("thread-7"));
    assert!(
        cli.stdin(2)
            .contains("Your reply breaks the ontology rules.")
    );
    assert_eq!(analysis.facts.len(), 1);
}

fn codex_message(reply: &str) -> String {
    let message = serde_json::json!({
        "type": "item.completed",
        "item": {"id": "item_0", "type": "agent_message", "text": reply}
    });
    format!(
        "{{\"type\":\"thread.started\",\"thread_id\":\"thread-7\"}}\n{{\"type\":\"turn.started\"}}\n{message}\n{{\"type\":\"turn.completed\"}}\n"
    )
}
