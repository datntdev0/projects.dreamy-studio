use super::*;
use crate::features::knowledge::ontology::Ontology;
use crate::testing::assistant::project_summary;
use crate::testing::script::script;
use std::collections::BTreeMap;

fn entity(id: &str, entity_type: &str, name: &str) -> KnowledgeItem {
    KnowledgeItem::Entity(KnowledgeEntity {
        id: id.to_string(),
        entity_type: entity_type.to_string(),
        name: name.to_string(),
        titles: Vec::new(),
        aliases: Vec::new(),
        ev: Vec::new(),
        stale: Vec::new(),
    })
}

fn knowledge(items: Vec<KnowledgeItem>) -> WireKnowledge {
    WireKnowledge {
        lang: "src".to_string(),
        ontology: Ontology::get().view(),
        items,
        analyzed: BTreeMap::new(),
    }
}

fn ids(cast: &[CastMember]) -> Vec<&str> {
    cast.iter().map(|member| member.id.as_str()).collect()
}

fn film_script() -> Script {
    let mut film = script(Vec::new());
    film.cfg.preset = "film".to_string();
    film
}

#[test]
fn audiobook_cast_lists_narrator_then_characters_then_extra() {
    let snapshot = knowledge(vec![
        entity("e1", "character", "Lin Mo"),
        entity("e2", "character", "Su Wan"),
    ]);

    let cast = project_cast(&script(Vec::new()), Some(&snapshot));

    assert_eq!(ids(&cast), ["narr", "e1", "e2", "x1"]);
    assert_eq!(cast[0].kind, "narrator");
    assert_eq!(cast[0].name, "Narrator");
    assert_eq!(cast[0].c, -1);
    assert_eq!(cast[1].kind, "kb");
    assert_eq!(cast[1].c, 0);
    assert_eq!(cast[2].c, 1);
    assert_eq!(cast[3].kind, "extra");
}

#[test]
fn film_cast_has_no_narrator() {
    let snapshot = knowledge(vec![entity("e1", "character", "Lin Mo")]);

    let cast = project_cast(&film_script(), Some(&snapshot));

    assert_eq!(ids(&cast), ["e1", "x1"]);
}

#[test]
fn missing_knowledge_keeps_the_narrator_and_the_extra_cast() {
    assert_eq!(
        ids(&project_cast(&script(Vec::new()), None)),
        ["narr", "x1"]
    );
    assert_eq!(ids(&project_cast(&film_script(), None)), ["x1"]);
}

#[test]
fn only_character_entities_become_cast_members() {
    let snapshot = knowledge(vec![
        entity("p1", "location", "Black Gate"),
        entity("e1", "character", "Lin Mo"),
        entity("o1", "organization", "Sword Sect"),
    ]);

    let cast = project_cast(&film_script(), Some(&snapshot));

    assert_eq!(ids(&cast), ["e1", "x1"]);
}

#[test]
fn a_name_contained_in_a_longer_character_name_is_dropped() {
    let snapshot = knowledge(vec![
        entity("e1", "character", "Lin"),
        entity("e2", "character", "Su Wan"),
        entity("e3", "character", "Lin Mo"),
    ]);

    let cast = project_cast(&film_script(), Some(&snapshot));

    assert_eq!(ids(&cast), ["e2", "e3", "x1"]);
    assert_eq!(cast[0].c, 0);
    assert_eq!(cast[1].c, 1);
}

#[test]
fn equal_names_are_both_kept() {
    let snapshot = knowledge(vec![
        entity("e1", "character", "Lin Mo"),
        entity("e2", "character", "Lin Mo"),
    ]);

    let cast = project_cast(&film_script(), Some(&snapshot));

    assert_eq!(ids(&cast), ["e1", "e2", "x1"]);
}

#[test]
fn a_name_is_only_compared_with_other_characters() {
    let snapshot = knowledge(vec![
        entity("e1", "character", "Lin"),
        entity("p1", "location", "Lin Mo Valley"),
    ]);

    let cast = project_cast(&film_script(), Some(&snapshot));

    assert_eq!(ids(&cast), ["e1", "x1"]);
}

#[test]
fn original_text_projects_use_the_source_knowledge() {
    let project = project_summary(1, Some(2));

    assert_eq!(knowledge_lang(&project), "src");
}

#[test]
fn translation_projects_use_the_knowledge_of_their_language() {
    let mut project = project_summary(1, Some(2));
    project.src_kind = Some("translation".to_string());
    project.src_lang = Some("EN".to_string());
    assert_eq!(knowledge_lang(&project), "EN");

    project.src_lang = Some("VI".to_string());
    assert_eq!(knowledge_lang(&project), "VI");

    project.src_lang = None;
    assert_eq!(knowledge_lang(&project), "VI");
}

#[test]
fn radix_writes_base_36_digits() {
    assert_eq!(radix(0), "0");
    assert_eq!(radix(35), "z");
    assert_eq!(radix(36), "10");
    assert_eq!(radix(1_295), "zz");
}

#[test]
fn extra_members_get_unique_ids_and_the_given_color() {
    let mut taken = HashSet::from(["spk0".to_string()]);

    let first = extra_member("Old man", 3, &mut taken);
    let second = extra_member("Old woman", 4, &mut taken);

    assert_eq!(first.kind, "extra");
    assert_eq!(first.name, "Old man");
    assert_eq!(first.c, 3);
    assert!(first.id.starts_with("spk"));
    assert_ne!(first.id, second.id);
    assert_eq!(taken.len(), 3);
}
