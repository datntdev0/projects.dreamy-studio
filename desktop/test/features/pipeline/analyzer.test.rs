use super::*;
use crate::features::knowledge::ontology::Ontology;
use crate::features::settings::llm::CliSettings;
use crate::features::settings::llm::FeatureSettings;
use crate::features::settings::models::AppSettings;
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
