use super::*;
use crate::features::knowledge::merge::merge;
use crate::features::knowledge::models::KnowledgeFact;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::knowledge::text::text_hash;

fn lines(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

fn ev(p: usize, q: &str) -> AnalysisEvidence {
    AnalysisEvidence {
        p,
        q: q.to_string(),
    }
}

fn entity(id: &str, kind: &str, name: &str, evidence: &[(usize, &str)]) -> AnalysisEntity {
    AnalysisEntity {
        id: id.to_string(),
        kind: kind.to_string(),
        name: name.to_string(),
        titles: Vec::new(),
        aliases: Vec::new(),
        ev: evidence.iter().map(|(p, q)| ev(*p, q)).collect(),
    }
}

fn fact(
    id: &str,
    pred: &str,
    subject: &str,
    object: Option<&str>,
    evidence: &[(usize, &str)],
) -> AnalysisFact {
    AnalysisFact {
        id: id.to_string(),
        pred: pred.to_string(),
        subject: subject.to_string(),
        object: object.map(str::to_string),
        ev: evidence.iter().map(|(p, q)| ev(*p, q)).collect(),
    }
}

fn chapter(
    seq: i64,
    text: Option<&[&str]>,
    entities: Vec<AnalysisEntity>,
    facts: Vec<AnalysisFact>,
) -> LoadedChapter {
    let text = text.map(lines);
    let source_hash = text.as_deref().map(text_hash).unwrap_or_default();
    LoadedChapter {
        seq,
        id: format!("chapter-{seq}"),
        file: ChapterAnalysis {
            ontology: 1,
            source_hash,
            analyzed_at: format!("2026-11-18T10:00:0{seq}Z"),
            entities,
            facts,
        },
        text,
        dirty: false,
    }
}

fn world() -> Vec<LoadedChapter> {
    vec![
        chapter(
            1,
            Some(&[
                "Wren Aldous lit the lamp.",
                "Mara Vale watched Wren at the harbor.",
            ]),
            vec![
                entity("E1", "persona", "Wren", &[(1, "Wren Aldous lit")]),
                entity("E2", "persona", "Mara", &[(2, "Mara Vale watched")]),
                entity("E3", "location", "Harbor", &[(2, "the harbor")]),
                entity("E4", "persona", "Tomas", &[]),
            ],
            vec![
                fact("F1", "ally_of", "E1", Some("E2"), &[(2, "watched Wren")]),
                fact("F2", "occupation", "E1", None, &[(1, "lit the lamp")]),
                fact("F3", "resides_at", "E1", Some("E3"), &[(2, "the harbor")]),
            ],
        ),
        chapter(
            2,
            Some(&["Wren Aldous returned.", "Mara and Tomas waited."]),
            vec![
                entity("E1", "persona", "Wren", &[(1, "Wren Aldous returned")]),
                entity("E2", "persona", "Mara", &[(2, "Mara and Tomas")]),
                entity("E3", "persona", "Tomas", &[]),
            ],
            vec![fact("F1", "ally_of", "E1", Some("E2"), &[(2, "Mara and")])],
        ),
    ]
}

fn persona_id(name: &str) -> String {
    entity_id("persona", name)
}

fn ally(subject: &str, object: &str) -> String {
    fact_id("ally_of", &persona_id(subject), Some(&persona_id(object)))
}

fn run(chapters: &mut Vec<LoadedChapter>, edits: Vec<KnowledgeEdit>) -> HashMap<String, String> {
    apply(chapters, &edits).expect("edits apply")
}

fn fails(chapters: &mut Vec<LoadedChapter>, edits: Vec<KnowledgeEdit>) -> KnowledgeError {
    apply(chapters, &edits).expect_err("edits are rejected")
}

fn rename_edit(id: &str, name: &str) -> KnowledgeEdit {
    KnowledgeEdit::Rename {
        id: id.to_string(),
        name: name.to_string(),
    }
}

fn retype_edit(id: &str, entity_type: &str) -> KnowledgeEdit {
    KnowledgeEdit::Retype {
        id: id.to_string(),
        entity_type: entity_type.to_string(),
    }
}

fn del_edit(id: &str) -> KnowledgeEdit {
    KnowledgeEdit::Del { id: id.to_string() }
}

fn merge_edit(sources: &[&str], target: &str) -> KnowledgeEdit {
    KnowledgeEdit::Merge {
        sources: sources.iter().map(|value| value.to_string()).collect(),
        target: target.to_string(),
    }
}

fn fact_edit(
    id: &str,
    pred: Option<&str>,
    subject: Option<&str>,
    object: Option<&str>,
) -> KnowledgeEdit {
    KnowledgeEdit::Fact {
        id: id.to_string(),
        pred: pred.map(str::to_string),
        subject: subject.map(str::to_string),
        object: object.map(str::to_string),
    }
}

fn names(chapter: &LoadedChapter) -> Vec<String> {
    chapter
        .file
        .entities
        .iter()
        .map(|item| item.name.clone())
        .collect()
}

fn dirty(chapters: &[LoadedChapter]) -> Vec<bool> {
    chapters.iter().map(|item| item.dirty).collect()
}

fn view(chapters: &[LoadedChapter]) -> WireKnowledge {
    merge(KnowledgeLang::Vi, chapters)
}

fn view_entity_names(chapters: &[LoadedChapter]) -> Vec<String> {
    let mut found: Vec<String> = view(chapters)
        .items
        .into_iter()
        .filter_map(|item| match item {
            KnowledgeItem::Entity(entity) => Some(entity.name),
            KnowledgeItem::Fact(_) => None,
        })
        .collect();
    found.sort();
    found
}

fn view_facts(chapters: &[LoadedChapter]) -> Vec<KnowledgeFact> {
    view(chapters)
        .items
        .into_iter()
        .filter_map(|item| match item {
            KnowledgeItem::Fact(fact) => Some(fact),
            KnowledgeItem::Entity(_) => None,
        })
        .collect()
}

#[test]
fn rename_sets_the_name_in_every_file_and_remaps_the_ids() {
    let mut chapters = world();
    let old_fact = ally("Wren", "Mara");

    let remap = run(
        &mut chapters,
        vec![rename_edit(&persona_id("Wren"), " Wren Aldous ")],
    );

    assert_eq!(names(&chapters[0])[0], "Wren Aldous");
    assert_eq!(names(&chapters[1])[0], "Wren Aldous");
    assert_eq!(dirty(&chapters), vec![true, true]);
    assert_eq!(
        remap.get(&persona_id("Wren")),
        Some(&persona_id("Wren Aldous"))
    );
    assert_eq!(remap.get(&old_fact), Some(&ally("Wren Aldous", "Mara")));
    assert!(view_entity_names(&chapters).contains(&"Wren Aldous".to_string()));
    assert!(
        view_facts(&chapters)
            .iter()
            .any(|item| item.id == ally("Wren Aldous", "Mara"))
    );
}

#[test]
fn rename_to_a_name_missing_from_one_chapter_is_rejected_and_nothing_is_dirty() {
    let mut chapters = world();
    let before = chapters.clone();

    let error = fails(
        &mut chapters,
        vec![rename_edit(&persona_id("Mara"), "Mara Vale")],
    );

    assert_eq!(error.code, KnowledgeErrorCode::TextNotFound);
    assert_eq!(error.detail, "name not found in chapters 2");
    assert_eq!(dirty(&chapters), vec![false, false]);
    assert_eq!(chapters[0].file, before[0].file);
    assert_eq!(chapters[1].file, before[1].file);
}

#[test]
fn rename_counts_a_chapter_without_text_as_missing() {
    let mut chapters = world();
    chapters[1].text = None;

    let error = fails(
        &mut chapters,
        vec![rename_edit(&persona_id("Wren"), "Wren Aldous")],
    );

    assert_eq!(error.code, KnowledgeErrorCode::TextNotFound);
    assert_eq!(error.detail, "name not found in chapters 2");
}

#[test]
fn rename_rejects_an_unknown_id_and_an_empty_name() {
    let mut chapters = world();

    let unknown = fails(&mut chapters, vec![rename_edit("Enope", "Wren")]);
    let empty = fails(&mut chapters, vec![rename_edit(&persona_id("Wren"), "  ")]);

    assert_eq!(unknown.code, KnowledgeErrorCode::NotFound);
    assert_eq!(empty.code, KnowledgeErrorCode::InvalidInput);
}

#[test]
fn rename_onto_an_existing_entity_folds_them() {
    let mut chapters = world();
    let file = &mut chapters[0].file;
    let mut twin = entity("E5", "persona", "Wren Aldous", &[(1, "Wren Aldous lit")]);
    twin.aliases = lines(&["the Keeper"]);
    file.entities.push(twin);
    file.facts.push(fact(
        "F4",
        "ally_of",
        "E5",
        Some("E2"),
        &[(1, "Wren Aldous lit")],
    ));
    file.facts.push(fact("F5", "kin_of", "E1", Some("E5"), &[]));

    run(
        &mut chapters,
        vec![rename_edit(&persona_id("Wren"), "Wren Aldous")],
    );

    let file = &chapters[0].file;
    assert_eq!(
        names(&chapters[0]),
        lines(&["Wren Aldous", "Mara", "Harbor", "Tomas"])
    );
    assert_eq!(file.entities[0].id, "E1");
    assert_eq!(file.entities[0].aliases, lines(&["the Keeper"]));
    assert_eq!(file.entities[0].ev.len(), 1);
    assert_eq!(file.facts.len(), 3);
    assert_eq!(file.facts[0].ev.len(), 2);
    assert!(file.facts.iter().all(|item| item.pred != "kin_of"));
    assert_eq!(names(&chapters[1])[0], "Wren Aldous");
}

#[test]
fn retype_sets_the_type_in_every_file_and_remaps_dependent_facts() {
    let mut chapters = world();
    let old_fact = fact_id(
        "resides_at",
        &persona_id("Wren"),
        Some(&entity_id("location", "Harbor")),
    );

    let remap = run(
        &mut chapters,
        vec![retype_edit(
            &entity_id("location", "Harbor"),
            "organization",
        )],
    );

    assert_eq!(chapters[0].file.entities[2].kind, "organization");
    assert_eq!(dirty(&chapters), vec![true, false]);
    assert_eq!(
        remap.get(&entity_id("location", "Harbor")),
        Some(&entity_id("organization", "Harbor"))
    );
    let new_fact = fact_id(
        "resides_at",
        &persona_id("Wren"),
        Some(&entity_id("organization", "Harbor")),
    );
    assert_eq!(remap.get(&old_fact), Some(&new_fact));
    assert!(view_facts(&chapters).iter().any(|item| item.id == new_fact));
}

#[test]
fn retype_onto_an_existing_key_folds() {
    let mut chapters = world();
    let file = &mut chapters[0].file;
    file.entities
        .push(entity("E5", "organization", "Harbor", &[(1, "lamp")]));
    file.facts
        .push(fact("F4", "member_of", "E1", Some("E5"), &[]));

    run(
        &mut chapters,
        vec![retype_edit(
            &entity_id("location", "Harbor"),
            "organization",
        )],
    );

    let file = &chapters[0].file;
    assert_eq!(
        file.entities
            .iter()
            .filter(|item| item.name == "Harbor")
            .count(),
        1
    );
    let harbor = file
        .entities
        .iter()
        .find(|item| item.name == "Harbor")
        .unwrap();
    assert_eq!(harbor.kind, "organization");
    assert_eq!(harbor.ev.len(), 2);
    assert_eq!(file.facts.len(), 4);
    assert!(
        file.facts
            .iter()
            .all(|item| item.object.as_deref() != Some("E5"))
    );
}

#[test]
fn retype_away_from_persona_with_titles_is_rejected() {
    let mut chapters = world();
    chapters[0].file.entities[0].titles = lines(&["Keeper"]);

    let error = fails(
        &mut chapters,
        vec![retype_edit(&persona_id("Wren"), "location")],
    );

    assert_eq!(error.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(dirty(&chapters), vec![false, false]);
}

#[test]
fn retype_rejects_an_unknown_type_and_allows_moving_into_persona() {
    let mut chapters = world();

    let error = fails(
        &mut chapters,
        vec![retype_edit(&persona_id("Wren"), "wizard")],
    );
    let remap = run(
        &mut chapters,
        vec![retype_edit(&entity_id("location", "Harbor"), "persona")],
    );

    assert_eq!(error.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(
        remap.get(&entity_id("location", "Harbor")),
        Some(&persona_id("Harbor"))
    );
}

#[test]
fn del_removes_an_entity_and_its_facts_from_every_file() {
    let mut chapters = world();

    run(&mut chapters, vec![del_edit(&persona_id("Wren"))]);

    assert_eq!(names(&chapters[0]), lines(&["Mara", "Harbor", "Tomas"]));
    assert_eq!(names(&chapters[1]), lines(&["Mara", "Tomas"]));
    assert!(chapters[0].file.facts.is_empty());
    assert!(chapters[1].file.facts.is_empty());
    assert_eq!(dirty(&chapters), vec![true, true]);
    assert!(!view_entity_names(&chapters).contains(&"Wren".to_string()));
}

#[test]
fn del_removes_a_fact_from_every_file_and_keeps_the_entities() {
    let mut chapters = world();

    run(&mut chapters, vec![del_edit(&ally("Wren", "Mara"))]);

    assert_eq!(chapters[0].file.facts.len(), 2);
    assert!(chapters[1].file.facts.is_empty());
    assert_eq!(chapters[0].file.entities.len(), 4);
    assert_eq!(dirty(&chapters), vec![true, true]);
}

#[test]
fn del_of_an_unknown_id_is_not_found() {
    let mut chapters = world();

    let error = fails(&mut chapters, vec![del_edit("Fnope")]);

    assert_eq!(error.code, KnowledgeErrorCode::NotFound);
}

#[test]
fn merge_folds_sources_into_the_target_and_renames_where_the_target_is_missing() {
    let mut chapters = world();
    let file = &mut chapters[0].file;
    let mut twin = entity("E5", "persona", "Wren Aldous", &[(1, "Wren Aldous lit")]);
    twin.aliases = lines(&["the Keeper"]);
    file.entities.push(twin);
    file.facts
        .push(fact("F4", "enemy_of", "E5", Some("E2"), &[]));
    chapters[1].file.entities[0].name = "Wren Aldous".to_string();
    let old_ally = fact_id(
        "ally_of",
        &persona_id("Wren Aldous"),
        Some(&persona_id("Mara")),
    );

    let remap = run(
        &mut chapters,
        vec![merge_edit(
            &[&persona_id("Wren Aldous")],
            &persona_id("Wren"),
        )],
    );

    assert_eq!(
        names(&chapters[0]),
        lines(&["Wren", "Mara", "Harbor", "Tomas"])
    );
    assert_eq!(chapters[0].file.entities[0].aliases, lines(&["the Keeper"]));
    assert!(
        chapters[0]
            .file
            .facts
            .iter()
            .any(|item| item.pred == "enemy_of" && item.subject == "E1")
    );
    assert_eq!(names(&chapters[1])[0], "Wren");
    assert_eq!(dirty(&chapters), vec![true, true]);
    assert_eq!(
        remap.get(&persona_id("Wren Aldous")),
        Some(&persona_id("Wren"))
    );
    assert_eq!(remap.get(&old_ally), Some(&ally("Wren", "Mara")));
    let view_names = view_entity_names(&chapters);
    assert_eq!(
        view_names
            .iter()
            .filter(|name| name.starts_with("Wren"))
            .count(),
        1
    );
}

#[test]
fn merge_of_different_types_is_rejected() {
    let mut chapters = world();

    let error = fails(
        &mut chapters,
        vec![merge_edit(
            &[&entity_id("location", "Harbor")],
            &persona_id("Wren"),
        )],
    );

    assert_eq!(error.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(dirty(&chapters), vec![false, false]);
}

#[test]
fn merge_needs_sources_other_than_the_target_and_known_ids() {
    let mut chapters = world();
    let wren = persona_id("Wren");

    let empty = fails(&mut chapters, vec![merge_edit(&[&wren], &wren)]);
    let unknown = fails(&mut chapters, vec![merge_edit(&["Enope"], &wren)]);

    assert_eq!(empty.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(unknown.code, KnowledgeErrorCode::NotFound);
}

#[test]
fn fact_changes_pred_and_object_in_every_file() {
    let mut chapters = world();

    let remap = run(
        &mut chapters,
        vec![fact_edit(
            &ally("Wren", "Mara"),
            Some("enemy_of"),
            None,
            Some(&persona_id("Tomas")),
        )],
    );

    let new_id = fact_id("enemy_of", &persona_id("Wren"), Some(&persona_id("Tomas")));
    assert_eq!(remap.get(&ally("Wren", "Mara")), Some(&new_id));
    assert_eq!(chapters[0].file.facts[0].pred, "enemy_of");
    assert_eq!(chapters[0].file.facts[0].object.as_deref(), Some("E4"));
    assert_eq!(chapters[1].file.facts[0].object.as_deref(), Some("E3"));
    assert_eq!(dirty(&chapters), vec![true, true]);
    assert!(view_facts(&chapters).iter().any(|item| item.id == new_id));
}

#[test]
fn fact_to_an_object_missing_from_one_chapter_is_rejected_with_the_seq() {
    let mut chapters = world();

    let error = fails(
        &mut chapters,
        vec![fact_edit(
            &ally("Wren", "Mara"),
            None,
            None,
            Some(&entity_id("location", "Harbor")),
        )],
    );

    assert_eq!(error.code, KnowledgeErrorCode::RefNotFound);
    assert!(error.detail.contains("chapters 2"));
    assert_eq!(dirty(&chapters), vec![false, false]);
}

#[test]
fn fact_rejects_unknown_refs_kind_changes_and_scalar_objects() {
    let mut chapters = world();
    let scalar = fact_id("occupation", &persona_id("Wren"), None);

    let missing = fails(
        &mut chapters,
        vec![fact_edit(&ally("Wren", "Mara"), None, None, Some("Enope"))],
    );
    let kind = fails(
        &mut chapters,
        vec![fact_edit(&ally("Wren", "Mara"), Some("age"), None, None)],
    );
    let unknown = fails(
        &mut chapters,
        vec![fact_edit(&ally("Wren", "Mara"), Some("loves"), None, None)],
    );
    let object = fails(
        &mut chapters,
        vec![fact_edit(&scalar, None, None, Some(&persona_id("Mara")))],
    );
    let nothing = fails(
        &mut chapters,
        vec![fact_edit(&ally("Wren", "Mara"), None, None, None)],
    );

    assert_eq!(missing.code, KnowledgeErrorCode::NotFound);
    assert_eq!(kind.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(unknown.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(object.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(nothing.code, KnowledgeErrorCode::InvalidInput);
}

#[test]
fn fact_onto_an_existing_fact_deduplicates() {
    let mut chapters = world();
    chapters[1]
        .file
        .facts
        .push(fact("F2", "ally_of", "E1", Some("E3"), &[(2, "Tomas")]));

    run(
        &mut chapters,
        vec![fact_edit(
            &ally("Wren", "Tomas"),
            None,
            None,
            Some(&persona_id("Mara")),
        )],
    );

    assert_eq!(chapters[1].file.facts.len(), 1);
    assert_eq!(chapters[1].file.facts[0].ev.len(), 2);
}

#[test]
fn an_id_renamed_earlier_in_the_request_still_resolves() {
    let mut chapters = world();
    let wren = persona_id("Wren");

    let remap = run(
        &mut chapters,
        vec![
            rename_edit(&wren, "Wren Aldous"),
            retype_edit(&wren, "persona"),
            del_edit(&ally("Wren", "Mara")),
        ],
    );

    assert_eq!(remap.get(&wren), Some(&persona_id("Wren Aldous")));
    assert!(
        chapters[0]
            .file
            .facts
            .iter()
            .all(|item| item.pred != "ally_of")
    );
}

#[test]
fn a_chain_of_renames_maps_the_first_id_to_the_last() {
    let mut chapters = world();
    chapters[0].text = Some(lines(&["Wren Aldous Vale lit.", "Mara Vale watched Wren."]));
    chapters[1].text = Some(lines(&["Wren Aldous Vale returned."]));
    let wren = persona_id("Wren");

    let remap = run(
        &mut chapters,
        vec![
            rename_edit(&wren, "Wren Aldous"),
            rename_edit(&persona_id("Wren Aldous"), "Wren Aldous Vale"),
        ],
    );

    let last = persona_id("Wren Aldous Vale");
    assert_eq!(remap.get(&wren), Some(&last));
    assert_eq!(remap.get(&persona_id("Wren Aldous")), Some(&last));
    assert_eq!(names(&chapters[1])[0], "Wren Aldous Vale");
}

#[test]
fn a_failing_second_edit_leaves_the_first_unapplied() {
    let mut chapters = world();
    let before = chapters.clone();

    let error = fails(
        &mut chapters,
        vec![
            rename_edit(&persona_id("Wren"), "Wren Aldous"),
            del_edit("Enope"),
        ],
    );

    assert_eq!(error.code, KnowledgeErrorCode::NotFound);
    assert_eq!(dirty(&chapters), vec![false, false]);
    assert_eq!(chapters[0].file, before[0].file);
    assert_eq!(chapters[1].file, before[1].file);
}

#[test]
fn an_edit_without_changes_keeps_the_chapters_clean() {
    let mut chapters = world();

    let remap = run(
        &mut chapters,
        vec![rename_edit(&persona_id("Wren"), "Wren")],
    );
    let empty = run(&mut chapters, Vec::new());

    assert!(remap.is_empty());
    assert!(empty.is_empty());
    assert_eq!(dirty(&chapters), vec![false, false]);
}

#[test]
fn helpers_report_ids_locations_and_text() {
    let chapters = world();
    let file = &chapters[0].file;

    assert_eq!(
        entity_locations(&chapters, &persona_id("Tomas")),
        vec![(0, 3), (1, 2)]
    );
    assert_eq!(
        fact_locations(&chapters, &ally("Wren", "Mara")),
        vec![(0, 0), (1, 0)]
    );
    assert_eq!(merged_id_of(file, "E2"), Some(persona_id("Mara")));
    assert_eq!(merged_id_of(file, "E9"), None);
    assert_eq!(next_local_id(file, 'E'), "E5");
    assert_eq!(next_local_id(file, 'F'), "F4");
    assert!(text_has(&chapters[0].text, "  MARA   vale "));
    assert!(!text_has(&None, "Wren"));
    assert_eq!(seq_list(&chapters, &[0, 1]), "1, 2");
}
