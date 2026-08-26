use super::*;
use crate::features::knowledge::models::KnowledgeEvidence;
use crate::features::knowledge::ontology::RuleDef;

fn verified() -> KnowledgeEvidence {
    KnowledgeEvidence {
        chapter: 1,
        p: 0,
        q: "quote".to_string(),
        verified: true,
    }
}

fn unverified() -> KnowledgeEvidence {
    KnowledgeEvidence {
        verified: false,
        ..verified()
    }
}

fn entity(id: &str, kind: &str, name: &str) -> KnowledgeItem {
    KnowledgeItem::Entity(KnowledgeEntity {
        id: id.to_string(),
        entity_type: kind.to_string(),
        name: name.to_string(),
        titles: Vec::new(),
        aliases: Vec::new(),
        ev: vec![verified()],
        stale: Vec::new(),
    })
}

fn fact(id: &str, pred: &str, subject: &str, object: Option<&str>) -> KnowledgeItem {
    KnowledgeItem::Fact(KnowledgeFact {
        id: id.to_string(),
        pred: pred.to_string(),
        subject: subject.to_string(),
        object: object.map(str::to_string),
        ev: vec![verified()],
        stale: Vec::new(),
    })
}

fn with_ev(item: KnowledgeItem, ev: Vec<KnowledgeEvidence>) -> KnowledgeItem {
    match item {
        KnowledgeItem::Entity(entity) => KnowledgeItem::Entity(KnowledgeEntity { ev, ..entity }),
        KnowledgeItem::Fact(fact) => KnowledgeItem::Fact(KnowledgeFact { ev, ..fact }),
    }
}

fn with_stale(item: KnowledgeItem, stale: Vec<i64>) -> KnowledgeItem {
    match item {
        KnowledgeItem::Entity(entity) => KnowledgeItem::Entity(KnowledgeEntity { stale, ..entity }),
        KnowledgeItem::Fact(fact) => KnowledgeItem::Fact(KnowledgeFact { stale, ..fact }),
    }
}

fn clean() -> Vec<KnowledgeItem> {
    vec![
        entity("c1", "character", "Nguyen"),
        entity("p1", "persona", "Lan Anh"),
        fact("f1", "persona_of", "p1", Some("c1")),
    ]
}

fn of_rule(issues: &[KnowledgeIssue], rule: &str) -> Vec<KnowledgeIssue> {
    issues
        .iter()
        .filter(|issue| issue.rule == rule)
        .cloned()
        .collect()
}

fn ids_of(issues: &[KnowledgeIssue], rule: &str) -> Vec<String> {
    of_rule(issues, rule)
        .into_iter()
        .map(|issue| issue.id)
        .collect()
}

fn run(items: &[KnowledgeItem]) -> Vec<KnowledgeIssue> {
    check(Ontology::get(), items)
}

fn rules_of(issues: &[KnowledgeIssue]) -> Vec<&str> {
    issues.iter().map(|issue| issue.rule.as_str()).collect()
}

#[test]
fn clean_knowledge_has_no_issues() {
    assert_eq!(run(&clean()), Vec::new());
    assert_eq!(run(&[]), Vec::new());
}

#[test]
fn character_predicate_flags_facts_on_a_character() {
    let items = vec![
        entity("c1", "character", "Nguyen"),
        entity("p1", "persona", "Lan"),
        entity("p2", "persona", "Mai"),
        fact("f1", "persona_of", "p1", Some("c1")),
        fact("f2", "gender", "c1", None),
        fact("f3", "kin_of", "p2", Some("c1")),
        fact("f4", "persona_of", "p2", Some("c1")),
    ];
    let issues = of_rule(&run(&items), "character_predicate");
    assert_eq!(
        issues
            .iter()
            .map(|issue| issue.id.as_str())
            .collect::<Vec<_>>(),
        vec!["character_predicate|f2|f2", "character_predicate|f3|f3"]
    );
    assert_eq!(issues[0].values, vec!["p1", "p2"]);
    assert_eq!(issues[0].severity, Severity::Error);
    assert_eq!(issues[0].ids, vec!["f2"]);
    assert!(issues[0].message.contains("gender"));
    assert!(issues[0].message.contains("Nguyen"));
}

#[test]
fn character_predicate_ignores_persona_facts() {
    let items = vec![
        entity("c1", "character", "Nguyen"),
        entity("p1", "persona", "Lan"),
        entity("l1", "location", "Hue"),
        fact("f1", "persona_of", "p1", Some("c1")),
        fact("f2", "resides_at", "p1", Some("l1")),
    ];
    assert!(ids_of(&run(&items), "character_predicate").is_empty());
}

#[test]
fn persona_link_flags_missing_and_multiple_links() {
    let items = vec![
        entity("c1", "character", "Alpha"),
        entity("c2", "character", "Beta"),
        entity("p1", "persona", "Delta"),
        entity("p2", "persona", "Gamma"),
        fact("f1", "persona_of", "p2", Some("c1")),
        fact("f2", "persona_of", "p2", Some("c2")),
    ];
    let issues = of_rule(&run(&items), "persona_link");
    assert_eq!(
        issues
            .iter()
            .map(|issue| issue.id.as_str())
            .collect::<Vec<_>>(),
        vec!["persona_link|none|p1|p1", "persona_link|many|p2|p2,f1,f2"]
    );
    assert_eq!(issues[1].ids, vec!["p2", "f1", "f2"]);
    assert!(issues[0].message.contains("Delta"));
    assert!(issues[1].message.contains("Alpha, Beta"));
}

#[test]
fn persona_link_accepts_exactly_one_link() {
    assert!(ids_of(&run(&clean()), "persona_link").is_empty());
}

#[test]
fn persona_link_ignores_links_to_non_characters() {
    let items = vec![
        entity("p1", "persona", "Lan"),
        entity("p2", "persona", "Mai"),
        fact("f1", "persona_of", "p1", Some("p2")),
    ];
    let ids = ids_of(&run(&items), "persona_link");
    assert_eq!(
        ids,
        vec!["persona_link|none|p1|p1", "persona_link|none|p2|p2"]
    );
}

#[test]
fn relation_signature_flags_wrong_types_and_unknown_predicates() {
    let items = vec![
        entity("p1", "persona", "Lan"),
        entity("o1", "organization", "Guild"),
        entity("l1", "location", "Hue"),
        fact("f1", "member_of", "p1", Some("l1")),
        fact("f2", "occurs_at", "p1", Some("l1")),
        fact("f3", "occupation", "o1", None),
        fact("f4", "mystery", "p1", None),
        fact("f5", "kin_of", "p1", None),
        fact("f6", "member_of", "p1", Some("o1")),
        fact("f7", "gender", "p1", Some("o1")),
        fact("f8", "member_of", "p1", Some("gone")),
    ];
    let issues = of_rule(&run(&items), "relation_signature");
    assert_eq!(
        issues
            .iter()
            .map(|issue| issue.id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "relation_signature|member_of|persona|location|f1",
            "relation_signature|occurs_at|persona|location|f2",
            "relation_signature|occupation|organization||f3",
            "relation_signature|unknown|mystery|f4|f4",
            "relation_signature|kin_of|persona||f5",
        ]
    );
    assert!(issues[0].message.contains("persona -> organization"));
    assert!(issues[0].message.contains("persona -> location"));
    assert!(issues[2].message.contains("expects persona but"));
    assert!(issues[4].message.contains("persona -> ?"));
}

#[test]
fn relation_signature_accepts_valid_facts_and_skips_characters() {
    let items = vec![
        entity("c1", "character", "Nguyen"),
        entity("p1", "persona", "Lan"),
        entity("o1", "organization", "Guild"),
        fact("f1", "persona_of", "p1", Some("c1")),
        fact("f2", "member_of", "p1", Some("o1")),
        fact("f3", "gender", "p1", None),
        fact("f4", "gender", "c1", None),
    ];
    assert!(ids_of(&run(&items), "relation_signature").is_empty());
}

#[test]
fn relation_signature_flags_persona_of_with_wrong_range() {
    let items = vec![
        entity("p1", "persona", "Lan"),
        entity("l1", "location", "Hue"),
        entity("c1", "character", "Nguyen"),
        fact("f1", "persona_of", "l1", Some("c1")),
    ];
    assert_eq!(
        ids_of(&run(&items), "relation_signature"),
        vec!["relation_signature|persona_of|location|character|f1"]
    );
}

#[test]
fn dangling_ref_flags_missing_subject_and_object() {
    let items = vec![
        entity("p1", "persona", "Lan"),
        fact("f1", "member_of", "p1", Some("gone")),
        fact("f2", "gender", "ghost", None),
        fact("f3", "member_of", "p1", Some("f1")),
        fact("f4", "kin_of", "p1", Some("p1")),
    ];
    let issues = of_rule(&run(&items), "dangling_ref");
    assert_eq!(
        issues
            .iter()
            .map(|issue| issue.id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "dangling_ref|f1|f1",
            "dangling_ref|f2|f2",
            "dangling_ref|f3|f3"
        ]
    );
    assert!(issues[0].message.contains("gone"));
    assert!(issues[1].message.contains("ghost"));
}

#[test]
fn dangling_ref_accepts_resolvable_facts() {
    assert!(ids_of(&run(&clean()), "dangling_ref").is_empty());
}

#[test]
fn relation_unique_flags_several_subjects_for_one_object() {
    let items = vec![
        entity("p1", "persona", "Lan"),
        entity("p2", "persona", "Mai"),
        entity("p3", "persona", "Hoa"),
        entity("o1", "organization", "Guild"),
        entity("o2", "organization", "Clan"),
        fact("f1", "leader_of", "p1", Some("o1")),
        fact("f2", "leader_of", "p2", Some("o1")),
        fact("f3", "leader_of", "p3", Some("o2")),
        fact("f4", "leader_of", "p1", Some("o1")),
        fact("f5", "kin_of", "p1", Some("p3")),
        fact("f6", "kin_of", "p2", Some("p3")),
    ];
    let issues = of_rule(&run(&items), "relation_unique");
    assert_eq!(
        issues
            .iter()
            .map(|issue| issue.id.as_str())
            .collect::<Vec<_>>(),
        vec!["relation_unique|leader_of|o1|f1,f2,f4"]
    );
    assert_eq!(issues[0].severity, Severity::Warning);
    assert!(issues[0].message.contains("Lan, Mai"));
    assert!(issues[0].message.contains("Guild"));
}

#[test]
fn relation_unique_accepts_one_subject_per_object() {
    let items = vec![
        entity("p1", "persona", "Lan"),
        entity("o1", "organization", "Guild"),
        fact("f1", "leader_of", "p1", Some("o1")),
        fact("f2", "leader_of", "p1", Some("o1")),
    ];
    assert!(ids_of(&run(&items), "relation_unique").is_empty());
}

#[test]
fn relation_unique_ignores_dangling_subjects() {
    let items = vec![
        entity("p1", "persona", "Lan"),
        entity("o1", "organization", "Guild"),
        fact("f1", "leader_of", "p1", Some("o1")),
        fact("f2", "leader_of", "ghost", Some("o1")),
    ];
    assert!(ids_of(&run(&items), "relation_unique").is_empty());
}

#[test]
fn entity_duplicate_flags_token_subsets_of_the_same_type() {
    let items = vec![
        entity("p1", "persona", "Trần Đức"),
        entity("p2", "persona", "Duc"),
        entity("l1", "location", "Duc"),
        entity("p3", "persona", "Mai"),
        entity("p4", "persona", "---"),
    ];
    let issues = of_rule(&run(&items), "entity_duplicate");
    assert_eq!(
        issues
            .iter()
            .map(|issue| issue.id.as_str())
            .collect::<Vec<_>>(),
        vec!["entity_duplicate|p1,p2|p1,p2"]
    );
    assert_eq!(issues[0].ids, vec!["p1", "p2"]);
    assert!(issues[0].message.contains("Trần Đức"));
}

#[test]
fn entity_duplicate_accepts_distinct_names() {
    let items = vec![
        entity("p1", "persona", "Lan Anh"),
        entity("p2", "persona", "Lan Chi"),
        entity("l1", "location", "Lan Anh"),
    ];
    assert!(ids_of(&run(&items), "entity_duplicate").is_empty());
}

#[test]
fn entity_duplicate_flags_identical_names_in_item_order() {
    let items = vec![
        entity("p2", "persona", "Lan"),
        entity("p1", "persona", "Lan"),
    ];
    assert_eq!(
        ids_of(&run(&items), "entity_duplicate"),
        vec!["entity_duplicate|p2,p1|p2,p1"]
    );
}

#[test]
fn tokens_strip_diacritics_and_split_on_punctuation() {
    assert_eq!(tokens_of("Nguyễn Đình-Thi"), vec!["nguyen", "dinh", "thi"]);
    assert_eq!(tokens_of("Đ"), vec!["d"]);
    assert!(tokens_of(" -- ").is_empty());
}

#[test]
fn evidence_flags_missing_and_unverified_quotes() {
    let items = vec![
        with_ev(entity("p1", "persona", "Lan"), Vec::new()),
        with_ev(entity("p2", "persona", "Mai"), vec![unverified()]),
        entity("p3", "persona", "Hoa"),
        with_ev(
            fact("f1", "kin_of", "p3", Some("p2")),
            vec![verified(), unverified()],
        ),
        with_ev(fact("f2", "kin_of", "p2", Some("p3")), Vec::new()),
    ];
    let issues = of_rule(&run(&items), "evidence");
    assert_eq!(
        issues
            .iter()
            .map(|issue| issue.id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "evidence|p1|none|p1",
            "evidence|p2|quote|p2",
            "evidence|f1|quote|f1",
            "evidence|f2|none|f2"
        ]
    );
    assert_eq!(
        issues[3].message,
        "Mai - kin_of -> Hoa has no evidence quote."
    );
}

#[test]
fn evidence_accepts_verified_quotes() {
    assert!(ids_of(&run(&clean()), "evidence").is_empty());
}

#[test]
fn source_stale_flags_items_with_stale_chapters() {
    let items = vec![
        with_stale(entity("p1", "persona", "Lan"), vec![2, 3]),
        entity("p2", "persona", "Mai"),
        with_stale(fact("f1", "kin_of", "p1", Some("p2")), vec![4]),
    ];
    let issues = of_rule(&run(&items), "source_stale");
    assert_eq!(
        issues
            .iter()
            .map(|issue| issue.id.as_str())
            .collect::<Vec<_>>(),
        vec!["source_stale|p1|p1", "source_stale|f1|f1"]
    );
    assert!(issues[0].message.contains("2, 3"));
}

#[test]
fn source_stale_accepts_fresh_items() {
    assert!(ids_of(&run(&clean()), "source_stale").is_empty());
}

#[test]
fn issues_follow_the_rule_order_of_the_ontology() {
    let items = vec![with_stale(
        with_ev(entity("p1", "persona", "Lan"), Vec::new()),
        vec![1],
    )];
    let issues = run(&items);
    assert_eq!(
        rules_of(&issues),
        vec!["persona_link", "evidence", "source_stale"]
    );
    assert_eq!(issues[0].severity, Severity::Error);
    assert_eq!(issues[1].severity, Severity::Warning);

    let mut reversed = Ontology::get().clone();
    reversed.rules.reverse();
    let issues = check(&reversed, &items);
    assert_eq!(
        rules_of(&issues),
        vec!["source_stale", "evidence", "persona_link"]
    );
}

#[test]
fn rules_missing_from_the_ontology_are_skipped() {
    let items = vec![with_stale(
        with_ev(entity("p1", "persona", "Lan"), Vec::new()),
        vec![1],
    )];
    let mut trimmed = Ontology::get().clone();
    trimmed.rules.retain(|rule| rule.key == "source_stale");
    assert_eq!(rules_of(&check(&trimmed, &items)), vec!["source_stale"]);

    trimmed.rules.insert(
        0,
        RuleDef {
            key: "unknown_rule".to_string(),
            severity: Severity::Error,
        },
    );
    assert_eq!(rules_of(&check(&trimmed, &items)), vec!["source_stale"]);

    trimmed.rules.clear();
    assert!(check(&trimmed, &items).is_empty());
}

#[test]
fn issues_serialize_in_camel_case() {
    let items = vec![entity("p1", "persona", "Lan")];
    let issue = of_rule(&run(&items), "persona_link").remove(0);
    let value = serde_json::to_value(&issue).unwrap();
    assert_eq!(value["severity"], "error");
    assert_eq!(value["rule"], "persona_link");
    assert_eq!(value["ids"], serde_json::json!(["p1"]));
    assert_eq!(value["values"], serde_json::json!([]));
}
