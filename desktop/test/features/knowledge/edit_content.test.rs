use super::*;
use crate::features::knowledge::edit::apply;
use crate::features::knowledge::models::KnowledgeFact;
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
            ],
            vec![
                fact("F1", "ally_of", "E1", Some("E2"), &[(2, "watched Wren")]),
                fact("F2", "occupation", "E1", None, &[(1, "lit the lamp")]),
            ],
        ),
        chapter(
            2,
            Some(&[
                "Wren the Keeper returned.",
                "Mara and Tomas waited at the harbor.",
            ]),
            vec![
                entity("E1", "persona", "Wren", &[(1, "Wren the Keeper returned")]),
                entity("E2", "persona", "Mara", &[(2, "Mara and Tomas")]),
                entity("E3", "persona", "Tomas", &[]),
            ],
            Vec::new(),
        ),
        chapter(
            3,
            Some(&[
                "The Keeper Wren slept.",
                "Mara kept watch.",
                "The Lantern Guild met.",
            ]),
            vec![entity("E1", "persona", "Wren", &[(1, "The Keeper Wren")])],
            Vec::new(),
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

fn strings(values: &[&str]) -> Vec<String> {
    lines(values)
}

fn refs(values: &[(i64, usize, &str)]) -> Vec<EvidenceRef> {
    values
        .iter()
        .map(|(chapter, p, q)| EvidenceRef {
            chapter: *chapter,
            p: *p,
            q: q.to_string(),
        })
        .collect()
}

fn props_edit(id: &str, titles: Option<&[&str]>, aliases: Option<&[&str]>) -> KnowledgeEdit {
    KnowledgeEdit::Props {
        id: id.to_string(),
        titles: titles.map(strings),
        aliases: aliases.map(strings),
    }
}

fn evidence_edit(
    id: &str,
    add: &[(i64, usize, &str)],
    remove: &[(i64, usize, &str)],
) -> KnowledgeEdit {
    KnowledgeEdit::Evidence {
        id: id.to_string(),
        add: Some(refs(add)),
        remove: Some(refs(remove)),
    }
}

fn add_entity_edit(
    reference: &str,
    entity_type: &str,
    name: &str,
    ev: &[(i64, usize, &str)],
) -> KnowledgeEdit {
    KnowledgeEdit::AddEntity {
        reference: reference.to_string(),
        entity_type: entity_type.to_string(),
        name: name.to_string(),
        titles: None,
        aliases: None,
        ev: refs(ev),
    }
}

fn add_persona_edit(
    reference: &str,
    name: &str,
    titles: &[&str],
    ev: &[(i64, usize, &str)],
) -> KnowledgeEdit {
    KnowledgeEdit::AddEntity {
        reference: reference.to_string(),
        entity_type: "persona".to_string(),
        name: name.to_string(),
        titles: Some(strings(titles)),
        aliases: None,
        ev: refs(ev),
    }
}

fn add_fact_edit(
    reference: &str,
    pred: &str,
    subject: &str,
    object: Option<&str>,
    ev: &[(i64, usize, &str)],
) -> KnowledgeEdit {
    KnowledgeEdit::AddFact {
        reference: reference.to_string(),
        pred: pred.to_string(),
        subject: subject.to_string(),
        object: object.map(str::to_string),
        ev: refs(ev),
    }
}

fn character_edit(persona: &str) -> KnowledgeEdit {
    KnowledgeEdit::Character {
        persona: persona.to_string(),
    }
}

fn dirty(chapters: &[LoadedChapter]) -> Vec<bool> {
    chapters.iter().map(|item| item.dirty).collect()
}

fn names(chapter: &LoadedChapter) -> Vec<String> {
    chapter
        .file
        .entities
        .iter()
        .map(|item| item.name.clone())
        .collect()
}

fn find<'a>(chapter: &'a LoadedChapter, name: &str) -> &'a AnalysisEntity {
    chapter
        .file
        .entities
        .iter()
        .find(|item| item.name == name)
        .expect("entity exists")
}

fn view_entity(chapters: &[LoadedChapter], id: &str) -> Option<KnowledgeEntity> {
    merge(KnowledgeLang::Vi, chapters)
        .items
        .into_iter()
        .find_map(|item| match item {
            KnowledgeItem::Entity(entity) if entity.id == id => Some(entity),
            _ => None,
        })
}

fn view_fact(chapters: &[LoadedChapter], id: &str) -> Option<KnowledgeFact> {
    merge(KnowledgeLang::Vi, chapters)
        .items
        .into_iter()
        .find_map(|item| match item {
            KnowledgeItem::Fact(fact) if fact.id == id => Some(fact),
            _ => None,
        })
}

fn quote_chapters(ev: &[crate::features::knowledge::models::KnowledgeEvidence]) -> Vec<i64> {
    ev.iter().map(|item| item.chapter).collect()
}

#[test]
fn props_removal_hits_every_file() {
    let mut chapters = world();
    chapters[0].file.entities[0].aliases = strings(&["Wren Aldous"]);
    chapters[1].file.entities[0].aliases = strings(&["wren  aldous", "Keeper"]);
    chapters[2].file.entities[0].titles = strings(&["Lamplighter"]);

    run(
        &mut chapters,
        vec![props_edit(
            &persona_id("Wren"),
            Some(&[]),
            Some(&["Keeper"]),
        )],
    );

    assert!(chapters[0].file.entities[0].aliases.is_empty());
    assert_eq!(chapters[1].file.entities[0].aliases, strings(&["Keeper"]));
    assert!(chapters[2].file.entities[0].titles.is_empty());
    assert_eq!(dirty(&chapters), vec![true, true, true]);
}

#[test]
fn props_adds_a_value_to_the_earliest_chapter_whose_text_has_it() {
    let mut chapters = world();
    chapters[0].file.entities[0].aliases = strings(&["Wren Aldous"]);

    run(
        &mut chapters,
        vec![props_edit(
            &persona_id("Wren"),
            None,
            Some(&["Wren Aldous", " keeper ", "KEEPER"]),
        )],
    );

    assert_eq!(
        chapters[0].file.entities[0].aliases,
        strings(&["Wren Aldous"])
    );
    assert_eq!(chapters[1].file.entities[0].aliases, strings(&["keeper"]));
    assert!(chapters[2].file.entities[0].aliases.is_empty());
    assert_eq!(dirty(&chapters), vec![false, true, false]);
    let merged = view_entity(&chapters, &persona_id("Wren")).unwrap();
    assert_eq!(merged.aliases, strings(&["Wren Aldous", "keeper"]));
}

#[test]
fn props_adds_titles_and_aliases_in_one_edit() {
    let mut chapters = world();

    run(
        &mut chapters,
        vec![props_edit(
            &persona_id("Mara"),
            Some(&["Vale"]),
            Some(&["Mara Vale"]),
        )],
    );

    assert_eq!(chapters[0].file.entities[1].titles, strings(&["Vale"]));
    assert_eq!(
        chapters[0].file.entities[1].aliases,
        strings(&["Mara Vale"])
    );
    assert!(chapters[1].file.entities[1].titles.is_empty());
}

#[test]
fn props_rejects_an_alias_absent_from_every_text() {
    let mut chapters = world();

    let error = fails(
        &mut chapters,
        vec![props_edit(&persona_id("Wren"), None, Some(&["Ghost"]))],
    );

    assert_eq!(error.code, KnowledgeErrorCode::TextNotFound);
    assert!(error.detail.contains("Ghost"));
    assert_eq!(dirty(&chapters), vec![false, false, false]);
}

#[test]
fn props_only_searches_the_chapters_that_contain_the_persona() {
    let mut chapters = world();

    let error = fails(
        &mut chapters,
        vec![props_edit(&persona_id("Mara"), None, Some(&["Lantern"]))],
    );

    assert_eq!(error.code, KnowledgeErrorCode::TextNotFound);
}

#[test]
fn props_rejects_a_non_persona_an_unknown_id_and_an_empty_edit() {
    let mut chapters = world();
    let harbor = entity_id("location", "Harbor");

    let kind = fails(&mut chapters, vec![props_edit(&harbor, None, Some(&[]))]);
    let unknown = fails(&mut chapters, vec![props_edit("Enope", None, Some(&[]))]);
    let empty = fails(
        &mut chapters,
        vec![props_edit(&persona_id("Wren"), None, None)],
    );

    assert_eq!(kind.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(unknown.code, KnowledgeErrorCode::NotFound);
    assert_eq!(empty.code, KnowledgeErrorCode::InvalidInput);
}

#[test]
fn evidence_add_materializes_an_entity_in_a_chapter_that_lacked_it() {
    let mut chapters = world();
    let harbor = entity_id("location", "Harbor");

    run(
        &mut chapters,
        vec![evidence_edit(&harbor, &[(2, 2, "the harbor")], &[])],
    );

    let created = find(&chapters[1], "Harbor");
    assert_eq!(created.id, "E4");
    assert_eq!(created.kind, "location");
    assert_eq!(created.ev, vec![ev(2, "the harbor")]);
    assert_eq!(dirty(&chapters), vec![false, true, false]);
    let merged = view_entity(&chapters, &harbor).unwrap();
    assert_eq!(quote_chapters(&merged.ev), vec![1, 2]);
}

#[test]
fn evidence_add_materializes_a_persona_without_titles_or_aliases() {
    let mut chapters = world();
    chapters[0].file.entities[1].titles = strings(&["Vale"]);

    run(
        &mut chapters,
        vec![evidence_edit(
            &persona_id("Mara"),
            &[(3, 2, "Mara kept watch")],
            &[],
        )],
    );

    let created = find(&chapters[2], "Mara");
    assert!(created.titles.is_empty());
    assert!(created.aliases.is_empty());
    assert_eq!(created.ev, vec![ev(2, "Mara kept watch")]);
}

#[test]
fn evidence_add_materializes_a_fact_and_its_entities_in_a_chapter_that_lacked_them() {
    let mut chapters = world();
    let id = ally("Wren", "Mara");

    run(
        &mut chapters,
        vec![evidence_edit(&id, &[(3, 2, "Mara kept watch")], &[])],
    );

    assert_eq!(names(&chapters[2]), strings(&["Wren", "Mara"]));
    assert!(find(&chapters[2], "Mara").ev.is_empty());
    let created = &chapters[2].file.facts[0];
    assert_eq!(created.id, "F1");
    assert_eq!(created.pred, "ally_of");
    assert_eq!(created.subject, "E1");
    assert_eq!(created.object.as_deref(), Some("E2"));
    assert_eq!(created.ev, vec![ev(2, "Mara kept watch")]);
    assert_eq!(dirty(&chapters), vec![false, false, true]);
    let merged = view_fact(&chapters, &id).unwrap();
    assert_eq!(quote_chapters(&merged.ev), vec![1, 3]);
}

#[test]
fn evidence_add_extends_an_existing_item_without_duplicates() {
    let mut chapters = world();
    let id = ally("Wren", "Mara");

    run(
        &mut chapters,
        vec![evidence_edit(
            &id,
            &[(1, 2, "watched  WREN"), (1, 2, "Mara Vale watched Wren")],
            &[],
        )],
    );

    assert_eq!(chapters[0].file.facts[0].ev.len(), 2);
    assert_eq!(chapters[0].file.facts.len(), 2);
}

#[test]
fn evidence_with_an_unverifiable_quote_is_rejected_and_nothing_is_dirty() {
    let mut chapters = world();
    let before = chapters.clone();

    let error = fails(
        &mut chapters,
        vec![evidence_edit(
            &entity_id("location", "Harbor"),
            &[
                (2, 2, "the harbor"),
                (2, 1, "no such words"),
                (1, 9, "lamp"),
            ],
            &[],
        )],
    );

    assert_eq!(error.code, KnowledgeErrorCode::EvidenceInvalid);
    assert!(error.detail.contains("chapter 2 paragraph 1"));
    assert!(error.detail.contains("chapter 1 paragraph 9"));
    assert_eq!(dirty(&chapters), vec![false, false, false]);
    for (after, original) in chapters.iter().zip(before.iter()) {
        assert_eq!(after.file, original.file);
    }
}

#[test]
fn evidence_without_chapter_text_is_invalid() {
    let mut chapters = world();
    chapters[1].text = None;

    let error = fails(
        &mut chapters,
        vec![evidence_edit(
            &entity_id("location", "Harbor"),
            &[(2, 2, "the harbor")],
            &[],
        )],
    );

    assert_eq!(error.code, KnowledgeErrorCode::EvidenceInvalid);
}

#[test]
fn evidence_in_a_chapter_that_is_not_analyzed_is_not_found() {
    let mut chapters = world();

    let error = fails(
        &mut chapters,
        vec![evidence_edit(
            &entity_id("location", "Harbor"),
            &[(9, 1, "the harbor")],
            &[],
        )],
    );

    assert_eq!(error.code, KnowledgeErrorCode::NotFound);
    assert!(error.detail.contains('9'));
}

#[test]
fn removing_the_last_quote_keeps_the_item() {
    let mut chapters = world();
    let harbor = entity_id("location", "Harbor");

    run(
        &mut chapters,
        vec![evidence_edit(&harbor, &[], &[(1, 2, "  THE   harbor ")])],
    );

    assert!(find(&chapters[0], "Harbor").ev.is_empty());
    assert_eq!(dirty(&chapters), vec![true, false, false]);
    let merged = view_entity(&chapters, &harbor).unwrap();
    assert!(merged.ev.is_empty());
}

#[test]
fn removing_a_fact_quote_keeps_the_fact() {
    let mut chapters = world();
    let id = ally("Wren", "Mara");

    run(
        &mut chapters,
        vec![evidence_edit(&id, &[], &[(1, 2, "watched Wren")])],
    );

    assert!(chapters[0].file.facts[0].ev.is_empty());
    assert!(view_fact(&chapters, &id).unwrap().ev.is_empty());
}

#[test]
fn removing_a_ref_that_does_not_exist_is_not_found() {
    let mut chapters = world();
    let harbor = entity_id("location", "Harbor");

    let quote = fails(
        &mut chapters,
        vec![evidence_edit(&harbor, &[], &[(1, 2, "another quote")])],
    );
    let file = fails(
        &mut chapters,
        vec![evidence_edit(&harbor, &[], &[(2, 2, "the harbor")])],
    );
    let chapter = fails(
        &mut chapters,
        vec![evidence_edit(&harbor, &[], &[(9, 2, "the harbor")])],
    );

    assert_eq!(quote.code, KnowledgeErrorCode::NotFound);
    assert_eq!(file.code, KnowledgeErrorCode::NotFound);
    assert_eq!(chapter.code, KnowledgeErrorCode::NotFound);
    assert_eq!(dirty(&chapters), vec![false, false, false]);
}

#[test]
fn evidence_needs_a_known_id_and_something_to_do() {
    let mut chapters = world();

    let unknown = fails(
        &mut chapters,
        vec![evidence_edit("Fnope", &[(1, 1, "lamp")], &[])],
    );
    let empty = fails(
        &mut chapters,
        vec![evidence_edit(&persona_id("Wren"), &[], &[])],
    );

    assert_eq!(unknown.code, KnowledgeErrorCode::NotFound);
    assert_eq!(empty.code, KnowledgeErrorCode::InvalidInput);
}

#[test]
fn add_entity_without_evidence_is_rejected() {
    let mut chapters = world();

    let error = fails(
        &mut chapters,
        vec![add_entity_edit(
            "new1",
            "organization",
            "Lantern Guild",
            &[],
        )],
    );

    assert_eq!(error.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(dirty(&chapters), vec![false, false, false]);
}

#[test]
fn add_entity_appears_in_the_merged_view_and_is_recorded_in_the_remap() {
    let mut chapters = world();

    let remap = run(
        &mut chapters,
        vec![add_entity_edit(
            "new1",
            "organization",
            " Lantern Guild ",
            &[(3, 3, "The Lantern Guild met")],
        )],
    );

    let id = entity_id("organization", "Lantern Guild");
    assert_eq!(remap.get("new1"), Some(&id));
    let created = find(&chapters[2], "Lantern Guild");
    assert_eq!(created.id, "E2");
    assert_eq!(created.ev, vec![ev(3, "The Lantern Guild met")]);
    assert_eq!(dirty(&chapters), vec![false, false, true]);
    let merged = view_entity(&chapters, &id).unwrap();
    assert_eq!(merged.entity_type, "organization");
    assert_eq!(quote_chapters(&merged.ev), vec![3]);
    assert!(merged.ev[0].verified);
}

#[test]
fn add_entity_with_a_name_missing_from_a_named_chapter_is_rejected() {
    let mut chapters = world();

    let error = fails(
        &mut chapters,
        vec![add_entity_edit(
            "new1",
            "organization",
            "Lantern Guild",
            &[(3, 3, "The Lantern Guild met"), (1, 1, "Wren Aldous lit")],
        )],
    );

    assert_eq!(error.code, KnowledgeErrorCode::TextNotFound);
    assert_eq!(error.detail, "name not found in chapters 1");
    assert_eq!(dirty(&chapters), vec![false, false, false]);
}

#[test]
fn add_entity_rejects_bad_input() {
    let mut chapters = world();
    let quote = [(3, 3, "The Lantern Guild met")];
    let mut titled = add_entity_edit("new1", "organization", "Lantern Guild", &quote);
    if let KnowledgeEdit::AddEntity { titles, .. } = &mut titled {
        *titles = Some(strings(&["Chief"]));
    }

    let non_persona = fails(&mut chapters, vec![titled]);
    let unknown_type = fails(
        &mut chapters,
        vec![add_entity_edit("new1", "wizard", "Lantern Guild", &quote)],
    );
    let empty = fails(
        &mut chapters,
        vec![add_entity_edit("new1", "organization", "  ", &quote)],
    );
    let invalid_quote = fails(
        &mut chapters,
        vec![add_entity_edit(
            "new1",
            "organization",
            "Lantern Guild",
            &[(3, 3, "The Lantern Guild fell")],
        )],
    );
    let not_analyzed = fails(
        &mut chapters,
        vec![add_entity_edit(
            "new1",
            "organization",
            "Lantern Guild",
            &[(9, 1, "The Lantern Guild met")],
        )],
    );

    assert_eq!(non_persona.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(unknown_type.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(empty.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(invalid_quote.code, KnowledgeErrorCode::EvidenceInvalid);
    assert_eq!(not_analyzed.code, KnowledgeErrorCode::NotFound);
}

#[test]
fn add_entity_on_an_existing_key_extends_it_in_the_named_chapters_only() {
    let mut chapters = world();
    let mara = persona_id("Mara");

    let remap = run(
        &mut chapters,
        vec![add_persona_edit(
            "new1",
            "Mara",
            &["Lady", "lady"],
            &[(1, 2, "Mara Vale watched Wren"), (2, 2, "Mara and Tomas")],
        )],
    );

    assert_eq!(remap.get("new1"), Some(&mara));
    assert_eq!(chapters[0].file.entities.len(), 3);
    let first = find(&chapters[0], "Mara");
    assert_eq!(first.ev.len(), 2);
    assert_eq!(first.titles, strings(&["Lady"]));
    assert_eq!(find(&chapters[1], "Mara").ev.len(), 1);
    assert_eq!(find(&chapters[1], "Mara").titles, strings(&["Lady"]));
    assert_eq!(chapters[2].file.entities.len(), 1);
    assert_eq!(dirty(&chapters), vec![true, true, false]);
}

#[test]
fn add_fact_materializes_the_subject_and_object_in_the_chapter_file() {
    let mut chapters = world();
    let id = fact_id("enemy_of", &persona_id("Wren"), Some(&persona_id("Tomas")));

    let remap = run(
        &mut chapters,
        vec![add_fact_edit(
            "fact1",
            "enemy_of",
            &persona_id("Wren"),
            Some(&persona_id("Tomas")),
            &[(3, 2, "Mara kept watch")],
        )],
    );

    assert_eq!(remap.get("fact1"), Some(&id));
    assert_eq!(names(&chapters[2]), strings(&["Wren", "Tomas"]));
    assert!(find(&chapters[2], "Tomas").ev.is_empty());
    let created = &chapters[2].file.facts[0];
    assert_eq!(created.subject, "E1");
    assert_eq!(created.object.as_deref(), Some("E2"));
    assert_eq!(dirty(&chapters), vec![false, false, true]);
    assert_eq!(
        quote_chapters(&view_fact(&chapters, &id).unwrap().ev),
        vec![3]
    );
}

#[test]
fn add_fact_scalar_has_no_object() {
    let mut chapters = world();
    let id = fact_id("occupation", &persona_id("Wren"), None);

    run(
        &mut chapters,
        vec![add_fact_edit(
            "fact1",
            "occupation",
            &persona_id("Wren"),
            None,
            &[(2, 1, "Wren the Keeper returned")],
        )],
    );

    assert_eq!(chapters[1].file.facts.len(), 1);
    assert_eq!(chapters[1].file.facts[0].object, None);
    assert!(view_fact(&chapters, &id).is_some());
}

#[test]
fn add_fact_extends_an_existing_fact() {
    let mut chapters = world();

    let remap = run(
        &mut chapters,
        vec![add_fact_edit(
            "fact1",
            "ally_of",
            &persona_id("Wren"),
            Some(&persona_id("Mara")),
            &[(1, 2, "Mara Vale watched Wren")],
        )],
    );

    assert_eq!(chapters[0].file.facts.len(), 2);
    assert_eq!(chapters[0].file.facts[0].ev.len(), 2);
    assert_eq!(remap.get("fact1"), Some(&ally("Wren", "Mara")));
}

#[test]
fn add_fact_rejects_a_scalar_with_an_object_and_a_relationship_without_one() {
    let mut chapters = world();
    let quote = [(1, 1, "Wren Aldous lit")];

    let scalar = fails(
        &mut chapters,
        vec![add_fact_edit(
            "fact1",
            "occupation",
            &persona_id("Wren"),
            Some(&persona_id("Mara")),
            &quote,
        )],
    );
    let relationship = fails(
        &mut chapters,
        vec![add_fact_edit(
            "fact1",
            "ally_of",
            &persona_id("Wren"),
            None,
            &quote,
        )],
    );

    assert_eq!(scalar.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(relationship.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(dirty(&chapters), vec![false, false, false]);
}

#[test]
fn add_fact_rejects_missing_evidence_unknown_pred_and_unknown_entities() {
    let mut chapters = world();
    let wren = persona_id("Wren");
    let quote = [(1, 1, "Wren Aldous lit")];

    let no_ev = fails(
        &mut chapters,
        vec![add_fact_edit("f", "occupation", &wren, None, &[])],
    );
    let pred = fails(
        &mut chapters,
        vec![add_fact_edit("f", "loves", &wren, Some(&wren), &quote)],
    );
    let subject = fails(
        &mut chapters,
        vec![add_fact_edit("f", "occupation", "Enope", None, &quote)],
    );
    let object = fails(
        &mut chapters,
        vec![add_fact_edit("f", "ally_of", &wren, Some("Enope"), &quote)],
    );
    let invalid_quote = fails(
        &mut chapters,
        vec![add_fact_edit(
            "f",
            "occupation",
            &wren,
            None,
            &[(1, 1, "nothing like this")],
        )],
    );

    assert_eq!(no_ev.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(pred.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(subject.code, KnowledgeErrorCode::NotFound);
    assert_eq!(object.code, KnowledgeErrorCode::NotFound);
    assert_eq!(invalid_quote.code, KnowledgeErrorCode::EvidenceInvalid);
}

#[test]
fn add_fact_works_with_a_ref_created_earlier_in_the_same_request() {
    let mut chapters = world();
    let guild = entity_id("organization", "Lantern Guild");
    let quote = [(3, 3, "The Lantern Guild met")];

    let remap = run(
        &mut chapters,
        vec![
            add_entity_edit("new1", "organization", "Lantern Guild", &quote),
            add_fact_edit(
                "fact1",
                "member_of",
                &persona_id("Wren"),
                Some("new1"),
                &quote,
            ),
        ],
    );

    let id = fact_id("member_of", &persona_id("Wren"), Some(&guild));
    assert_eq!(remap.get("new1"), Some(&guild));
    assert_eq!(remap.get("fact1"), Some(&id));
    assert!(view_fact(&chapters, &id).is_some());
}

#[test]
fn add_fact_rejects_a_self_relation() {
    let mut chapters = world();
    let wren = persona_id("Wren");

    let error = fails(
        &mut chapters,
        vec![add_fact_edit(
            "f",
            "ally_of",
            &wren,
            Some(&wren),
            &[(1, 1, "Wren Aldous lit")],
        )],
    );

    assert_eq!(error.code, KnowledgeErrorCode::InvalidInput);
}

#[test]
fn add_fact_allows_a_domain_and_range_mismatch() {
    let mut chapters = world();
    let harbor = entity_id("location", "Harbor");
    let id = fact_id("member_of", &harbor, Some(&persona_id("Wren")));

    run(
        &mut chapters,
        vec![add_fact_edit(
            "f",
            "member_of",
            &harbor,
            Some(&persona_id("Wren")),
            &[(1, 1, "Wren Aldous lit")],
        )],
    );

    assert!(view_fact(&chapters, &id).is_some());
}

#[test]
fn character_creates_the_character_and_the_link_in_every_file_with_the_persona() {
    let mut chapters = world();
    let wren = persona_id("Wren");

    run(&mut chapters, vec![character_edit(&wren)]);

    for chapter in &chapters {
        let persona = chapter
            .file
            .entities
            .iter()
            .find(|item| item.kind == "persona" && item.name == "Wren")
            .unwrap();
        let character = chapter
            .file
            .entities
            .iter()
            .find(|item| item.kind == "character" && item.name == "Wren")
            .unwrap();
        assert_eq!(character.ev, persona.ev);
        let link = chapter
            .file
            .facts
            .iter()
            .find(|item| item.pred == "persona_of")
            .unwrap();
        assert_eq!(link.subject, persona.id);
        assert_eq!(link.object.as_deref(), Some(character.id.as_str()));
        assert_eq!(link.ev, persona.ev);
    }
    assert_eq!(dirty(&chapters), vec![true, true, true]);
    let link = fact_id("persona_of", &wren, Some(&entity_id("character", "Wren")));
    assert_eq!(
        quote_chapters(&view_fact(&chapters, &link).unwrap().ev),
        vec![1, 2, 3]
    );
}

#[test]
fn character_reuses_an_existing_character_entity() {
    let mut chapters = world();
    chapters[0]
        .file
        .entities
        .push(entity("E4", "character", "Wren", &[(1, "Wren Aldous lit")]));

    run(&mut chapters, vec![character_edit(&persona_id("Wren"))]);

    let characters = chapters[0]
        .file
        .entities
        .iter()
        .filter(|item| item.kind == "character")
        .count();
    assert_eq!(characters, 1);
    let link = chapters[0]
        .file
        .facts
        .iter()
        .find(|item| item.pred == "persona_of")
        .unwrap();
    assert_eq!(link.object.as_deref(), Some("E4"));
}

#[test]
fn character_is_rejected_when_a_link_already_exists() {
    let mut chapters = world();
    chapters[1]
        .file
        .entities
        .push(entity("E4", "character", "Wren", &[]));
    chapters[1]
        .file
        .facts
        .push(fact("F1", "persona_of", "E1", Some("E4"), &[]));

    let error = fails(&mut chapters, vec![character_edit(&persona_id("Wren"))]);

    assert_eq!(error.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(dirty(&chapters), vec![false, false, false]);
}

#[test]
fn character_needs_an_existing_persona() {
    let mut chapters = world();

    let unknown = fails(&mut chapters, vec![character_edit("Enope")]);
    let kind = fails(
        &mut chapters,
        vec![character_edit(&entity_id("location", "Harbor"))],
    );

    assert_eq!(unknown.code, KnowledgeErrorCode::NotFound);
    assert_eq!(kind.code, KnowledgeErrorCode::InvalidInput);
}

#[test]
fn content_edits_failing_later_leave_the_earlier_ones_unapplied() {
    let mut chapters = world();
    let before = chapters.clone();

    let error = fails(
        &mut chapters,
        vec![
            props_edit(&persona_id("Mara"), Some(&["Vale"]), None),
            props_edit(&persona_id("Mara"), None, Some(&["Ghost"])),
        ],
    );

    assert_eq!(error.code, KnowledgeErrorCode::TextNotFound);
    assert_eq!(dirty(&chapters), vec![false, false, false]);
    assert_eq!(chapters[0].file, before[0].file);
}

#[test]
fn apply_content_rejects_edits_of_other_kinds() {
    let mut chapters = world();
    let mut remap = HashMap::new();
    let edit = KnowledgeEdit::Del {
        id: persona_id("Wren"),
    };

    let error = apply_content(&mut chapters, &mut remap, &edit).unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::InvalidInput);
}
