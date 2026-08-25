use crate::features::assistant::models::AssistantMessage;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::Role;
use crate::features::assistant::models::ScopeKind;
use crate::features::novel::models::NovelSummary;

const HISTORY_CHARS: usize = 600;

const CITATION_FORMAT: &str =
    "<citations>[{\"novelId\":1,\"chapter\":3,\"p\":6,\"quote\":\"verbatim text\"}]</citations>";

pub fn opening(
    scope: &AssistantScope,
    history: &[AssistantMessage],
    text: &str,
    novels: &[NovelSummary],
) -> String {
    let mut prompt = String::new();
    prompt.push_str(
        "You are the Dreamy Studio assistant. You answer questions about the user's workspace of novels. You are read-only: you cannot change anything.\n\n",
    );
    prompt.push_str("## Tools\n");
    prompt.push_str("Use only the MCP tools of the `dreamy` server to look at the workspace:\n");
    prompt.push_str("- `list_novel`: list every novel with its id, title, author, language, tags and chapter counts.\n");
    prompt.push_str(
        "- `read_novel`: read one novel by `novelId`, with the outline of its chapters.\n",
    );
    prompt.push_str("- `read_novel_chapter`: read the paragraphs of one chapter by `novelId` and `chapter` (the chapter number). A page holds a limited number of paragraphs; when the result has a `next` value, call the tool again with `from` set to it to read on.\n\n");
    prompt.push_str("## Rules\n");
    prompt.push_str("- Answer in the user's language.\n");
    prompt.push_str("- State only facts you read through the tools. If you did not read it or you are unsure, say so instead of guessing.\n");
    prompt.push_str("- Keep the answer concise and in plain text.\n");
    if scope.kind == ScopeKind::Novel
        && let Some(novel_id) = scope.novel_id
    {
        prompt.push_str(&format!("- Focus on the novel with id {novel_id}.\n"));
    }
    prompt.push_str("\n## Citations\n");
    prompt.push_str("After the answer you may append exactly one block, with nothing after it:\n");
    prompt.push_str(CITATION_FORMAT);
    prompt.push('\n');
    prompt.push_str("Each entry points to one paragraph you read: `novelId`, the chapter number `chapter`, the paragraph position `p` and a `quote` copied verbatim from that paragraph, at most 120 characters. Leave the block out when nothing needs a citation.\n\n");
    prompt.push_str("## Novels in the workspace\n");
    prompt.push_str(&novel_list(novels));
    if !history.is_empty() {
        prompt.push_str("\n## Conversation so far\n");
        for message in history {
            prompt.push_str(&format!(
                "{}: {}\n",
                label(message.role),
                truncate(message.text.trim(), HISTORY_CHARS)
            ));
        }
    }
    prompt.push_str("\n## Question\n");
    prompt.push_str(text.trim());
    prompt.push('\n');
    prompt
}

pub fn follow_up(text: &str) -> String {
    format!(
        "{}\n\n(If you cite paragraphs you read, end with one block like {CITATION_FORMAT}, quotes verbatim and at most 120 characters.)",
        text.trim()
    )
}

fn novel_list(novels: &[NovelSummary]) -> String {
    if novels.is_empty() {
        return "(no novels)\n".to_string();
    }
    let mut lines = String::new();
    for novel in novels {
        lines.push_str(&format!(
            "- id {}: {} ({} chapters)\n",
            novel.id,
            display_name(novel),
            novel.chapter_count
        ));
    }
    lines
}

fn display_name(novel: &NovelSummary) -> &str {
    let name = novel.name.trim();
    if name.is_empty() { &novel.title } else { name }
}

fn label(role: Role) -> &'static str {
    match role {
        Role::User => "User",
        Role::Assistant => "Assistant",
    }
}

fn truncate(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let cut: String = text.chars().take(limit).collect();
    format!("{cut}…")
}

#[cfg(test)]
#[path = "../../../test/features/assistant/prompt.test.rs"]
mod tests;
