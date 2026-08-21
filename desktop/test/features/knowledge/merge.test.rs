use super::*;
use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeFact;

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

fn persona(id: &str, name: &str, titles: &[&str], aliases: &[&str]) -> AnalysisEntity {
    AnalysisEntity {
        titles: lines(titles),
        aliases: lines(aliases),
        ..entity(id, "persona", name, &[])
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

fn with_hash(mut loaded: LoadedChapter, hash: &str) -> LoadedChapter {
    loaded.file.source_hash = hash.to_string();
    loaded
}

fn entities(knowledge: &WireKnowledge) -> Vec<&KnowledgeEntity> {
    knowledge
        .items
        .iter()
        .filter_map(|item| match item {
            KnowledgeItem::Entity(entity) => Some(entity),
            KnowledgeItem::Fact(_) => None,
        })
        .collect()
}

fn facts(knowledge: &WireKnowledge) -> Vec<&KnowledgeFact> {
    knowledge
        .items
        .iter()
        .filter_map(|item| match item {
            KnowledgeItem::Fact(fact) => Some(fact),
            KnowledgeItem::Entity(_) => None,
        })
        .collect()
}

fn ids(knowledge: &WireKnowledge) -> BTreeSet<String> {
    knowledge
        .items
        .iter()
        .map(|item| match item {
            KnowledgeItem::Entity(entity) => entity.id.clone(),
            KnowledgeItem::Fact(fact) => fact.id.clone(),
        })
        .collect()
}

fn sample(seq: i64, local: &[&str; 3]) -> LoadedChapter {
    chapter(
        seq,
        Some(&["Wren lit the lamp.", "Mara watched."]),
        vec![
            entity(local[0], "persona", "Wren", &[(1, "Wren lit")]),
            entity(local[1], "persona", "Mara", &[(2, "Mara watched")]),
        ],
        vec![fact(
            local[2],
            "ally_of",
            local[0],
            Some(local[1]),
            &[(2, "Mara watched")],
        )],
    )
}

#[test]
fn entity_id_is_prefixed_short_hex_of_type_and_normalized_name() {
    let id = entity_id("persona", "Wren");

    assert_eq!(id.len(), 13);
    assert!(id.starts_with('E'));
    assert!(
        id[1..]
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
    );
    assert_eq!(id, entity_id("persona", "  WREN "));
    assert_ne!(id, entity_id("location", "Wren"));
    assert_ne!(id, entity_id("persona", "Mara"));
}

#[test]
fn fact_id_is_prefixed_short_hex_of_key() {
    let id = fact_id("ally_of", "Ea", Some("Eb"));

    assert_eq!(id.len(), 13);
    assert!(id.starts_with('F'));
    assert_ne!(id, fact_id("ally_of", "Eb", Some("Ea")));
    assert_ne!(id, fact_id("enemy_of", "Ea", Some("Eb")));
    assert_ne!(
        fact_id("occupation", "Ea", None),
        fact_id("occupation", "Eb", None)
    );
    assert_eq!(
        fact_id("occupation", "Ea", None),
        fact_id("occupation", "Ea", None)
    );
}

#[test]
fn same_entity_with_different_case_becomes_one_with_majority_name() {
    let chapters = vec![
        chapter(1, None, vec![entity("E1", "persona", "Wren", &[])], vec![]),
        chapter(2, None, vec![entity("E1", "persona", "wren", &[])], vec![]),
        chapter(3, None, vec![entity("E1", "persona", "wren", &[])], vec![]),
    ];

    let knowledge = merge(KnowledgeLang::Vi, &chapters);

    let merged = entities(&knowledge);
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].name, "wren");
    assert_eq!(merged[0].id, entity_id("persona", "Wren"));
}

#[test]
fn name_tie_goes_to_the_earliest_spelling() {
    let chapters = vec![
        chapter(1, None, vec![entity("E1", "persona", "Wren", &[])], vec![]),
        chapter(2, None, vec![entity("E1", "persona", "WREN", &[])], vec![]),
    ];
    let reversed = vec![chapters[1].clone(), chapters[0].clone()];

    assert_eq!(
        entities(&merge(KnowledgeLang::Src, &chapters))[0].name,
        "Wren"
    );
    assert_eq!(
        entities(&merge(KnowledgeLang::Src, &reversed))[0].name,
        "WREN"
    );
}

#[test]
fn a_spelling_is_counted_once_per_file() {
    let doubled = vec![
        entity("E1", "persona", "WREN", &[]),
        entity("E2", "persona", "WREN", &[]),
    ];
    let chapters = vec![
        chapter(1, None, vec![entity("E1", "persona", "Wren", &[])], vec![]),
        chapter(2, None, doubled, vec![]),
        chapter(3, None, vec![entity("E1", "persona", "Wren", &[])], vec![]),
    ];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    assert_eq!(entities(&knowledge)[0].name, "Wren");
}

#[test]
fn different_types_stay_separate_entities() {
    let chapters = vec![chapter(
        1,
        None,
        vec![
            entity("E1", "persona", "Wren", &[]),
            entity("E2", "character", "Wren", &[]),
        ],
        vec![],
    )];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    assert_eq!(entities(&knowledge).len(), 2);
}

#[test]
fn titles_and_aliases_are_unioned_and_deduped_by_norm() {
    let chapters = vec![
        chapter(
            1,
            None,
            vec![persona(
                "E1",
                "Wren",
                &["Lamp Keeper", "Sir"],
                &["Wren Aldous"],
            )],
            vec![],
        ),
        chapter(
            2,
            None,
            vec![persona(
                "E1",
                "wren",
                &["lamp  keeper", "Captain"],
                &["WREN ALDOUS", "The Wren"],
            )],
            vec![],
        ),
    ];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    let merged = entities(&knowledge);
    assert_eq!(merged[0].titles, lines(&["Lamp Keeper", "Sir", "Captain"]));
    assert_eq!(merged[0].aliases, lines(&["Wren Aldous", "The Wren"]));
}

#[test]
fn scalar_facts_of_the_same_subject_union_their_quotes() {
    let chapters = vec![
        chapter(
            1,
            Some(&["Wren is a lamplighter."]),
            vec![entity("E1", "persona", "Wren", &[])],
            vec![fact(
                "F1",
                "occupation",
                "E1",
                None,
                &[(1, "a lamplighter")],
            )],
        ),
        chapter(
            2,
            Some(&["Wren keeps the light."]),
            vec![entity("E9", "persona", "Wren", &[])],
            vec![fact(
                "F7",
                "occupation",
                "E9",
                None,
                &[(1, "keeps the light")],
            )],
        ),
    ];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    let merged = facts(&knowledge);
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].object, None);
    assert_eq!(merged[0].subject, entity_id("persona", "Wren"));
    assert_eq!(
        merged[0].id,
        fact_id("occupation", &entity_id("persona", "Wren"), None)
    );
    let quotes: Vec<(i64, &str)> = merged[0]
        .ev
        .iter()
        .map(|item| (item.chapter, item.q.as_str()))
        .collect();
    assert_eq!(quotes, vec![(1, "a lamplighter"), (2, "keeps the light")]);
}

#[test]
fn relationship_facts_union_across_chapters() {
    let chapters = vec![
        sample(1, &["E1", "E2", "F1"]),
        sample(2, &["E5", "E6", "F4"]),
    ];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    assert_eq!(entities(&knowledge).len(), 2);
    let merged = facts(&knowledge);
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].ev.len(), 2);
    assert_eq!(merged[0].object, Some(entity_id("persona", "Mara")));
}

#[test]
fn a_fact_with_an_unresolved_local_id_is_skipped() {
    let chapters = vec![chapter(
        1,
        None,
        vec![entity("E1", "persona", "Wren", &[])],
        vec![
            fact("F1", "ally_of", "E1", Some("E404"), &[]),
            fact("F2", "ally_of", "E404", Some("E1"), &[]),
            fact("F3", "occupation", "E404", None, &[]),
            fact("F4", "occupation", "E1", None, &[]),
        ],
    )];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    let merged = facts(&knowledge);
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].pred, "occupation");
}

#[test]
fn a_local_id_only_resolves_in_its_own_file() {
    let chapters = vec![
        chapter(1, None, vec![entity("E1", "persona", "Wren", &[])], vec![]),
        chapter(
            2,
            None,
            vec![entity("E2", "persona", "Mara", &[])],
            vec![fact("F1", "ally_of", "E2", Some("E1"), &[])],
        ),
    ];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    assert!(facts(&knowledge).is_empty());
}

#[test]
fn a_self_relation_is_skipped() {
    let chapters = vec![chapter(
        1,
        None,
        vec![
            entity("E1", "persona", "Wren", &[]),
            entity("E2", "persona", "wren", &[]),
            entity("E3", "persona", "Mara", &[]),
        ],
        vec![
            fact("F1", "ally_of", "E1", Some("E1"), &[]),
            fact("F2", "ally_of", "E1", Some("E2"), &[]),
            fact("F3", "ally_of", "E1", Some("E3"), &[]),
        ],
    )];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    let merged = facts(&knowledge);
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].object, Some(entity_id("persona", "Mara")));
}

#[test]
fn verified_follows_the_chapter_text() {
    let chapters = vec![
        chapter(
            1,
            Some(&["Wren  lit the LAMP.", "Mara watched."]),
            vec![entity(
                "E1",
                "persona",
                "Wren",
                &[
                    (1, "lit the lamp"),
                    (2, "lit the lamp"),
                    (1, "missing"),
                    (9, "Wren"),
                ],
            )],
            vec![],
        ),
        chapter(
            2,
            None,
            vec![entity("E1", "persona", "Wren", &[(1, "Wren")])],
            vec![],
        ),
    ];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    let flags: Vec<(i64, usize, bool)> = entities(&knowledge)[0]
        .ev
        .iter()
        .map(|item| (item.chapter, item.p, item.verified))
        .collect();
    assert_eq!(
        flags,
        vec![
            (1, 1, true),
            (1, 1, false),
            (1, 2, false),
            (1, 9, false),
            (2, 1, false),
        ]
    );
}

#[test]
fn stale_lists_changed_hash_and_missing_text_chapters_where_the_item_appears() {
    let fresh = chapter(
        1,
        Some(&["Wren."]),
        vec![entity("E1", "persona", "Wren", &[])],
        vec![],
    );
    let changed = with_hash(
        chapter(
            2,
            Some(&["Wren and Mara."]),
            vec![
                entity("E1", "persona", "Wren", &[]),
                entity("E2", "persona", "Mara", &[]),
            ],
            vec![],
        ),
        "old-hash",
    );
    let missing = chapter(
        3,
        None,
        vec![
            entity("E1", "persona", "Wren", &[]),
            entity("E3", "location", "Harbor", &[]),
        ],
        vec![fact("F1", "located_in", "E3", Some("E1"), &[])],
    );

    let knowledge = merge(KnowledgeLang::Src, &[fresh, changed, missing]);

    let by_name = |name: &str| {
        entities(&knowledge)
            .into_iter()
            .find(|entity| entity.name == name)
            .unwrap()
            .stale
            .clone()
    };
    assert_eq!(by_name("Wren"), vec![2, 3]);
    assert_eq!(by_name("Mara"), vec![2]);
    assert_eq!(by_name("Harbor"), vec![3]);
    assert_eq!(facts(&knowledge)[0].stale, vec![3]);
}

#[test]
fn an_up_to_date_chapter_is_not_stale() {
    let chapters = vec![chapter(
        1,
        Some(&["Wren."]),
        vec![entity("E1", "persona", "Wren", &[])],
        vec![],
    )];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    assert!(entities(&knowledge)[0].stale.is_empty());
    assert!(!knowledge.analyzed[&1].stale);
}

#[test]
fn ids_do_not_depend_on_local_ids_or_chapter_order() {
    let first = vec![
        sample(1, &["E1", "E2", "F1"]),
        sample(2, &["E3", "E4", "F2"]),
    ];
    let second = vec![
        sample(2, &["E9", "E8", "F7"]),
        sample(1, &["E5", "E6", "F3"]),
    ];

    let a = merge(KnowledgeLang::Vi, &first);
    let b = merge(KnowledgeLang::Vi, &second);

    assert_eq!(ids(&a), ids(&b));
    assert_eq!(ids(&a).len(), 3);
}

#[test]
fn items_list_entities_then_facts_in_first_appearance_order() {
    let chapters = vec![
        chapter(
            1,
            None,
            vec![
                entity("E1", "location", "Harbor", &[]),
                entity("E2", "persona", "Wren", &[]),
            ],
            vec![fact("F1", "resides_at", "E2", Some("E1"), &[])],
        ),
        chapter(
            2,
            None,
            vec![
                entity("E1", "persona", "Mara", &[]),
                entity("E2", "persona", "Wren", &[]),
            ],
            vec![
                fact("F1", "ally_of", "E2", Some("E1"), &[]),
                fact("F2", "resides_at", "E2", Some("E1"), &[]),
            ],
        ),
    ];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    let names: Vec<&str> = entities(&knowledge)
        .iter()
        .map(|entity| entity.name.as_str())
        .collect();
    assert_eq!(names, vec!["Harbor", "Wren", "Mara"]);
    let preds: Vec<&str> = facts(&knowledge)
        .iter()
        .map(|fact| fact.pred.as_str())
        .collect();
    assert_eq!(preds, vec!["resides_at", "ally_of", "resides_at"]);
    let kinds: Vec<bool> = knowledge
        .items
        .iter()
        .map(|item| matches!(item, KnowledgeItem::Entity(_)))
        .collect();
    assert_eq!(kinds, vec![true, true, true, false, false, false]);
}

#[test]
fn evidence_is_deduped_and_ordered_by_chapter_then_paragraph() {
    let chapters = vec![
        chapter(
            1,
            None,
            vec![entity(
                "E1",
                "persona",
                "Wren",
                &[(3, "late"), (1, "early"), (1, "EARLY"), (1, "early ")],
            )],
            vec![],
        ),
        chapter(
            2,
            None,
            vec![entity("E1", "persona", "Wren", &[(2, "mid"), (1, "first")])],
            vec![],
        ),
    ];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    let order: Vec<(i64, usize, &str)> = entities(&knowledge)[0]
        .ev
        .iter()
        .map(|item| (item.chapter, item.p, item.q.as_str()))
        .collect();
    assert_eq!(
        order,
        vec![
            (1, 1, "early"),
            (1, 3, "late"),
            (2, 1, "first"),
            (2, 2, "mid")
        ]
    );
}

#[test]
fn the_same_quote_in_two_chapters_is_kept_per_chapter() {
    let chapters = vec![
        chapter(
            1,
            None,
            vec![entity("E1", "persona", "Wren", &[(1, "Wren")])],
            vec![],
        ),
        chapter(
            2,
            None,
            vec![entity("E1", "persona", "Wren", &[(1, "Wren")])],
            vec![],
        ),
    ];

    let knowledge = merge(KnowledgeLang::Src, &chapters);

    assert_eq!(entities(&knowledge)[0].ev.len(), 2);
}

#[test]
fn analyzed_reports_every_chapter() {
    let fresh = sample(1, &["E1", "E2", "F1"]);
    let empty = with_hash(chapter(4, None, vec![], vec![]), "x");

    let knowledge = merge(KnowledgeLang::En, &[fresh, empty]);

    assert_eq!(knowledge.lang, "EN");
    assert_eq!(knowledge.analyzed.len(), 2);
    let one = &knowledge.analyzed[&1];
    assert_eq!(one.at, "2026-11-18T10:00:01Z");
    assert_eq!((one.entities, one.facts, one.stale), (2, 1, false));
    let four = &knowledge.analyzed[&4];
    assert_eq!((four.entities, four.facts, four.stale), (0, 0, true));
}

#[test]
fn no_chapters_merge_to_nothing() {
    let knowledge = merge(KnowledgeLang::Src, &[]);

    assert_eq!(knowledge.lang, "src");
    assert!(knowledge.items.is_empty());
    assert!(knowledge.analyzed.is_empty());
}
