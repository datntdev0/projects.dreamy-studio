use super::*;
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

fn candidate_job(known: Vec<KnownEntity>) -> CandidateJob {
    CandidateJob {
        lang: "VI".to_string(),
        chapters: vec![
            CandidateChapter {
                seq: 3,
                title: "Chapter three".to_string(),
                paragraphs: vec![
                    "Wren lit the lamp.".to_string(),
                    "The Guild met.".to_string(),
                ],
            },
            CandidateChapter {
                seq: 4,
                title: "Chapter four".to_string(),
                paragraphs: vec!["The Harbor was quiet.".to_string()],
            },
        ],
        known,
    }
}

fn cast_member(id: &str, kind: &str, name: &str) -> AnalysisEntity {
    AnalysisEntity {
        id: id.to_string(),
        kind: kind.to_string(),
        name: name.to_string(),
        titles: Vec::new(),
        aliases: Vec::new(),
        ev: Vec::new(),
    }
}

fn facts_job() -> FactsJob {
    let mut wren = cast_member("E1", "persona", "Wren");
    wren.aliases = vec!["W.".to_string(), "Wren Aldous".to_string()];
    wren.titles = vec!["lamplighter".to_string()];
    FactsJob {
        lang: "EN".to_string(),
        title: "Chapter three".to_string(),
        paragraphs: vec![
            "Wren lit the lamp.".to_string(),
            "The Guild met at the Harbor.".to_string(),
        ],
        entities: vec![wren, cast_member("E2", "location", "Harbor")],
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
fn the_candidate_prompt_lists_the_entity_types_and_not_the_ontology_file() {
    let prompt = build_candidate_prompt(&candidate_job(Vec::new()));

    assert!(prompt.contains("Entity types:\n- persona: "));
    assert!(!prompt.contains("- character: "));
    assert!(prompt.contains("Properties: titles, aliases, character."));
    assert!(prompt.contains("- event: "));
    assert!(!prompt.contains("Predicates:"));
    assert!(!prompt.contains("```yaml"));
    assert!(!prompt.contains("severity"));
    assert!(!prompt.contains("persona_link"));
}

#[test]
fn the_candidate_prompt_carries_every_chapter_of_the_batch() {
    let prompt = build_candidate_prompt(&candidate_job(Vec::new()));

    assert!(prompt.contains("Language of the text: Vietnamese"));
    assert!(prompt.contains("## Chapter 3: Chapter three\nWren lit the lamp.\n\nThe Guild met.\n"));
    assert!(prompt.contains("## Chapter 4: Chapter four\nThe Harbor was quiet.\n"));
    assert!(prompt.find("Chapter 3").unwrap() < prompt.find("Chapter 4").unwrap());
}

#[test]
fn the_candidate_prompt_states_the_rules_and_the_reply_contract() {
    let prompt = build_candidate_prompt(&candidate_job(Vec::new()));

    assert!(prompt.contains("Entities have no description."));
    assert!(prompt.contains("titles, aliases and character only for personas"));
    assert!(prompt.contains("Never list a character as an entity"));
    assert!(prompt.contains("set the character property of the persona"));
    assert!(prompt.contains(
        "Reply with only one JSON object shaped like {\"entities\":[{\"type\":\"persona\",\"name\":\"...\",\"titles\":[],\"aliases\":[],\"character\":\"...\"}]}."
    ));
    assert!(
        prompt
            .trim_end()
            .ends_with("Do not add commentary or code fences.")
    );
}

#[test]
fn the_candidate_prompt_names_the_language_of_each_lang() {
    let mut item = candidate_job(Vec::new());
    item.lang = "EN".to_string();
    assert!(build_candidate_prompt(&item).contains("Language of the text: English"));

    item.lang = "src".to_string();
    assert!(build_candidate_prompt(&item).contains("Language of the text: the original language"));
}

#[test]
fn the_candidate_prompt_has_no_known_section_without_known_entities() {
    assert!(!build_candidate_prompt(&candidate_job(Vec::new())).contains("Known entities"));
}

#[test]
fn the_candidate_prompt_lists_every_known_entity_before_the_chapters() {
    let wren = KnownEntity {
        titles: vec!["lamplighter".to_string()],
        aliases: vec!["Wren Aldous".to_string(), "W.".to_string()],
        character: Some("Aldous".to_string()),
        ..known("persona", "Wren")
    };
    let titled = KnownEntity {
        titles: vec!["Captain".to_string()],
        ..known("persona", "Mara")
    };

    let prompt = build_candidate_prompt(&candidate_job(vec![
        wren,
        known("organization", "The Guild"),
        titled,
    ]));

    assert!(prompt.contains("Known entities"));
    assert!(prompt.contains(
        "- persona | Wren | aliases: Wren Aldous, W. | titles: lamplighter | character: Aldous\n"
    ));
    assert!(prompt.contains("- organization | The Guild\n"));
    assert!(prompt.contains("- persona | Mara | titles: Captain\n"));
    assert!(prompt.contains("reuse its exact name, type and character"));
    assert!(prompt.contains("never invent a new spelling"));
    assert!(prompt.find("- organization | The Guild").unwrap() < prompt.find("Chapter 3").unwrap());
}

#[test]
fn the_facts_prompt_lists_the_chapter_entities_with_their_ids() {
    let prompt = build_facts_prompt(&facts_job());

    assert!(
        prompt.contains("- E1 | persona | Wren | aliases: W., Wren Aldous | titles: lamplighter\n")
    );
    assert!(prompt.contains("- E2 | location | Harbor\n"));
    assert!(!prompt.contains("Entity types:"));
}

#[test]
fn the_facts_prompt_hides_the_characters_of_the_chapter() {
    let mut job = facts_job();
    job.entities.push(cast_member("E9", "character", "Aldous"));

    let prompt = build_facts_prompt(&job);

    assert!(!prompt.contains("E9"));
    assert!(!prompt.contains("| character | Aldous"));
}

#[test]
fn the_candidate_prompt_leaves_characters_out_of_the_known_entities() {
    let prompt = build_candidate_prompt(&candidate_job(vec![
        KnownEntity {
            character: Some("Aldous".to_string()),
            ..known("persona", "Wren")
        },
        known("character", "Aldous"),
    ]));

    assert!(prompt.contains("- persona | Wren | character: Aldous\n"));
    assert!(!prompt.contains("- character | Aldous"));
}

#[test]
fn the_facts_prompt_lists_scalars_and_relationships_with_their_signatures() {
    let prompt = build_facts_prompt(&facts_job());

    assert!(prompt.contains("Predicates:\n"));
    assert!(prompt.contains("- gender: scalar; subject: persona; "));
    assert!(prompt.contains("- meaning: scalar; subject: term or skill or artifact; "));
    assert!(prompt.contains("- member_of: relationship; subject: persona; object: organization; "));
    assert!(
        prompt
            .contains("- owns: relationship; subject: persona or organization; object: artifact; ")
    );
    assert!(!prompt.contains("- persona_of:"));
    assert!(!prompt.contains("severity"));
    assert!(!prompt.contains("```yaml"));
}

#[test]
fn the_facts_prompt_numbers_the_paragraphs_and_states_the_rules() {
    let prompt = build_facts_prompt(&facts_job());

    assert!(prompt.contains("Chapter title: Chapter three"));
    assert!(prompt.contains("Language of the text: English"));
    assert!(prompt.contains("[1] Wren lit the lamp.\n[2] The Guild met at the Harbor.\n"));
    assert!(prompt.contains("Every subject and object is an id from the entity list."));
    assert!(prompt.contains("A scalar fact has no value and no object."));
    assert!(prompt.contains("copied verbatim from the paragraph numbered \"p\""));
    assert!(prompt.contains("Do not list persona_of; it is already known."));
    assert!(prompt.contains(
        "Reply with only one JSON object shaped like {\"facts\":[{\"pred\":\"occupation\",\"subject\":\"E1\",\"object\":\"E2\",\"ev\":[{\"p\":1,\"q\":\"...\"}]}]}."
    ));
    assert!(prompt.contains("Omit `object` on scalar facts."));
    assert!(
        prompt
            .trim_end()
            .ends_with("Do not add commentary or code fences.")
    );
}

const CANDIDATES: &str = "{\"entities\":[{\"type\":\"persona\",\"name\":\"Wren\"},{\"type\":\"location\",\"name\":\"Harbor\"}]}";

const BAD_CANDIDATES: &str = "{\"entities\":[{\"type\":\"persona\",\"name\":\"Wren\"},{\"type\":\"planet\",\"name\":\"Mars\"}]}";

const FACTS: &str = "{\"facts\":[{\"pred\":\"resides_at\",\"subject\":\"E1\",\"object\":\"E2\",\"ev\":[{\"p\":2,\"q\":\"Harbor\"}]}]}";

const BAD_FACTS: &str = "{\"facts\":[{\"pred\":\"resides_at\",\"subject\":\"E2\",\"object\":\"E1\",\"ev\":[]},{\"pred\":\"occupation\",\"subject\":\"E1\",\"ev\":[{\"p\":1,\"q\":\"lit the lamp\"}]}]}";

fn find(analyzer: &LlmAnalyzer) -> Result<Vec<ChapterDraft>, AnalyzeError> {
    analyzer.candidates(
        &candidate_job(Vec::new()),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(false),
    )
}

fn extract(analyzer: &LlmAnalyzer) -> Result<Vec<AnalysisFact>, AnalyzeError> {
    analyzer.facts(
        &facts_job(),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(false),
    )
}

#[test]
fn fails_without_a_knowledge_provider() {
    let dir = TempDir::new().unwrap();
    let analyzer = analyzer(&dir, None);
    let message = "No LLM provider is set for knowledge analysis. Choose one in Settings > LLM.";

    assert_eq!(
        find(&analyzer),
        Err(AnalyzeError::Failed(message.to_string()))
    );
    assert_eq!(
        extract(&analyzer),
        Err(AnalyzeError::Failed(message.to_string()))
    );
}

#[test]
fn cancelled_before_start_does_not_touch_the_provider() {
    let dir = TempDir::new().unwrap();
    let analyzer = analyzer(&dir, None);
    let cancel = AtomicBool::new(true);

    let found = analyzer.candidates(
        &candidate_job(Vec::new()),
        &TaskLog::none(),
        &|_| {},
        &cancel,
    );
    let facts = analyzer.facts(&facts_job(), &TaskLog::none(), &|_| {}, &cancel);

    assert_eq!(found, Err(AnalyzeError::Cancelled));
    assert_eq!(facts, Err(AnalyzeError::Cancelled));
}

#[test]
fn finds_the_candidates_of_every_chapter_through_the_cli() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &[CANDIDATES]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));
    let reported = std::sync::Mutex::new(Vec::new());

    let found = analyzer
        .candidates(
            &candidate_job(Vec::new()),
            &TaskLog::none(),
            &|value| reported.lock().unwrap().push(value),
            &AtomicBool::new(false),
        )
        .unwrap();

    assert_eq!(cli.calls(), 1);
    assert_eq!(found.len(), 2);
    assert_eq!(found[0].entities.len(), 1);
    assert_eq!(found[0].entities[0].name, "Wren");
    assert_eq!(found[0].entities[0].ev[0].p, 1);
    assert_eq!(found[1].entities.len(), 1);
    assert_eq!(found[1].entities[0].name, "Harbor");
    let args = cli.args(1);
    assert!(args.contains("--session-id"));
    assert!(!args.contains("--no-session-persistence"));
    assert!(cli.stdin(1).contains("## Chapter 4: Chapter four"));
    assert_eq!(*reported.lock().unwrap(), [10]);
}

#[test]
fn finds_the_facts_of_a_chapter_through_the_cli() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &[FACTS]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let facts = extract(&analyzer).unwrap();

    assert_eq!(cli.calls(), 1);
    assert_eq!(facts.len(), 1);
    assert_eq!(facts[0].pred, "resides_at");
    assert_eq!(facts[0].subject, "E1");
    assert_eq!(facts[0].object.as_deref(), Some("E2"));
    assert!(cli.stdin(1).contains("- E2 | location | Harbor"));
}

#[test]
fn sends_the_candidate_problems_back_into_the_same_claude_session() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &[BAD_CANDIDATES, CANDIDATES]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let found = find(&analyzer).unwrap();

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
    assert!(retry.contains("entity \"Mars\": type \"planet\" is not in the ontology"));
    assert!(!retry.contains("## Chapter"));
    assert_eq!(found[0].entities.len(), 1);
}

#[test]
fn sends_the_fact_problems_back_into_the_same_session() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &[BAD_FACTS, FACTS]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let facts = extract(&analyzer).unwrap();

    assert_eq!(cli.calls(), 2);
    let retry = cli.stdin(2);
    assert!(retry.contains(
        "a resides_at fact without id: resides_at needs a subject of type persona, but Harbor is a location"
    ));
    assert!(!retry.contains("occupation"));
    assert_eq!(facts.len(), 1);
    assert_eq!(facts[0].subject, "E1");
}

#[test]
fn asks_again_when_the_reply_is_not_json() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &["I could not do it", CANDIDATES]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let found = find(&analyzer).unwrap();

    assert_eq!(cli.calls(), 2);
    assert!(
        cli.stdin(2)
            .contains("Your reply could not be used: The model did not return a JSON result.")
    );
    assert_eq!(found[0].entities.len(), 1);
}

#[test]
fn keeps_the_valid_part_after_the_last_retry() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &[BAD_FACTS, BAD_FACTS, BAD_FACTS]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let facts = extract(&analyzer).unwrap();

    assert_eq!(cli.calls(), 3);
    assert_eq!(facts.len(), 1);
    assert_eq!(facts[0].pred, "occupation");
}

#[test]
fn fails_when_every_reply_is_unreadable() {
    let dir = TempDir::new().unwrap();
    let cli = ScriptedCli::new(dir.path(), &["no", "still no", "never"]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let result = find(&analyzer);

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
    let cli = ScriptedCli::new(dir.path(), &[BAD_CANDIDATES]);
    let analyzer = analyzer(&dir, Some(("claude", &cli.path)));

    let found = find(&analyzer).unwrap();

    assert_eq!(cli.calls(), 2);
    assert_eq!(found[0].entities.len(), 1);
    assert_eq!(found[0].entities[0].name, "Wren");
}

#[test]
fn reports_the_cli_failure_detail() {
    let dir = TempDir::new().unwrap();
    let path = script(&dir, "", "not signed in", 3);
    let analyzer = analyzer(&dir, Some(("codex", &path)));

    match find(&analyzer) {
        Err(AnalyzeError::Failed(message)) => {
            assert!(message.contains("Codex CLI exited"));
            assert!(message.contains("not signed in"));
        }
        other => panic!("unexpected result: {other:?}"),
    }
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
    let first = codex_message(BAD_FACTS);
    let second = codex_message(FACTS);
    let cli = ScriptedCli::new(dir.path(), &[&first, &second]);
    let analyzer = analyzer(&dir, Some(("codex", &cli.path)));

    let facts = extract(&analyzer).unwrap();

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
    assert_eq!(facts.len(), 1);
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
