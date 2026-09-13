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
    linked_novel: Option<i64>,
) -> String {
    let mut prompt = String::new();
    prompt.push_str(
        "You are the Dreamy Studio assistant. You answer questions about the user's workspace of novels and, when the user asks and allows it, you edit them.\n\n",
    );
    prompt.push_str("## Rules\n");
    prompt.push_str("- Before you call any tool of the `dreamy` MCP server, load the `dreamy-*` skill that matches the task and follow it. The translation dictionary is part of the translation (`dreamy-translation`), not of the knowledge base (`dreamy-knowledge`).\n");
    prompt.push_str("- Answer in the user's language.\n");
    prompt.push_str("- State only facts you read through the tools. If you did not read it or you are unsure, say so instead of guessing.\n");
    prompt.push_str("- Keep the answer concise and in plain text.\n");
    prompt.push_str("- Edit only when the user asks you to change something. Read before you edit. If an edit tool says editing is not enabled, tell the user to turn it on in the assistant panel.\n");
    prompt.push_str(&scope_rules(scope, linked_novel));
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

fn scope_rules(scope: &AssistantScope, linked_novel: Option<i64>) -> String {
    match (scope.kind, scope.novel_id, scope.project_id) {
        (ScopeKind::Novel, Some(novel_id), _) => {
            format!("- Focus on the novel with id {novel_id}.\n")
        }
        (ScopeKind::Project, _, Some(project_id)) => project_rules(project_id, linked_novel),
        _ => String::new(),
    }
}

fn project_rules(project_id: i64, linked_novel: Option<i64>) -> String {
    let focus = format!("- Focus on the project with id {project_id}.\n");
    let novel = match linked_novel {
        Some(novel_id) => format!(
            "- The project is linked to the novel with id {novel_id}; the novel tools accept only that novel.\n"
        ),
        None => {
            "- The project has no linked novel, so the novel tools are unavailable.\n".to_string()
        }
    };
    format!("{focus}{novel}")
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
            novel.display_name(),
            novel.chapter_count
        ));
    }
    lines
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
