use super::*;
use serde_json::json;

fn parse(value: Value, count: usize) -> ChapterAnalysis {
    parse_reply(&value.to_string(), count).unwrap()
}

fn evidence(p: usize, q: &str) -> AnalysisEvidence {
    AnalysisEvidence {
        p,
        q: q.to_string(),
    }
}

fn valid() -> Value {
    json!({
        "entities": [
            {"id": "E1", "type": "persona", "name": "Wren", "titles": ["lamplighter"], "aliases": ["Wren Aldous"], "ev": [{"p": 1, "q": "Wren lit the lamp."}]},
            {"id": "E2", "type": "character", "name": "Wren Aldous", "ev": [{"p": 1, "q": "Wren lit the lamp."}]},
            {"id": "E3", "type": "organization", "name": "The Guild", "ev": [{"p": 2, "q": "The Guild met."}]}
        ],
        "facts": [
            {"id": "F1", "pred": "persona_of", "subject": "E1", "object": "E2", "ev": [{"p": 1, "q": "Wren lit the lamp."}]},
            {"id": "F2", "pred": "occupation", "subject": "E1", "ev": [{"p": 1, "q": "the lamplighter"}]},
            {"id": "F3", "pred": "member_of", "subject": "E1", "object": "E3", "ev": [{"p": 2, "q": "The Guild met."}]}
        ]
    })
}

fn entity_names(analysis: &ChapterAnalysis) -> Vec<&str> {
    analysis
        .entities
        .iter()
        .map(|entity| entity.name.as_str())
        .collect()
}

#[test]
fn reads_a_valid_reply() {
    let analysis = parse(valid(), 2);

    assert_eq!(analysis.ontology, Ontology::get().version);
    assert_eq!(analysis.source_hash, "");
    assert_eq!(analysis.analyzed_at, "");
    assert_eq!(
        entity_names(&analysis),
        ["Wren", "Wren Aldous", "The Guild"]
    );
    let wren = &analysis.entities[0];
    assert_eq!(wren.id, "E1");
    assert_eq!(wren.titles, ["lamplighter"]);
    assert_eq!(wren.aliases, ["Wren Aldous"]);
    assert_eq!(wren.ev, [evidence(1, "Wren lit the lamp.")]);
    assert_eq!(analysis.facts.len(), 3);
    assert_eq!(analysis.facts[0].object.as_deref(), Some("E2"));
    assert_eq!(analysis.facts[1].object, None);
    assert_eq!(analysis.facts[1].ev, [evidence(1, "the lamplighter")]);
}

#[test]
fn reads_a_reply_wrapped_in_prose_and_code_fences() {
    let text = format!(
        "Here is the analysis:\n```json\n{}\n```\nHope it helps.",
        valid()
    );

    let analysis = parse_reply(&text, 2).unwrap();

    assert_eq!(analysis.entities.len(), 3);
    assert_eq!(analysis.facts.len(), 3);
}

#[test]
fn ignores_unknown_fields() {
    let value = json!({
        "note": "x",
        "entities": [{"id": "E1", "type": "location", "name": "Harbor", "color": "red", "ev": []}],
        "facts": []
    });

    let analysis = parse(value, 1);

    assert_eq!(entity_names(&analysis), ["Harbor"]);
}

#[test]
fn reads_a_reply_with_only_entities() {
    let value = json!({"entities": [{"id": "E1", "type": "location", "name": "Harbor"}]});

    let analysis = parse(value, 1);

    assert_eq!(analysis.entities.len(), 1);
    assert!(analysis.facts.is_empty());
    assert!(analysis.entities[0].ev.is_empty());
}

#[test]
fn drops_entities_with_an_unknown_type_or_an_empty_name() {
    let value = json!({
        "entities": [
            {"id": "E1", "type": "planet", "name": "Mars"},
            {"id": "E2", "type": "location", "name": "   "},
            {"id": "E3", "type": "location"},
            {"id": "E4", "name": "No type"},
            {"id": "E5", "type": "location", "name": " Harbor "}
        ],
        "facts": []
    });

    let analysis = parse(value, 1);

    assert_eq!(entity_names(&analysis), ["Harbor"]);
    assert_eq!(analysis.entities[0].id, "E1");
}

#[test]
fn keeps_titles_and_aliases_only_on_personas() {
    let value = json!({
        "entities": [
            {"id": "E1", "type": "persona", "name": "Wren", "titles": [" Lamp ", "lamp", "", "Keeper"], "aliases": ["W.", "w."]},
            {"id": "E2", "type": "location", "name": "Harbor", "titles": ["Port"], "aliases": ["Dock"]}
        ]
    });

    let analysis = parse(value, 1);

    assert_eq!(analysis.entities[0].titles, ["Lamp", "Keeper"]);
    assert_eq!(analysis.entities[0].aliases, ["W."]);
    assert!(analysis.entities[1].titles.is_empty());
    assert!(analysis.entities[1].aliases.is_empty());
}

#[test]
fn folds_entities_with_the_same_type_and_name() {
    let value = json!({
        "entities": [
            {"id": "E1", "type": "persona", "name": "Wren", "titles": ["A"], "ev": [{"p": 1, "q": "one"}]},
            {"id": "E2", "type": "location", "name": "Wren"},
            {"id": "E3", "type": "persona", "name": "  WREN ", "titles": ["a", "B"], "aliases": ["Wr"], "ev": [{"p": 1, "q": "ONE"}, {"p": 2, "q": "two"}]}
        ],
        "facts": [
            {"id": "F1", "pred": "ally_of", "subject": "E3", "object": "E1"},
            {"id": "F2", "pred": "resides_at", "subject": "E3", "object": "E2", "ev": [{"p": 2, "q": "home"}]}
        ]
    });

    let analysis = parse(value, 2);

    assert_eq!(analysis.entities.len(), 2);
    let wren = &analysis.entities[0];
    assert_eq!(wren.name, "Wren");
    assert_eq!(wren.titles, ["A", "B"]);
    assert_eq!(wren.aliases, ["Wr"]);
    assert_eq!(wren.ev, [evidence(1, "one"), evidence(2, "two")]);
    assert_eq!(analysis.facts.len(), 1);
    assert_eq!(analysis.facts[0].pred, "resides_at");
    assert_eq!(analysis.facts[0].subject, "E1");
    assert_eq!(analysis.facts[0].object.as_deref(), Some("E2"));
}

#[test]
fn drops_an_entity_that_reuses_a_local_id() {
    let value = json!({
        "entities": [
            {"id": "E1", "type": "location", "name": "Harbor"},
            {"id": "E1", "type": "location", "name": "Castle"}
        ],
        "facts": [
            {"id": "F1", "pred": "located_in", "subject": "E1", "object": "E1"}
        ]
    });

    let analysis = parse(value, 1);

    assert_eq!(entity_names(&analysis), ["Harbor"]);
}

#[test]
fn drops_facts_with_an_unknown_predicate() {
    let value = json!({
        "entities": [{"id": "E1", "type": "persona", "name": "Wren"}],
        "facts": [{"id": "F1", "pred": "loves", "subject": "E1"}]
    });

    assert!(parse(value, 1).facts.is_empty());
}

#[test]
fn drops_facts_with_a_dangling_subject_or_object() {
    let value = json!({
        "entities": [
            {"id": "E1", "type": "persona", "name": "Wren"},
            {"id": "E2", "type": "location", "name": "Harbor"}
        ],
        "facts": [
            {"id": "F1", "pred": "resides_at", "subject": "E9", "object": "E2"},
            {"id": "F2", "pred": "resides_at", "subject": "E1", "object": "E9"},
            {"id": "F3", "pred": "occupation", "subject": "E9"},
            {"id": "F4", "pred": "occupation"},
            {"id": "F5", "pred": "resides_at", "subject": "E1", "object": "E2"}
        ]
    });

    let analysis = parse(value, 1);

    assert_eq!(analysis.facts.len(), 1);
    assert_eq!(analysis.facts[0].pred, "resides_at");
}

#[test]
fn drops_a_scalar_fact_with_an_object() {
    let value = json!({
        "entities": [
            {"id": "E1", "type": "persona", "name": "Wren"},
            {"id": "E2", "type": "location", "name": "Harbor"}
        ],
        "facts": [
            {"id": "F1", "pred": "occupation", "subject": "E1", "object": "E2"},
            {"id": "F2", "pred": "age", "subject": "E1", "object": null},
            {"id": "F3", "pred": "gender", "subject": "E1", "object": ""}
        ]
    });

    let analysis = parse(value, 1);

    let preds: Vec<&str> = analysis
        .facts
        .iter()
        .map(|fact| fact.pred.as_str())
        .collect();
    assert_eq!(preds, ["age", "gender"]);
}

#[test]
fn drops_a_relationship_without_an_object_or_to_itself() {
    let value = json!({
        "entities": [
            {"id": "E1", "type": "persona", "name": "Wren"},
            {"id": "E2", "type": "persona", "name": "Wren Two"}
        ],
        "facts": [
            {"id": "F1", "pred": "ally_of", "subject": "E1"},
            {"id": "F2", "pred": "ally_of", "subject": "E1", "object": ""},
            {"id": "F3", "pred": "ally_of", "subject": "E1", "object": "E1"},
            {"id": "F4", "pred": "ally_of", "subject": "E1", "object": "E2"}
        ]
    });

    let analysis = parse(value, 1);

    assert_eq!(analysis.facts.len(), 1);
    assert_eq!(analysis.facts[0].object.as_deref(), Some("E2"));
}

#[test]
fn keeps_domain_and_range_mismatches() {
    let value = json!({
        "entities": [
            {"id": "E1", "type": "location", "name": "Harbor"},
            {"id": "E2", "type": "persona", "name": "Wren"}
        ],
        "facts": [
            {"id": "F1", "pred": "member_of", "subject": "E1", "object": "E2"},
            {"id": "F2", "pred": "occupation", "subject": "E1"}
        ]
    });

    assert_eq!(parse(value, 1).facts.len(), 2);
}

#[test]
fn merges_duplicate_facts_and_their_evidence() {
    let value = json!({
        "entities": [
            {"id": "E1", "type": "persona", "name": "Wren"},
            {"id": "E2", "type": "location", "name": "Harbor"}
        ],
        "facts": [
            {"id": "F1", "pred": "occupation", "subject": "E1", "ev": [{"p": 1, "q": "a"}]},
            {"id": "F2", "pred": "occupation", "subject": "E1", "ev": [{"p": 1, "q": "A"}, {"p": 2, "q": "b"}]},
            {"id": "F3", "pred": "resides_at", "subject": "E1", "object": "E2", "ev": [{"p": 1, "q": "c"}]},
            {"id": "F4", "pred": "resides_at", "subject": "E1", "object": "E2", "ev": [{"p": 2, "q": "d"}]}
        ]
    });

    let analysis = parse(value, 2);

    assert_eq!(analysis.facts.len(), 2);
    assert_eq!(analysis.facts[0].ev, [evidence(1, "a"), evidence(2, "b")]);
    assert_eq!(analysis.facts[1].ev, [evidence(1, "c"), evidence(2, "d")]);
}

#[test]
fn drops_evidence_outside_the_paragraph_range_or_without_a_quote() {
    let value = json!({
        "entities": [
            {"id": "E1", "type": "persona", "name": "Wren", "ev": [
                {"p": 0, "q": "zero"},
                {"p": 1, "q": " first "},
                {"p": 3, "q": "third"},
                {"p": 2, "q": "   "},
                {"p": -1, "q": "negative"},
                {"p": 2},
                {"q": "no paragraph"},
                {"p": 1, "q": "first"}
            ]}
        ]
    });

    let analysis = parse(value, 2);

    assert_eq!(analysis.entities[0].ev, [evidence(1, "first")]);
}

#[test]
fn renumbers_ids_in_order_and_remaps_references() {
    let value = json!({
        "entities": [
            {"id": "a", "type": "persona", "name": "Wren"},
            {"id": "b", "type": "planet", "name": "Mars"},
            {"id": "c", "type": "location", "name": "Harbor"}
        ],
        "facts": [
            {"id": "x", "pred": "loves", "subject": "a"},
            {"id": "y", "pred": "resides_at", "subject": "a", "object": "c"},
            {"id": "z", "pred": "occupation", "subject": "a"}
        ]
    });

    let analysis = parse(value, 1);

    let ids: Vec<&str> = analysis
        .entities
        .iter()
        .map(|entity| entity.id.as_str())
        .collect();
    assert_eq!(ids, ["E1", "E2"]);
    assert_eq!(analysis.facts[0].id, "F1");
    assert_eq!(analysis.facts[0].subject, "E1");
    assert_eq!(analysis.facts[0].object.as_deref(), Some("E2"));
    assert_eq!(analysis.facts[1].id, "F2");
}

#[test]
fn keeps_entities_without_a_local_id_but_cannot_link_them() {
    let value = json!({
        "entities": [
            {"type": "location", "name": "Harbor"},
            {"type": "location", "name": "Castle"}
        ]
    });

    let analysis = parse(value, 1);

    assert_eq!(entity_names(&analysis), ["Harbor", "Castle"]);
}

#[test]
fn rejects_a_reply_without_json() {
    let error = parse_reply("Sorry, I cannot do that.", 1).unwrap_err();

    assert_eq!(error, "The model did not return a JSON result.");
    assert!(parse_reply("} backwards {", 1).is_err());
}

#[test]
fn rejects_unreadable_json() {
    let error = parse_reply("{ not json }", 1).unwrap_err();

    assert!(error.starts_with("The model returned an unreadable result"));
    assert!(parse_reply("{\"entities\": \"none\"}", 1).is_err());
}

#[test]
fn rejects_an_object_without_entities_and_facts() {
    assert!(parse_reply("{}", 1).is_err());
    assert!(parse_reply("{\"note\": \"nothing\"}", 1).is_err());
}

#[test]
fn accepts_empty_entities_and_facts_arrays() {
    let analysis = parse(json!({"entities": [], "facts": []}), 1);

    assert!(analysis.entities.is_empty());
    assert!(analysis.facts.is_empty());
}
