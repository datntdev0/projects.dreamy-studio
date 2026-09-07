use super::*;
use crate::features::assistant::models::AssistantErrorCode;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ChangeTarget;
use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::tools::call;
use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeFact;
use crate::features::knowledge::models::KnowledgeItem;
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
        project_id: None,
    }
}

fn novel_scope(id: i64) -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Novel,
        novel_id: Some(id),
        project_id: None,
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
        linked_novel: None,
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
        linked_novel: None,
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

fn review(findings: Value, dictionary: Value) -> Vec<Value> {
    submit(&args(findings, dictionary)).sink.attachments()
}

fn ids(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

fn resolve_with(
    translation: &FakeTranslation,
    attachments: &mut [Value],
    selected: &[&str],
    status: Decision,
) -> AssistantResult<Vec<AssistantChange>> {
    let sources = sources_with(&novels(), &FakeKnowledge::new(), translation);
    resolve(attachments, &ids(selected), status, &sources, 1)
}

fn statuses(attachment: &Value, list: &str) -> Vec<String> {
    attachment[list]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["status"].as_str().unwrap().to_string())
        .collect()
}

fn full_review() -> Vec<Value> {
    review(
        json!([
            finding(1, "Cảng Sương", "Harrowmere"),
            finding(2, "canh", "giữ")
        ]),
        json!([{ "src": "哈罗米尔", "dst": "Harrowmere", "type": "place", "note": "port" }]),
    )
}

#[test]
fn applying_writes_each_finding_and_dictionary_item_and_marks_them_applied() {
    let translation = translation();
    let mut attachments = full_review();

    let changes = resolve_with(
        &translation,
        &mut attachments,
        &["f1", "f2", "d1"],
        Decision::Applied,
    )
    .unwrap();

    assert_eq!(
        translation.passage_text(1, "VI", "chapter-1-3", 1),
        "Sương phủ Harrowmere."
    );
    assert_eq!(
        translation.passage_text(1, "VI", "chapter-1-3", 2),
        "Người giữ đèn không trả lời. Cảng Sương."
    );
    let book = translation.book(1, "VI");
    let added = book
        .dict
        .iter()
        .find(|entry| entry.src == "哈罗米尔")
        .unwrap();
    assert_eq!(added.dst, "Harrowmere");
    assert_eq!(added.kind, "place");
    assert_eq!(added.note, "port");
    assert_eq!(
        statuses(&attachments[0], "findings"),
        ["applied", "applied"]
    );
    assert_eq!(statuses(&attachments[0], "dictionary"), ["applied"]);
    assert_eq!(translation.writes().len(), 3);
    assert_eq!(changes.len(), 2);
    assert!(
        changes
            .iter()
            .all(|change| change.target == ChangeTarget::Translation)
    );
    assert!(changes.iter().all(|change| change.novel_id == Some(1)));
    assert!(
        changes
            .iter()
            .all(|change| change.translation_target.as_deref() == Some("VI"))
    );
    let chapters: Vec<Option<&str>> = changes
        .iter()
        .map(|change| change.chapter_id.as_deref())
        .collect();
    assert_eq!(chapters, vec![Some("chapter-1-3"), None]);
}

#[test]
fn repeated_findings_in_one_paragraph_emit_one_change() {
    let translation = translation();
    let mut attachments = review(
        json!([
            finding(1, "Sương", "Mù"),
            finding(1, "Cảng Sương", "Harrowmere")
        ]),
        json!([]),
    );

    let changes = resolve_with(
        &translation,
        &mut attachments,
        &["f1", "f2"],
        Decision::Applied,
    )
    .unwrap();

    assert_eq!(
        translation.passage_text(1, "VI", "chapter-1-3", 1),
        "Mù phủ Harrowmere."
    );
    assert_eq!(changes.len(), 1);
}

#[test]
fn only_the_selected_pending_items_are_applied() {
    let translation = translation();
    let mut attachments = full_review();

    resolve_with(
        &translation,
        &mut attachments,
        &["f2", "nope"],
        Decision::Applied,
    )
    .unwrap();

    assert_eq!(
        statuses(&attachments[0], "findings"),
        ["pending", "applied"]
    );
    assert_eq!(statuses(&attachments[0], "dictionary"), ["pending"]);
    assert_eq!(
        translation.passage_text(1, "VI", "chapter-1-3", 1),
        "Sương phủ Cảng Sương."
    );
    assert_eq!(translation.writes().len(), 1);
}

#[test]
fn rejecting_only_sets_the_status() {
    let translation = translation();
    let mut attachments = full_review();

    let changes = resolve_with(
        &translation,
        &mut attachments,
        &["f1", "d1"],
        Decision::Rejected,
    )
    .unwrap();

    assert!(changes.is_empty());
    assert!(translation.writes().is_empty());
    assert_eq!(
        statuses(&attachments[0], "findings"),
        ["rejected", "pending"]
    );
    assert_eq!(statuses(&attachments[0], "dictionary"), ["rejected"]);
}

#[test]
fn a_changed_passage_is_a_conflict_that_applies_nothing() {
    let translation = translation();
    let mut attachments = full_review();
    let sources = sources_with(&novels(), &FakeKnowledge::new(), &translation);
    sources
        .translation
        .passage_save(1, "VI", "chapter-1-3", 2, "Người im lặng.")
        .unwrap();

    let error = resolve_with(
        &translation,
        &mut attachments,
        &["f1", "f2", "d1"],
        Decision::Applied,
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert!(error.detail.contains("f2"));
    assert!(!error.detail.contains("f1"));
    assert!(!error.detail.contains("d1"));
    assert_eq!(translation.writes().len(), 1);
    assert_eq!(
        translation.passage_text(1, "VI", "chapter-1-3", 1),
        "Sương phủ Cảng Sương."
    );
    assert_eq!(
        statuses(&attachments[0], "findings"),
        ["pending", "pending"]
    );
    assert_eq!(statuses(&attachments[0], "dictionary"), ["pending"]);
}

#[test]
fn a_dictionary_source_added_meanwhile_is_a_conflict() {
    let translation = translation();
    let mut attachments = full_review();
    let sources = sources_with(&novels(), &FakeKnowledge::new(), &translation);
    let input = DictInput {
        src: "哈罗米尔".to_string(),
        dst: "Khác".to_string(),
        kind: "place".to_string(),
        note: String::new(),
    };
    sources.translation.dict_add(1, "VI", input).unwrap();

    let error = resolve_with(
        &translation,
        &mut attachments,
        &["f1", "d1"],
        Decision::Applied,
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert!(error.detail.contains("d1"));
    assert_eq!(translation.writes().len(), 1);
    assert_eq!(
        translation.passage_text(1, "VI", "chapter-1-3", 1),
        "Sương phủ Cảng Sương."
    );
}

#[test]
fn a_finding_whose_snippet_was_consumed_by_an_earlier_one_conflicts() {
    let translation = translation();
    let mut attachments = review(
        json!([
            finding(1, "Sương phủ", "Mù"),
            finding(1, "Sương phủ Cảng", "Mù")
        ]),
        json!([]),
    );

    let error = resolve_with(
        &translation,
        &mut attachments,
        &["f1", "f2"],
        Decision::Applied,
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert!(error.detail.contains("f2"));
    assert!(translation.writes().is_empty());
}

#[test]
fn a_chapter_that_left_the_novel_conflicts() {
    let translation = translation();
    let mut attachments = full_review();
    attachments[0]["chapter"] = json!(99);

    let error = resolve_with(
        &translation,
        &mut attachments,
        &["f1", "f2"],
        Decision::Applied,
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert!(error.detail.contains("f1") && error.detail.contains("f2"));
    assert!(translation.writes().is_empty());
}

#[test]
fn already_resolved_items_are_ignored() {
    let translation = translation();
    let mut attachments = full_review();
    resolve_with(&translation, &mut attachments, &["f1"], Decision::Applied).unwrap();
    resolve_with(&translation, &mut attachments, &["f2"], Decision::Rejected).unwrap();
    let writes = translation.writes().len();

    let again = resolve_with(
        &translation,
        &mut attachments,
        &["f1", "f2"],
        Decision::Applied,
    )
    .unwrap();
    let flipped = resolve_with(
        &translation,
        &mut attachments,
        &["f1", "f2"],
        Decision::Rejected,
    )
    .unwrap();

    assert!(again.is_empty() && flipped.is_empty());
    assert_eq!(translation.writes().len(), writes);
    assert_eq!(
        statuses(&attachments[0], "findings"),
        ["applied", "rejected"]
    );
}

#[test]
fn attachments_of_other_kinds_are_left_alone() {
    let translation = translation();
    let mut attachments = full_review();
    attachments.insert(
        0,
        json!({ "kind": "other", "findings": [{ "id": "f1", "status": "pending" }] }),
    );

    resolve_with(&translation, &mut attachments, &["f1"], Decision::Rejected).unwrap();

    assert_eq!(attachments[0]["findings"][0]["status"], "pending");
    assert_eq!(
        statuses(&attachments[1], "findings"),
        ["rejected", "pending"]
    );
}

fn change_knowledge() -> FakeKnowledge {
    FakeKnowledge::new()
        .with_entity("e1", "location", "Harbor", &[], &[], &[1])
        .with_fact("f1", "located_at", "gone", None, &[1])
}

fn knowledge_change(edit: Value) -> Value {
    json!({
        "target": "located_at",
        "before": "Harbor",
        "after": "removed",
        "reason": "dangling",
        "ev": [{ "chapter": 3, "p": 2, "quote": "守灯人没有回答。" }],
        "edit": edit,
    })
}

fn knowledge_args(changes: Vec<Value>) -> Value {
    json!({ "novelId": 1, "lang": "src", "title": "Fix facts", "changes": changes })
}

fn delete_fact() -> Value {
    knowledge_change(json!({ "k": "del", "id": "f1" }))
}

struct Submitted {
    result: Result<ToolOutput, String>,
    sink: RecordingSink,
    knowledge: FakeKnowledge,
}

fn submit_changes_in(scope: &AssistantScope, knowledge: FakeKnowledge, args: &Value) -> Submitted {
    let sink = RecordingSink::new();
    let ctx = ToolContext {
        scope,
        linked_novel: None,
        can_edit: false,
        sink: &sink,
    };
    let sources = sources_with(&novels(), &knowledge, &translation());
    let result = call("submit_knowledge_changes", args, &ctx, &sources);
    Submitted {
        result,
        sink,
        knowledge,
    }
}

fn submit_changes(args: &Value) -> Submitted {
    submit_changes_in(&workspace(), change_knowledge(), args)
}

#[test]
fn submitting_changes_builds_the_change_set_and_validates_it() {
    let run = submit_changes(&knowledge_args(vec![delete_fact()]));

    let value: Value = from_str(&run.result.as_ref().unwrap().text).unwrap();
    assert_eq!(
        value,
        json!({ "validation": { "ok": true, "resolves": 1, "introduces": [] } })
    );
    assert_eq!(
        run.sink.attachments(),
        vec![json!({
            "kind": "knowledge_changes",
            "id": "cs1",
            "title": "Fix facts",
            "edits": 1,
            "validation": { "ok": true, "resolves": 1, "introduces": [] },
            "changes": [{
                "id": "c1",
                "op": "del",
                "target": "located_at",
                "before": "Harbor",
                "after": "removed",
                "reason": "dangling",
                "ev": [{ "novelId": 1, "chapter": 3, "p": 2, "quote": "守灯人没有回答。" }],
            }],
            "status": "pending",
            "lang": "src",
            "novelId": 1,
            "raw": [{ "k": "del", "id": "f1" }],
        })]
    );
    assert!(run.knowledge.calls().is_empty());
    assert_eq!(run.knowledge.previews().len(), 1);
}

#[test]
fn an_edit_that_leaves_the_issue_resolves_nothing() {
    let edit = knowledge_change(json!({ "k": "rename", "id": "e1", "name": "Port" }));

    let run = submit_changes(&knowledge_args(vec![edit]));

    let value: Value = from_str(&run.result.as_ref().unwrap().text).unwrap();
    assert_eq!(value["validation"]["resolves"], 0);
    assert_eq!(value["validation"]["ok"], true);
}

#[test]
fn new_issues_make_the_validation_not_ok_and_list_their_messages() {
    let broken = vec![
        KnowledgeItem::Entity(KnowledgeEntity {
            id: "e1".to_string(),
            entity_type: "location".to_string(),
            name: "Harbor".to_string(),
            titles: Vec::new(),
            aliases: Vec::new(),
            ev: Vec::new(),
            stale: Vec::new(),
        }),
        KnowledgeItem::Fact(KnowledgeFact {
            id: "f1".to_string(),
            pred: "located_at".to_string(),
            subject: "gone".to_string(),
            object: None,
            ev: Vec::new(),
            stale: Vec::new(),
        }),
        KnowledgeItem::Fact(KnowledgeFact {
            id: "f9".to_string(),
            pred: "located_at".to_string(),
            subject: "lost".to_string(),
            object: None,
            ev: Vec::new(),
            stale: Vec::new(),
        }),
    ];
    let knowledge = change_knowledge().with_preview(broken);

    let run = submit_changes_in(
        &workspace(),
        knowledge,
        &knowledge_args(vec![delete_fact()]),
    );

    let value: Value = from_str(&run.result.as_ref().unwrap().text).unwrap();
    let validation = &value["validation"];
    assert_eq!(validation["ok"], false);
    assert_eq!(validation["resolves"], 0);
    let introduces = validation["introduces"].as_array().unwrap();
    assert!(
        introduces
            .iter()
            .any(|text| text.as_str().unwrap().contains("\"lost\""))
    );
    assert_eq!(run.sink.attachments()[0]["validation"], *validation);
}

#[test]
fn an_edit_that_cannot_be_applied_is_a_tool_error_and_attaches_nothing() {
    let knowledge = change_knowledge().with_preview_failure("item f1 not found");

    let run = submit_changes_in(
        &workspace(),
        knowledge,
        &knowledge_args(vec![delete_fact()]),
    );

    let error = run.result.unwrap_err();
    assert!(error.contains("cannot be applied"));
    assert!(error.contains("item f1 not found"));
    assert!(run.sink.attachments().is_empty());
}

#[test]
fn the_op_follows_the_edit_tag() {
    let edits = vec![
        json!({ "k": "rename", "id": "e1", "name": "Port" }),
        json!({ "k": "retype", "id": "e1", "type": "region" }),
        json!({ "k": "merge", "sources": ["e2"], "target": "e1" }),
        json!({ "k": "fact", "id": "f1", "pred": "located_at" }),
        json!({ "k": "props", "id": "e1", "aliases": ["Dock"] }),
        json!({ "k": "evidence", "id": "e1", "add": [{ "chapter": 1, "p": 1, "q": "x" }] }),
        json!({ "k": "add_entity", "ref": "n1", "type": "location", "name": "Pier", "ev": [] }),
        json!({ "k": "add_fact", "ref": "n2", "pred": "located_at", "subject": "e1", "ev": [] }),
        json!({ "k": "del", "id": "f1" }),
    ];
    let changes: Vec<Value> = edits.iter().cloned().map(knowledge_change).collect();

    let run = submit_changes(&knowledge_args(changes));

    let attachment = &run.sink.attachments()[0];
    let ops: Vec<&str> = attachment["changes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|change| change["op"].as_str().unwrap())
        .collect();
    assert_eq!(
        ops,
        [
            "rename",
            "retype",
            "merge",
            "fact",
            "props",
            "evidence",
            "add_entity",
            "add_fact",
            "del"
        ]
    );
    assert_eq!(attachment["edits"], 9);
    assert_eq!(attachment["raw"], json!(edits));
    assert_eq!(attachment["changes"][8]["id"], "c9");
    assert_eq!(run.knowledge.previews()[0].edits.len(), 9);
}

#[test]
fn nullable_text_and_missing_evidence_are_accepted() {
    let change = json!({
        "target": "Harbor",
        "before": null,
        "reason": "why",
        "edit": { "k": "del", "id": "f1" },
    });

    let run = submit_changes(&knowledge_args(vec![change]));

    run.result.as_ref().unwrap();
    let stored = &run.sink.attachments()[0]["changes"][0];
    assert_eq!(stored["before"], Value::Null);
    assert_eq!(stored["after"], Value::Null);
    assert_eq!(stored["ev"], json!([]));
}

#[test]
fn invalid_changes_are_tool_errors() {
    let bad_edit = knowledge_change(json!({ "k": "explode", "id": "f1" }));
    let no_edit = json!({ "target": "t", "before": "b", "after": "a", "reason": "r", "ev": [] });
    let bad_ev = json!({
        "target": "t", "before": "b", "after": "a", "reason": "r",
        "ev": [{ "chapter": 1, "p": 0, "quote": "q" }],
        "edit": { "k": "del", "id": "f1" },
    });
    let no_reason = json!({
        "target": "t", "before": "b", "after": "a", "ev": [],
        "edit": { "k": "del", "id": "f1" },
    });

    for change in [bad_edit, no_edit, bad_ev, no_reason] {
        let run = submit_changes(&knowledge_args(vec![delete_fact(), change]));

        let error = run.result.unwrap_err();
        assert!(error.starts_with("change 1:"), "{error}");
        assert!(run.sink.attachments().is_empty());
        assert!(run.knowledge.previews().is_empty());
    }
}

#[test]
fn submitting_needs_a_valid_envelope_and_the_scope() {
    let missing_title = json!({ "novelId": 1, "lang": "src", "changes": [delete_fact()] });
    let no_changes = knowledge_args(Vec::new());
    let bad_lang = json!({ "novelId": 1, "lang": "FR", "title": "t", "changes": [delete_fact()] });

    assert!(
        submit_changes(&missing_title)
            .result
            .unwrap_err()
            .contains("title")
    );
    assert!(
        submit_changes(&no_changes)
            .result
            .unwrap_err()
            .contains("at least one")
    );
    assert!(submit_changes(&bad_lang).result.unwrap_err().contains("FR"));
    let outside = submit_changes_in(
        &novel_scope(2),
        change_knowledge(),
        &knowledge_args(vec![delete_fact()]),
    );
    assert!(outside.result.unwrap_err().contains("outside"));
    assert!(outside.sink.attachments().is_empty());
}

#[test]
fn submitting_changes_does_not_need_edit_rights_and_labels_the_activity() {
    let run = submit_changes_in(
        &novel_scope(1),
        change_knowledge(),
        &knowledge_args(vec![delete_fact()]),
    );

    let label = run.result.unwrap().label;
    assert!(label.starts_with("submit_knowledge_changes(novel 1, src, 1 sửa)"));
}

fn change_set() -> Vec<Value> {
    submit_changes(&knowledge_args(vec![delete_fact()]))
        .sink
        .attachments()
}

fn resolve_changes(
    knowledge: &FakeKnowledge,
    attachments: &mut [Value],
    selected: &[&str],
    status: Decision,
) -> AssistantResult<Vec<AssistantChange>> {
    let sources = sources_with(&novels(), knowledge, &translation());
    resolve(attachments, &ids(selected), status, &sources, 1)
}

#[test]
fn applying_a_change_set_edits_the_knowledge_and_reports_the_change() {
    let knowledge = change_knowledge();
    let mut attachments = change_set();

    let changes =
        resolve_changes(&knowledge, &mut attachments, &["cs1"], Decision::Applied).unwrap();

    assert_eq!(attachments[0]["status"], "applied");
    assert_eq!(
        changes,
        vec![AssistantChange {
            target: ChangeTarget::Knowledge,
            novel_id: Some(1),
            project_id: None,
            chapter_id: None,
            lang: Some("src".to_string()),
            translation_target: None,
        }]
    );
    let calls = knowledge.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].novel_id, 1);
    assert_eq!(calls[0].lang, "src");
    assert_eq!(
        calls[0].edits,
        vec![KnowledgeEdit::Del {
            id: "f1".to_string()
        }]
    );
    assert_eq!(knowledge.previews().len(), 1);
}

#[test]
fn a_change_set_whose_preview_fails_is_a_conflict_that_applies_nothing() {
    let knowledge = change_knowledge().with_preview_failure("item f1 not found");
    let mut attachments = change_set();

    let error =
        resolve_changes(&knowledge, &mut attachments, &["cs1"], Decision::Applied).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert!(error.detail.contains("item f1 not found"));
    assert!(knowledge.calls().is_empty());
    assert_eq!(attachments[0]["status"], "pending");
}

#[test]
fn a_failing_knowledge_source_is_a_conflict_that_stays_pending() {
    let mut attachments = change_set();
    let failing = FakeKnowledge::new().failing("disk full");

    let error =
        resolve_changes(&failing, &mut attachments, &["cs1"], Decision::Applied).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert!(error.detail.contains("disk full"));
    assert_eq!(attachments[0]["status"], "pending");
    assert!(failing.calls().is_empty());
}

#[test]
fn rejecting_a_change_set_only_sets_the_status() {
    let knowledge = change_knowledge();
    let mut attachments = change_set();

    let changes =
        resolve_changes(&knowledge, &mut attachments, &["cs1"], Decision::Rejected).unwrap();

    assert!(changes.is_empty());
    assert_eq!(attachments[0]["status"], "rejected");
    assert!(knowledge.calls().is_empty());
    assert!(knowledge.previews().is_empty());
}

#[test]
fn a_change_set_is_left_alone_unless_selected_and_pending() {
    let knowledge = change_knowledge();
    let mut attachments = change_set();

    resolve_changes(&knowledge, &mut attachments, &["f1"], Decision::Applied).unwrap();
    assert_eq!(attachments[0]["status"], "pending");

    resolve_changes(&knowledge, &mut attachments, &["cs1"], Decision::Rejected).unwrap();
    let changes =
        resolve_changes(&knowledge, &mut attachments, &["cs1"], Decision::Applied).unwrap();

    assert!(changes.is_empty());
    assert_eq!(attachments[0]["status"], "rejected");
    assert!(knowledge.calls().is_empty());
}

#[test]
fn a_change_set_resolves_next_to_a_translation_review() {
    let knowledge = change_knowledge();
    let mut attachments = full_review();
    attachments.extend(change_set());

    let changes =
        resolve_changes(&knowledge, &mut attachments, &["cs1"], Decision::Applied).unwrap();

    assert_eq!(changes.len(), 1);
    assert_eq!(attachments[1]["status"], "applied");
    assert_eq!(
        statuses(&attachments[0], "findings"),
        ["pending", "pending"]
    );
}
