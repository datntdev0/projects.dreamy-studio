use crate::features::knowledge::check::KnowledgeIssue;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;

pub fn review_translation(
    novel: &NovelSummary,
    chapter: &ChapterRow,
    target: &str,
    opening: Option<String>,
) -> String {
    let mut prompt = opening.unwrap_or_default();
    if !prompt.is_empty() {
        prompt.push('\n');
    }
    prompt.push_str("## Skill: review_translation\n");
    prompt.push_str(&format!(
        "Review the {target} translation of chapter {} \"{}\" of the novel with id {} (\"{}\"). The user wants you to find translation problems in this chapter and propose fixes.\n\n",
        chapter.seq,
        chapter.title,
        novel.id,
        display_name(novel)
    ));
    prompt.push_str("Follow these steps with the MCP tools of the `dreamy` server:\n");
    prompt.push_str(&format!(
        "1. Call `read_translation_guide` with novelId {} and target \"{target}\" to learn the translation guidelines, the dictionary and the open consistency warnings.\n",
        novel.id
    ));
    prompt.push_str(&format!(
        "2. Call `read_translation` with novelId {}, target \"{target}\" and chapter {} and read every page: while the result has a `next` value, call it again with `from` set to `next`.\n",
        novel.id, chapter.seq
    ));
    prompt.push_str(&format!(
        "3. Call `read_novel_knowledge` for novelId {} (lang \"src\") and check that the names of personas and locations in the translation match the knowledge and the dictionary.\n",
        novel.id
    ));
    prompt.push_str("4. Check dictionary consistency, wrong meaning, omissions (source text left out of the translation) and style against the guidelines.\n");
    prompt.push_str(&format!(
        "5. Call `submit_translation_review` exactly once with novelId {}, target \"{target}\", chapter {}, `checked` (the number of paragraphs you checked), `findings` and `dictionary`.\n",
        novel.id, chapter.seq
    ));
    prompt.push_str("   - Each finding has `n` (paragraph position), `severity` (error, warning or info), `category` (name, dict, meaning, omission or style), `from`, `to` and `reason`.\n");
    prompt.push_str("   - `from` must be a snippet copied verbatim from the current translation of paragraph `n`, as short as possible but unique in that paragraph; `to` replaces its first occurrence. Write `reason` in the user's language.\n");
    prompt.push_str("   - For an omission, set `from` to the snippet just before the missing text and `to` to that snippet followed by the missing translation.\n");
    prompt.push_str("   - `dictionary` lists terms worth adding, each with `src`, `dst`, `type` (name, place, org, title or term) and an optional `note`.\n");
    prompt.push_str("   - If the result lists `dropped` items, you may fix them and call the tool once more; the last call replaces the earlier one.\n");
    prompt.push_str("6. Do not edit the translation, the dictionary or the novel yourself. The user applies or rejects each item on the review card.\n");
    prompt.push_str("7. Finish with a summary of two or three sentences in the user's language: what you checked and the main problems found.\n");
    prompt
}

pub fn review_knowledgebase(
    novel: &NovelSummary,
    lang: &str,
    issues: &[KnowledgeIssue],
    opening: Option<String>,
) -> String {
    let mut prompt = opening.unwrap_or_default();
    if !prompt.is_empty() {
        prompt.push('\n');
    }
    prompt.push_str("## Skill: review_knowledgebase\n");
    prompt.push_str(&format!(
        "Review the knowledge base (lang \"{lang}\") of the novel with id {} (\"{}\"). The user selected {} issue(s) found by the knowledge checker and wants you to fix them.\n\n",
        novel.id,
        display_name(novel),
        issues.len()
    ));
    prompt.push_str("Selected issues:\n");
    for issue in issues {
        prompt.push_str(&format!(
            "- id `{}` (rule {}, {}): {}\n",
            issue.id,
            issue.rule,
            json_text(&issue.severity),
            issue.message
        ));
    }
    prompt.push_str("\nFollow these steps with the MCP tools of the `dreamy` server:\n");
    prompt.push_str(&format!(
        "1. Call `read_knowledge_issues` with novelId {} and lang \"{lang}\", passing the ids above as `issueIds`, to read the issues with the entities and facts they involve and their evidence. Use `read_novel_knowledge` if you need more context about an item.\n",
        novel.id
    ));
    prompt.push_str(&format!(
        "2. Call `read_novel_chapter` with novelId {} to read the evidence passages (chapter and paragraph) and decide what the correct knowledge is.\n",
        novel.id
    ));
    prompt.push_str("3. Propose the smallest set of edits that fixes the issues: merge duplicates, retype or rename entities, change or delete facts, fix aliases and evidence. Do not change items the issues do not involve.\n");
    prompt.push_str(&format!(
        "4. Call `submit_knowledge_changes` exactly once with novelId {}, lang \"{lang}\", a short `title` and `changes`. Each change has `target`, `before`, `after`, `reason` (in the user's language), `ev` (chapter, p and a quote from the chapter) and the `edit` that performs it.\n",
        novel.id
    ));
    prompt.push_str("   - The app tries the edits on a copy of the knowledge base and returns `validation`: `resolves` is the number of issues fixed and `introduces` lists the new issues the edits would cause.\n");
    prompt.push_str("   - If `validation.ok` is false, or the tool returns an error, fix the edits and call `submit_knowledge_changes` again; the last call replaces the earlier one.\n");
    prompt.push_str("5. Leave out issues that cannot be fixed from the existing knowledge and chapters, for example when the chapter must be analysed again, and say which ones in your summary.\n");
    prompt.push_str("6. Do not edit the knowledge base or the novel yourself. The user applies or rejects the change set on the card.\n");
    prompt.push_str("7. Finish with a brief summary in the user's language: what you changed and which issues you left out.\n");
    prompt
}

fn json_text<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|item| item.as_str().map(str::to_string))
        .unwrap_or_default()
}

fn display_name(novel: &NovelSummary) -> &str {
    let name = novel.name.trim();
    if name.is_empty() { &novel.title } else { name }
}

#[cfg(test)]
#[path = "../../../test/features/assistant/skills.test.rs"]
mod tests;
