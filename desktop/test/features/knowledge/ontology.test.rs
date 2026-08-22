use super::*;

fn type_keys() -> Vec<&'static str> {
    Ontology::get()
        .types
        .iter()
        .map(|item| item.key.as_str())
        .collect()
}

#[test]
fn parses_all_sections() {
    let ontology = Ontology::get();
    assert_eq!(ontology.types.len(), 8);
    assert!(
        ontology
            .predicates
            .iter()
            .any(|item| item.kind == PredicateKind::Scalar)
    );
    assert!(
        ontology
            .predicates
            .iter()
            .any(|item| item.kind == PredicateKind::Relationship)
    );
    assert_eq!(ontology.rules.len(), 8);
    assert!(!ontology.view().yaml.is_empty());
}

#[test]
fn version_is_one() {
    assert_eq!(Ontology::get().version, 1);
}

#[test]
fn character_is_abstract() {
    let ontology = Ontology::get();
    let character = ontology
        .types
        .iter()
        .find(|item| item.key == "character")
        .unwrap();
    assert!(character.abstract_);
    let others = ontology
        .types
        .iter()
        .filter(|item| item.key != "character" && item.abstract_)
        .count();
    assert_eq!(others, 0);
}

#[test]
fn persona_of_is_the_only_predicate_reaching_character() {
    let ontology = Ontology::get();
    let reaching: Vec<&str> = ontology
        .predicates
        .iter()
        .filter(|item| item.range.iter().any(|entry| entry == "character"))
        .map(|item| item.key.as_str())
        .collect();
    assert_eq!(reaching, vec!["persona_of"]);
    let from_character = ontology
        .predicates
        .iter()
        .filter(|item| item.domain.iter().any(|entry| entry == "character"))
        .count();
    assert_eq!(from_character, 0);
}

#[test]
fn domain_and_range_use_declared_types() {
    let keys = type_keys();
    for predicate in &Ontology::get().predicates {
        for entry in predicate.domain.iter().chain(predicate.range.iter()) {
            assert!(
                keys.contains(&entry.as_str()),
                "{} uses unknown type {entry}",
                predicate.key
            );
        }
    }
}

#[test]
fn scalars_have_an_empty_range_and_relationships_have_one() {
    for predicate in &Ontology::get().predicates {
        match predicate.kind {
            PredicateKind::Scalar => {
                assert!(predicate.range.is_empty(), "{}", predicate.key);
                assert!(!predicate.unique_range, "{}", predicate.key);
            }
            PredicateKind::Relationship => {
                assert!(!predicate.range.is_empty(), "{}", predicate.key);
                assert!(!predicate.single, "{}", predicate.key);
            }
        }
    }
}

#[test]
fn persona_is_the_only_type_with_properties() {
    for item in &Ontology::get().types {
        if item.key == "persona" {
            assert_eq!(item.properties, vec!["titles", "aliases"]);
        } else {
            assert!(item.properties.is_empty(), "{}", item.key);
        }
    }
}

#[test]
fn every_type_and_predicate_has_a_hint() {
    let ontology = Ontology::get();
    assert!(
        ontology
            .types
            .iter()
            .all(|item| !item.hint.trim().is_empty())
    );
    assert!(
        ontology
            .predicates
            .iter()
            .all(|item| !item.hint.trim().is_empty())
    );
}

#[test]
fn predicate_keys_are_unique_and_alias_is_gone() {
    let ontology = Ontology::get();
    let mut keys: Vec<&str> = ontology
        .predicates
        .iter()
        .map(|item| item.key.as_str())
        .collect();
    keys.sort_unstable();
    let total = keys.len();
    keys.dedup();
    assert_eq!(keys.len(), total);
    assert!(!keys.contains(&"alias"));
}

#[test]
fn rules_match_the_checker() {
    let rules: Vec<(&str, Severity)> = Ontology::get()
        .rules
        .iter()
        .map(|item| (item.key.as_str(), item.severity))
        .collect();
    assert_eq!(
        rules,
        vec![
            ("character_predicate", Severity::Error),
            ("persona_link", Severity::Error),
            ("relation_signature", Severity::Error),
            ("dangling_ref", Severity::Error),
            ("relation_unique", Severity::Warning),
            ("entity_duplicate", Severity::Warning),
            ("evidence", Severity::Warning),
            ("source_stale", Severity::Warning),
        ]
    );
}

#[test]
fn invalid_text_is_an_error() {
    assert!(Ontology::parse("version: 1").is_err());
}

#[test]
fn view_lists_every_definition_for_the_frontend() {
    let ontology = Ontology::get();
    let view = ontology.view();
    assert_eq!(view.version, ontology.version);
    assert_eq!(view.types.len(), ontology.types.len());
    assert_eq!(view.predicates.len(), ontology.predicates.len());
    assert_eq!(view.rules.len(), ontology.rules.len());
    assert!(view.yaml.starts_with("version: 1"));
    assert!(!view.yaml.contains('\r'));
}

#[test]
fn view_marks_the_single_and_unique_limits() {
    let view = Ontology::get().view();
    let limit = |key: &str| {
        view.predicates
            .iter()
            .find(|item| item.key == key)
            .map(|item| item.limit)
    };
    assert_eq!(limit("gender"), Some(true));
    assert_eq!(limit("appearance"), Some(false));
    assert_eq!(limit("leader_of"), Some(true));
    assert_eq!(limit("kin_of"), Some(false));
}

#[test]
fn view_encodes_in_camel_case_with_lowercase_enums() {
    let value = serde_json::to_value(Ontology::get().view()).expect("view encodes");
    let persona = value["types"]
        .as_array()
        .and_then(|items| items.iter().find(|item| item["key"] == "persona"))
        .expect("persona type");
    assert_eq!(persona["abstract"], false);
    assert_eq!(persona["properties"][0], "titles");
    let owns = value["predicates"]
        .as_array()
        .and_then(|items| items.iter().find(|item| item["key"] == "owns"))
        .expect("owns predicate");
    assert_eq!(owns["kind"], "relationship");
    assert_eq!(value["rules"][0]["severity"], "error");
}
