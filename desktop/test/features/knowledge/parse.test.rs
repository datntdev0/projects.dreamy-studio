use super::*;
use serde_json::json;

fn paragraphs(lines: &[&str]) -> Vec<String> {
    lines.iter().map(|line| line.to_string()).collect()
}

fn chapters() -> Vec<Vec<String>> {
    vec![
        paragraphs(&["Wren lit the lamp.", "The Guild met at the Harbor."]),
        paragraphs(&["Aldous, also called the Keeper, slept."]),
    ]
}

fn candidates(value: Value) -> CandidateReading {
    parse_candidates(&value.to_string(), &chapters()).unwrap()
}

fn evidence(p: usize, q: &str) -> AnalysisEvidence {
    AnalysisEvidence {
        p,
        q: q.to_string(),
    }
}

fn names(entities: &[AnalysisEntity]) -> Vec<&str> {
    entities.iter().map(|entity| entity.name.as_str()).collect()
}

#[test]
fn candidates_go_to_the_chapters_that_mention_them_with_their_first_paragraph() {
    let reading = candidates(json!({"entities": [
        {"type": "persona", "name": "Wren", "titles": ["lamplighter"], "aliases": []},
        {"type": "organization", "name": "The Guild"},
        {"type": "location", "name": "Harbor"},
        {"type": "persona", "name": "Aldous", "aliases": ["the Keeper"]}
    ]}));

    assert!(reading.issues.is_empty());
    assert_eq!(
        names(&reading.chapters[0].entities),
        ["Wren", "The Guild", "Harbor"]
    );
    assert_eq!(names(&reading.chapters[1].entities), ["Aldous"]);
    let wren = &reading.chapters[0].entities[0];
    assert_eq!(wren.id, "E1");
    assert_eq!(wren.titles, ["lamplighter"]);
    assert_eq!(wren.ev, [evidence(1, "Wren")]);
    assert_eq!(reading.chapters[0].entities[1].id, "E2");
    assert_eq!(
        reading.chapters[0].entities[1].ev,
        [evidence(2, "The Guild")]
    );
    assert_eq!(reading.chapters[1].entities[0].id, "E1");
}

#[test]
fn an_alias_alone_places_the_entity_in_a_chapter() {
    let reading = candidates(json!({"entities": [
        {"type": "persona", "name": "Wren", "aliases": ["the Keeper"]}
    ]}));

    assert_eq!(names(&reading.chapters[0].entities), ["Wren"]);
    assert_eq!(names(&reading.chapters[1].entities), ["Wren"]);
    assert_eq!(reading.chapters[0].entities[0].ev, [evidence(1, "Wren")]);
    assert_eq!(
        reading.chapters[1].entities[0].ev,
        [evidence(1, "the Keeper")]
    );
}

#[test]
fn candidates_match_names_ignoring_case_spacing_and_composition() {
    let reading = candidates(json!({"entities": [
        {"type": "location", "name": "  the   HARBOR "}
    ]}));

    assert_eq!(names(&reading.chapters[0].entities), ["the   HARBOR"]);
    assert!(reading.issues.is_empty());
}

#[test]
fn reports_entities_with_an_unknown_type_or_no_name() {
    let reading = candidates(json!({"entities": [
        {"type": "planet", "name": "Mars"},
        {"type": "location", "name": "   "},
        {"name": "Harbor"},
        {"type": "location", "name": "Harbor"}
    ]}));

    assert_eq!(names(&reading.chapters[0].entities), ["Harbor"]);
    assert_eq!(reading.issues.len(), 3);
    assert!(reading.issues[0].starts_with(
        "entity \"Mars\": type \"planet\" is not in the ontology; use one of: persona,"
    ));
    assert_eq!(
        reading.issues[1],
        "an entity without a name: the name is missing"
    );
    assert!(
        reading.issues[2].starts_with("entity \"Harbor\": type is missing; use one of: persona,")
    );
}

#[test]
fn reports_an_entity_that_appears_in_no_chapter() {
    let reading = candidates(json!({"entities": [
        {"type": "persona", "name": "Ghost", "aliases": ["Spirit"]},
        {"type": "persona", "name": "Wren"}
    ]}));

    assert_eq!(names(&reading.chapters[0].entities), ["Wren"]);
    assert_eq!(
        reading.issues,
        ["entity \"Ghost\" (persona): neither the name nor the aliases appear in the chapter text"]
    );
}

#[test]
fn keeps_titles_and_aliases_only_on_personas() {
    let reading = candidates(json!({"entities": [
        {"type": "persona", "name": "Wren", "titles": [" Lamp ", "lamp", "", "Keeper"], "aliases": ["W.", "w.", "wren"]},
        {"type": "location", "name": "Harbor", "titles": ["Port"], "aliases": ["Dock"]}
    ]}));

    let wren = &reading.chapters[0].entities[0];
    assert_eq!(wren.titles, ["Lamp", "Keeper"]);
    assert_eq!(wren.aliases, ["W."]);
    let harbor = &reading.chapters[0].entities[1];
    assert!(harbor.titles.is_empty());
    assert!(harbor.aliases.is_empty());
}

#[test]
fn folds_candidates_with_the_same_type_and_name() {
    let reading = candidates(json!({"entities": [
        {"type": "persona", "name": "Wren", "titles": ["A"]},
        {"type": "location", "name": "Wren"},
        {"type": "persona", "name": "  WREN ", "titles": ["a", "B"], "aliases": ["Wr"]}
    ]}));

    assert_eq!(reading.chapters[0].entities.len(), 2);
    let wren = &reading.chapters[0].entities[0];
    assert_eq!(wren.name, "Wren");
    assert_eq!(wren.titles, ["A", "B"]);
    assert_eq!(wren.aliases, ["Wr"]);
}

#[test]
fn reads_candidates_wrapped_in_prose_and_code_fences() {
    let text = format!(
        "Here you go:\n```json\n{}\n```\nDone.",
        json!({"entities": [{"type": "persona", "name": "Wren"}]})
    );

    let reading = parse_candidates(&text, &chapters()).unwrap();

    assert_eq!(names(&reading.chapters[0].entities), ["Wren"]);
}

#[test]
fn rejects_candidate_replies_that_are_not_usable() {
    assert_eq!(
        parse_candidates("Sorry, I cannot do that.", &chapters()).unwrap_err(),
        "The model did not return a JSON result."
    );
    assert!(parse_candidates("} backwards {", &chapters()).is_err());
    assert!(
        parse_candidates("{ not json }", &chapters())
            .unwrap_err()
            .starts_with("The model returned an unreadable result")
    );
    assert!(parse_candidates("{\"entities\": \"none\"}", &chapters()).is_err());
    assert_eq!(
        parse_candidates("{}", &chapters()).unwrap_err(),
        "The model returned no entities."
    );
}

#[test]
fn accepts_an_empty_candidate_list() {
    let reading = candidates(json!({"entities": []}));

    assert!(reading.issues.is_empty());
    assert!(
        reading
            .chapters
            .iter()
            .all(|draft| draft.entities.is_empty() && draft.facts.is_empty())
    );
}

fn entity(id: &str, kind: &str, name: &str) -> AnalysisEntity {
    AnalysisEntity {
        id: id.to_string(),
        kind: kind.to_string(),
        name: name.to_string(),
        titles: Vec::new(),
        aliases: Vec::new(),
        ev: Vec::new(),
    }
}

fn cast() -> Vec<AnalysisEntity> {
    vec![
        entity("E1", "persona", "Wren"),
        entity("E2", "location", "Harbor"),
        entity("E3", "organization", "The Guild"),
        entity("E4", "character", "Aldous"),
        entity("E5", "persona", "Mara"),
    ]
}

fn text() -> Vec<String> {
    paragraphs(&[
        "Wren lit the lamp.",
        "The Guild met at the Harbor.",
        "Mara is the captain.",
    ])
}

fn facts(value: Value) -> FactReading {
    parse_facts(&value.to_string(), &cast(), &text()).unwrap()
}

#[test]
fn reads_valid_facts_and_numbers_them() {
    let reading = facts(json!({"facts": [
        {"id": "x", "pred": "resides_at", "subject": "E1", "object": "E2", "ev": [{"p": 2, "q": "Harbor"}]},
        {"pred": "occupation", "subject": "E1", "ev": [{"p": 1, "q": "lit the lamp"}]},
        {"pred": "member_of", "subject": "E1", "object": "E3", "ev": [{"p": 2, "q": "The Guild met"}]}
    ]}));

    assert!(reading.issues.is_empty());
    assert_eq!(reading.facts.len(), 3);
    assert_eq!(reading.facts[0].id, "F1");
    assert_eq!(reading.facts[0].object.as_deref(), Some("E2"));
    assert_eq!(reading.facts[1].id, "F2");
    assert_eq!(reading.facts[1].object, None);
    assert_eq!(reading.facts[1].ev, [evidence(1, "lit the lamp")]);
    assert_eq!(reading.facts[2].subject, "E1");
}

#[test]
fn reports_an_unknown_or_missing_predicate() {
    let reading = facts(json!({"facts": [
        {"id": "F1", "pred": "loves", "subject": "E1"},
        {"id": "F2", "subject": "E1"}
    ]}));

    assert!(reading.facts.is_empty());
    assert!(
        reading.issues[0].starts_with(
            "fact F1: predicate \"loves\" is not in the ontology; use one of: gender,"
        )
    );
    assert!(reading.issues[1].starts_with("fact F2: predicate is missing; use one of:"));
}

#[test]
fn reports_references_that_are_not_in_the_entity_list() {
    let reading = facts(json!({"facts": [
        {"id": "F1", "pred": "resides_at", "subject": "E9", "object": "E2"},
        {"id": "F2", "pred": "resides_at", "subject": "E1", "object": "E9"},
        {"id": "F3", "pred": "occupation", "subject": "E9"},
        {"id": "F4", "pred": "occupation"},
        {"id": "F5", "pred": "resides_at", "subject": "E1", "object": "E2", "ev": [{"p": 2, "q": "Harbor"}]}
    ]}));

    assert_eq!(reading.facts.len(), 1);
    assert_eq!(reading.facts[0].pred, "resides_at");
    assert_eq!(
        reading.issues,
        [
            "fact F1: the subject \"E9\" is not in the entity list",
            "fact F2: the object \"E9\" is not in the entity list",
            "fact F3: the subject \"E9\" is not in the entity list",
            "fact F4: the subject is missing"
        ]
    );
}

#[test]
fn reports_the_shape_of_scalar_and_relationship_facts() {
    let reading = facts(json!({"facts": [
        {"id": "F1", "pred": "occupation", "subject": "E1", "object": "E2"},
        {"id": "F2", "pred": "age", "subject": "E1", "object": null},
        {"id": "F3", "pred": "ally_of", "subject": "E1"},
        {"id": "F4", "pred": "ally_of", "subject": "E1", "object": ""},
        {"id": "F5", "pred": "ally_of", "subject": "E1", "object": "E1"},
        {"id": "F6", "pred": "ally_of", "subject": "E1", "object": "E5"}
    ]}));

    let preds: Vec<&str> = reading
        .facts
        .iter()
        .map(|fact| fact.pred.as_str())
        .collect();
    assert_eq!(preds, ["age", "ally_of"]);
    assert_eq!(
        reading.issues,
        [
            "fact F1: occupation is a scalar predicate and must not have an object; put the quote in ev",
            "fact F3: ally_of needs an object",
            "fact F4: ally_of needs an object",
            "fact F5: the subject and the object are the same entity"
        ]
    );
}

#[test]
fn reports_facts_that_break_the_domain_or_the_range() {
    let reading = facts(json!({"facts": [
        {"id": "F1", "pred": "member_of", "subject": "E2", "object": "E3"},
        {"id": "F2", "pred": "member_of", "subject": "E1", "object": "E2"},
        {"id": "F3", "pred": "occupation", "subject": "E2"},
        {"id": "F4", "pred": "member_of", "subject": "E1", "object": "E3"}
    ]}));

    assert_eq!(reading.facts.len(), 1);
    assert_eq!(
        reading.issues,
        [
            "fact F1: member_of needs a subject of type persona, but Harbor is a location",
            "fact F2: member_of needs an object of type organization, but Harbor is a location",
            "fact F3: occupation needs a subject of type persona, but Harbor is a location"
        ]
    );
}

#[test]
fn tells_the_model_that_a_character_takes_no_facts() {
    let reading = facts(json!({"facts": [
        {"id": "F1", "pred": "resides_at", "subject": "E4", "object": "E2"}
    ]}));

    assert_eq!(
        reading.issues[0],
        "fact F1: resides_at cannot be attached to the character Aldous; a character only takes persona_of, so attach the fact to a persona"
    );
}

#[test]
fn persona_of_comes_from_the_character_property_and_is_not_a_listed_fact() {
    let reading = facts(json!({"facts": [
        {"id": "F1", "pred": "persona_of", "subject": "E1", "object": "E4", "ev": [{"p": 1, "q": "Wren"}]}
    ]}));

    assert!(reading.facts.is_empty());
    assert_eq!(
        reading.issues,
        ["fact F1: persona_of is not listed in facts; it comes from the character of the persona"]
    );
}

#[test]
fn a_persona_with_a_character_gets_the_character_entity_and_a_persona_of_fact() {
    let reading = candidates(json!({"entities": [
        {"type": "persona", "name": "Wren", "character": " Aldous "},
        {"type": "persona", "name": "Aldous", "aliases": ["the Keeper"], "character": "aldous"},
        {"type": "location", "name": "Harbor"}
    ]}));

    assert!(reading.issues.is_empty());
    let first = &reading.chapters[0];
    assert_eq!(names(&first.entities), ["Wren", "Harbor", "Aldous"]);
    assert_eq!(first.entities[2].kind, "character");
    assert_eq!(first.entities[2].ev, [evidence(1, "Wren")]);
    assert_eq!(first.facts.len(), 1);
    assert_eq!(first.facts[0].id, "F1");
    assert_eq!(first.facts[0].pred, "persona_of");
    assert_eq!(first.facts[0].subject, "E1");
    assert_eq!(first.facts[0].object.as_deref(), Some("E3"));
    assert_eq!(first.facts[0].ev, [evidence(1, "Wren")]);
    let second = &reading.chapters[1];
    assert_eq!(names(&second.entities), ["Aldous", "Aldous"]);
    assert_eq!(second.entities[0].kind, "persona");
    assert_eq!(second.entities[1].kind, "character");
    assert_eq!(second.entities[1].name, "Aldous");
    assert_eq!(second.facts[0].object.as_deref(), Some("E2"));
}

#[test]
fn personas_of_one_character_share_its_entity_within_a_chapter() {
    let reading = candidates(json!({"entities": [
        {"type": "persona", "name": "Wren", "character": "Mara Voss"},
        {"type": "persona", "name": "Aldous", "aliases": ["the Keeper"], "character": "mara voss"}
    ]}));

    let first = &reading.chapters[0];
    assert_eq!(names(&first.entities), ["Wren", "Mara Voss"]);
    assert_eq!(first.facts.len(), 1);
    let second = &reading.chapters[1];
    assert_eq!(names(&second.entities), ["Aldous", "Mara Voss"]);
    assert_eq!(second.facts[0].subject, "E1");
    assert_eq!(second.facts[0].object.as_deref(), Some("E2"));
}

#[test]
fn a_character_is_never_listed_as_an_entity_and_only_a_persona_has_one() {
    let reading = candidates(json!({"entities": [
        {"type": "character", "name": "Aldous"},
        {"type": "location", "name": "Harbor", "character": "Aldous"},
        {"type": "persona", "name": "Wren", "character": "  "}
    ]}));

    assert_eq!(
        reading.issues,
        [
            "entity \"Aldous\": a character is not listed as an entity; set the character property of the persona instead"
        ]
    );
    assert_eq!(names(&reading.chapters[0].entities), ["Harbor", "Wren"]);
    assert!(reading.chapters[0].facts.is_empty());
}

#[test]
fn merges_duplicate_facts_and_their_evidence() {
    let reading = facts(json!({"facts": [
        {"id": "F1", "pred": "occupation", "subject": "E5", "ev": [{"p": 3, "q": "is the captain"}]},
        {"id": "F2", "pred": "occupation", "subject": "E5", "ev": [{"p": 3, "q": "IS THE CAPTAIN"}, {"p": 3, "q": "Mara"}]},
        {"id": "F3", "pred": "resides_at", "subject": "E5", "object": "E2", "ev": [{"p": 2, "q": "Harbor"}]},
        {"id": "F4", "pred": "resides_at", "subject": "E5", "object": "E2", "ev": [{"p": 2, "q": "The Guild"}]}
    ]}));

    assert!(reading.issues.is_empty());
    assert_eq!(reading.facts.len(), 2);
    assert_eq!(
        reading.facts[0].ev,
        [evidence(3, "is the captain"), evidence(3, "Mara")]
    );
    assert_eq!(
        reading.facts[1].ev,
        [evidence(2, "Harbor"), evidence(2, "The Guild")]
    );
}

#[test]
fn corrects_the_paragraph_of_a_quote_found_elsewhere() {
    let reading = facts(json!({"facts": [
        {"pred": "occupation", "subject": "E5", "ev": [
            {"p": 1, "q": "is the captain"},
            {"p": 99, "q": "Mara"},
            {"q": "Mara is the captain."}
        ]}
    ]}));

    assert!(reading.issues.is_empty());
    assert_eq!(
        reading.facts[0].ev,
        [
            evidence(3, "is the captain"),
            evidence(3, "Mara"),
            evidence(3, "Mara is the captain.")
        ]
    );
}

#[test]
fn reports_quotes_that_are_not_in_the_chapter() {
    let reading = facts(json!({"facts": [
        {"id": "F1", "pred": "occupation", "subject": "E1", "ev": [
            {"p": 1, "q": "nobody said this"},
            {"p": 1, "q": "   "},
            {"p": 1},
            {"q": 7}
        ]}
    ]}));

    assert_eq!(reading.facts.len(), 1);
    assert!(reading.facts[0].ev.is_empty());
    assert_eq!(
        reading.issues,
        [
            "fact F1: evidence item 1: the quote is not in the chapter text; copy it verbatim",
            "fact F1: evidence item 2: the quote is empty",
            "fact F1: evidence item 3: must look like {\"p\": paragraph number, \"q\": quote}",
            "fact F1: evidence item 4: must look like {\"p\": paragraph number, \"q\": quote}"
        ]
    );
}

#[test]
fn rejects_fact_replies_that_are_not_usable() {
    let parse = |text: &str| parse_facts(text, &cast(), &text_lines());

    assert_eq!(
        parse("no json").unwrap_err(),
        "The model did not return a JSON result."
    );
    assert!(parse("{ not json }").is_err());
    assert_eq!(
        parse("{\"entities\": []}").unwrap_err(),
        "The model returned no facts."
    );
    assert!(parse("{\"facts\": []}").unwrap().facts.is_empty());
}

fn text_lines() -> Vec<String> {
    text()
}
