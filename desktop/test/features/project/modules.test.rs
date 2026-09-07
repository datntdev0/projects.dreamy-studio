use super::*;

fn ids(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_string()).collect()
}

#[test]
fn template_modules_are_always_enabled_in_catalog_order() {
    assert_eq!(
        effective_modules("audiobook", &ids(&["video", "character"])),
        ids(&["scripting", "character", "audiobook", "video"])
    );
    assert_eq!(effective_modules("blank", &[]), Vec::<String>::new());
    assert_eq!(effective_modules("filmseries", &[]).len(), 6);
}

#[test]
fn extra_modules_drop_template_modules_and_reject_unknown_ids() {
    assert_eq!(
        extra_modules("audiobook", &ids(&["audiobook", "video", "video"])).unwrap(),
        ids(&["video"])
    );
    assert_eq!(
        extra_modules("blank", &ids(&["canvas", "scripting"])).unwrap(),
        ids(&["scripting", "canvas"])
    );
    assert!(extra_modules("blank", &ids(&["nope"])).is_err());
}

#[test]
fn modules_round_trip_through_json_text() {
    let modules = ids(&["world"]);
    assert_eq!(decode_modules(&encode_modules(&modules)), modules);
    assert!(decode_modules("not json").is_empty());
}
