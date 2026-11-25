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
