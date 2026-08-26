use super::*;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::tools::call;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::FakeTranslation;
use crate::testing::assistant::RecordingSink;
use crate::testing::assistant::TranslationWrite;
use crate::testing::assistant::sources_with;
use serde_json::from_str;

fn workspace() -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Workspace,
        novel_id: None,
    }
}

fn novel_scope(id: i64) -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Novel,
        novel_id: Some(id),
    }
}

fn novels() -> FakeNovels {
    FakeNovels::new()
        .with_novel(1, "First")
        .with_chapter(
            1,
            3,
            "Third",
            &["雾锁哈罗米尔。", "守灯人没有回答。哈罗米尔。", "他笑了。"],
        )
        .with_chapter(1, 4, "Fourth", &["x"])
        .with_novel(2, "Second")
}

fn translation() -> FakeTranslation {
    FakeTranslation::new()
        .with_translated_chapter(
            1,
            "VI",
            "chapter-1-3",
            "Chương ba",
            &[
                "Sương phủ Cảng Sương.",
                "Người canh đèn không trả lời. Cảng Sương.",
            ],
        )
        .with_entry(1, "VI", "守灯人", "người giữ đèn", "title", "")
}

fn finding(n: i64, from: &str, to: &str) -> Value {
    json!({
        "n": n,
        "severity": "error",
        "category": "name",
        "from": from,
        "to": to,
        "reason": "because",
    })
}

fn args(findings: Value, dictionary: Value) -> Value {
    json!({
        "novelId": 1,
        "target": "VI",
        "chapter": 3,
        "checked": 2,
        "findings": findings,
        "dictionary": dictionary,
    })
}

struct Run {
    result: Result<ToolOutput, String>,
    sink: RecordingSink,
    translation: FakeTranslation,
}

fn submit_in(scope: &AssistantScope, can_edit: bool, args: &Value) -> Run {
    let sink = RecordingSink::new();
    let translation = translation();
    let ctx = ToolContext {
        scope,
        can_edit,
        sink: &sink,
    };
    let sources = sources_with(&novels(), &FakeKnowledge::new(), &translation);
    let result = call("submit_translation_review", args, &ctx, &sources);
    Run {
        result,
        sink,
        translation,
    }
}

fn submit(args: &Value) -> Run {
    submit_in(&workspace(), false, args)
}

fn reply(run: &Run) -> Value {
    from_str(&run.result.as_ref().unwrap().text).unwrap()
}

#[test]
fn a_valid_payload_builds_the_full_review_without_needing_edit_rights() {
    let payload = args(
        json!([
            finding(1, "Cảng Sương", "Harrowmere"),
            finding(2, "canh", "giữ")
        ]),
        json!([{ "src": "哈罗米尔", "dst": "Harrowmere", "type": "place", "note": "port" }]),
    );

    let run = submit(&payload);

    let value = reply(&run);
    assert_eq!(value["accepted"], json!({ "findings": 2, "dictionary": 1 }));
    assert_eq!(value["dropped"], json!([]));
    let attachments = run.sink.attachments();
    assert_eq!(attachments.len(), 1);
    assert_eq!(
        attachments[0],
        json!({
            "kind": "translation_review",
            "chapter": 3,
            "chapterTitle": "Third",
            "target": "VI",
            "checked": 2,
            "findings": [
                {
                    "id": "f1",
                    "n": 1,
                    "severity": "error",
                    "category": "name",
                    "source": "雾锁哈罗米尔。",
                    "current": "Sương phủ Cảng Sương.",
                    "suggested": "Sương phủ Harrowmere.",
                    "from": "Cảng Sương",
                    "to": "Harrowmere",
                    "reason": "because",
                    "status": "pending"
                },
                {
                    "id": "f2",
                    "n": 2,
                    "severity": "error",
                    "category": "name",
                    "source": "守灯人没有回答。哈罗米尔。",
                    "current": "Người canh đèn không trả lời. Cảng Sương.",
                    "suggested": "Người giữ đèn không trả lời. Cảng Sương.",
                    "from": "canh",
                    "to": "giữ",
                    "reason": "because",
                    "status": "pending"
                }
            ],
            "dictionary": [
                {
                    "id": "d1",
                    "src": "哈罗米尔",
                    "dst": "Harrowmere",
                    "type": "place",
                    "note": "port",
                    "occurrences": 2,
                    "status": "pending"
                }
            ]
        })
    );
    assert!(run.translation.writes().is_empty());
}

#[test]
fn suggested_replaces_only_the_first_occurrence() {
    let run = submit(&args(json!([finding(1, "Sương", "Mù")]), json!([])));

    let attachment = &run.sink.attachments()[0];

    assert_eq!(attachment["findings"][0]["suggested"], "Mù phủ Cảng Sương.");
}

#[test]
fn an_invalid_paragraph_and_a_missing_snippet_are_dropped_with_reasons() {
    let payload = args(
        json!([
            finding(9, "Sương", "Mù"),
            finding(0, "Sương", "Mù"),
            finding(1, "không có", "Mù"),
            finding(1, "", "Mù"),
            { "n": 1, "severity": "fatal", "category": "name", "from": "Sương", "to": "Mù", "reason": "r" },
            { "n": 1, "severity": "error", "category": "name", "from": "Sương" },
            finding(2, "canh", "giữ")
        ]),
        json!([]),
    );

    let run = submit(&payload);

    let value = reply(&run);
    assert_eq!(value["accepted"], json!({ "findings": 1, "dictionary": 0 }));
    let dropped = value["dropped"].as_array().unwrap();
    let indexes: Vec<i64> = dropped
        .iter()
        .map(|item| item["index"].as_i64().unwrap())
        .collect();
    assert_eq!(indexes, vec![0, 1, 2, 3, 4, 5]);
    assert!(dropped.iter().all(|item| item["kind"] == "finding"));
    assert!(
        dropped[0]["reason"]
            .as_str()
            .unwrap()
            .contains("paragraph 9")
    );
    assert!(dropped[2]["reason"].as_str().unwrap().contains("không có"));
    assert!(dropped[4]["reason"].as_str().unwrap().contains("severity"));
    let attachment = &run.sink.attachments()[0];
    assert_eq!(attachment["findings"].as_array().unwrap().len(), 1);
    assert_eq!(attachment["findings"][0]["id"], "f1");
    assert_eq!(attachment["findings"][0]["n"], 2);
}

#[test]
fn dictionary_entries_already_known_or_repeated_are_dropped() {
    let payload = args(
        json!([]),
        json!([
            { "src": "守灯人", "dst": "người canh đèn", "type": "title" },
            { "src": "哈罗米尔", "dst": "Harrowmere", "type": "place" },
            { "src": "哈罗米尔", "dst": "Harrowmere", "type": "place" },
            { "src": "他", "dst": "anh", "type": "bogus" },
            { "src": "雾", "dst": "sương", "type": "term" }
        ]),
    );

    let run = submit(&payload);

    let value = reply(&run);
    assert_eq!(value["accepted"], json!({ "findings": 0, "dictionary": 2 }));
    let dropped = value["dropped"].as_array().unwrap();
    assert_eq!(dropped.len(), 3);
    assert_eq!(dropped[0]["index"], 0);
    assert_eq!(dropped[0]["kind"], "dictionary");
    assert!(dropped[0]["reason"].as_str().unwrap().contains("already"));
    let attachment = &run.sink.attachments()[0];
    assert_eq!(attachment["dictionary"][0]["id"], "d1");
    assert_eq!(attachment["dictionary"][1]["id"], "d2");
    assert_eq!(attachment["dictionary"][1]["occurrences"], 1);
    assert_eq!(attachment["dictionary"][1]["note"], "");
}

#[test]
fn every_submit_attaches_so_the_collector_can_keep_the_last_one() {
    let sink = RecordingSink::new();
    let translation = translation();
    let scope = workspace();
    let ctx = ToolContext {
        scope: &scope,
        can_edit: false,
        sink: &sink,
    };
    let sources = sources_with(&novels(), &FakeKnowledge::new(), &translation);

    for findings in [json!([finding(1, "Sương", "Mù")]), json!([])] {
        call(
            "submit_translation_review",
            &args(findings, json!([])),
            &ctx,
            &sources,
        )
        .unwrap();
    }

    let attachments = sink.attachments();
    assert_eq!(attachments.len(), 2);
    assert_eq!(attachments[0]["findings"].as_array().unwrap().len(), 1);
    assert!(attachments[1]["findings"].as_array().unwrap().is_empty());
}

#[test]
fn checked_defaults_to_the_translated_paragraph_count() {
    let mut payload = args(json!([]), json!([]));
    payload.as_object_mut().unwrap().remove("checked");

    let run = submit(&payload);

    assert_eq!(run.sink.attachments()[0]["checked"], 2);
}

#[test]
fn an_untranslated_or_unknown_chapter_is_an_error_and_attaches_nothing() {
    let mut untranslated = args(json!([]), json!([]));
    untranslated["chapter"] = json!(4);
    let mut unknown = args(json!([]), json!([]));
    unknown["chapter"] = json!(99);

    let first = submit(&untranslated);
    let second = submit(&unknown);

    assert!(first.result.unwrap_err().contains("no VI translation"));
    assert!(second.result.unwrap_err().contains("not found"));
    assert!(first.sink.attachments().is_empty());
    assert!(second.sink.attachments().is_empty());
}

#[test]
fn a_novel_outside_the_scope_is_refused() {
    let run = submit_in(&novel_scope(2), false, &args(json!([]), json!([])));

    assert!(
        run.result
            .unwrap_err()
            .contains("outside the current scope")
    );
    assert!(run.sink.attachments().is_empty());
}

#[test]
fn bad_arguments_are_errors() {
    let mut no_target = args(json!([]), json!([]));
    no_target.as_object_mut().unwrap().remove("target");
    let mut bad_list = args(json!([]), json!([]));
    bad_list["findings"] = json!("nope");

    assert!(submit(&no_target).result.is_err());
    assert!(submit(&bad_list).result.unwrap_err().contains("findings"));
}

#[test]
fn the_label_summarizes_the_review() {
    let run = submit(&args(json!([finding(1, "Sương", "Mù")]), json!([])));

    let label = run.result.unwrap().label;

    assert!(label.starts_with("submit_translation_review(novel 1, ch 3, VI)"));
    assert!(label.contains("1 phát hiện"));
}

#[test]
fn nothing_is_written_to_the_translation() {
    let run = submit(&args(
        json!([finding(1, "Sương", "Mù")]),
        json!([{ "src": "雾", "dst": "sương", "type": "term" }]),
    ));

    let writes: Vec<TranslationWrite> = run.translation.writes();

    assert!(writes.is_empty());
    assert_eq!(
        run.translation.passage_text(1, "VI", "chapter-1-3", 1),
        "Sương phủ Cảng Sương."
    );
}
