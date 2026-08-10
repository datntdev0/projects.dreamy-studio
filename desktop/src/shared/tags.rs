pub const MAX_TAGS: usize = 12;
pub const MAX_TAG_CHARS: usize = 24;

pub fn normalize_tag(raw: &str) -> String {
    let lowered = raw.to_lowercase().replace([',', '#'], " ");
    lowered
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(MAX_TAG_CHARS)
        .collect()
}

pub fn normalize_tags(raw: &[String]) -> Result<Vec<String>, usize> {
    let mut tags = Vec::new();
    for item in raw {
        let tag = normalize_tag(item);
        if !tag.is_empty() && !tags.contains(&tag) {
            tags.push(tag);
        }
    }
    if tags.len() > MAX_TAGS {
        return Err(tags.len());
    }
    Ok(tags)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_tags_like_the_prototype() {
        assert_eq!(
            normalize_tag("  Slow Burn, #Romance  "),
            "slow-burn-romance"
        );
        assert_eq!(normalize_tag("A,B"), "a-b");
        assert_eq!(normalize_tag("#"), "");
        assert_eq!(normalize_tag(&"x".repeat(40)), "x".repeat(24));
        assert_eq!(
            normalize_tag("\u{4F60}\u{597D} World"),
            "\u{4F60}\u{597D}-world"
        );
    }

    #[test]
    fn dedupes_tags_and_enforces_the_cap() {
        let tags = ["B", "a", "b", " ", "#"].map(str::to_string);
        assert_eq!(normalize_tags(&tags).unwrap(), vec!["b", "a"]);
        let many: Vec<String> = (0..13).map(|index| format!("tag{index}")).collect();
        assert!(normalize_tags(&many).is_err());
        assert_eq!(normalize_tags(&many[..12]).unwrap().len(), 12);
    }
}
