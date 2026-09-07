use crate::features::assistant::models::AssistantMessage;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::Role;
use crate::features::assistant::models::ScopeKind;
use crate::features::novel::models::NovelSummary;

const HISTORY_CHARS: usize = 600;

const PROJECT_TOOLS: &str = concat!(
    "- `list_project`: list every project with its id, name, template, linked novel id, modules and archived flag.\n",
    "- `read_project`: read one project by `projectId`: its metadata, the text version it works from (`srcKind`, `srcLang`), the linked novel, the progress of its modules and its chapters with the id of the script unit written for each.\n",
    "- `read_script`: read the script of one project by `projectId`: the configuration `cfg` (the block types allowed), the cast (the speaker ids a dialogue block names in `who`) and the outline of the script units.\n",
    "- `read_script_unit`: read the blocks of one script unit by `projectId` and `unitId`. A page holds a limited number of blocks; when the result has a `next` value, call the tool again with `from` set to it to read on. Pass `withSource` to see the source paragraphs each block refers to.\n",
    "- `search_project`: search the text, speaker and location of the script blocks of one project by `projectId` and `query`, optionally within one `unitId`.\n",
    "- `read_audiobook`: read the voices, the mix and the audio progress of every unit of one project by `projectId`.\n",
    "- `read_audiobook_unit`: read the audio state (none, done, stale or flag) of the voiced blocks of one unit by `projectId` and `unitId`.\n",
    "- `submit_script_draft`: propose a rewrite of one script unit by `projectId`, `unitId`, `blocks` and optional `extraCast`; the user reviews it on a card and nothing is written until the user applies it.\n",
    "- `edit_project`: change the `name` and `description` of one project by `projectId`.\n",
    "- `edit_script_unit`: change a few blocks of a script unit that already has blocks by `projectId`, `unitId` and `ops`, a list of `set`, `insert`, `delete` and `move` operations; `set` and `delete` carry `expected`, the exact current text of the block.\n",
    "- `edit_script_cast`: add, rename and remove the extra members of the cast by `projectId` with `add`, `rename` and `remove`.\n",
    "- `list_voice`: list the voices of the library with their id, name, gender, language and engine.\n",
    "- `edit_audiobook_voices`: choose the `voice` (an id from `list_voice`) and the `speed` of speakers by `projectId` and `voices`.\n",
    "- `edit_audiobook_mix`: change the `gap`, `intro`, `outro`, `vol` and `sentence` mix settings by `projectId`.\n",
    "- `flag_audio_segment`: flag the generated audio of one block for review by `projectId`, `unitId`, `blockId` and a `flag` note, or clear the flag with an empty note.\n",
);

const RUN_TOOLS: &str = concat!(
    "- `start_translation`: prepare the translation of whole chapters by `novelId`, `target` (`VI` or `EN`) and `chapters` (chapter numbers), with `overwrite` only when the user wants chapters that already have a translation translated again.
",
    "- `start_analysis`: prepare the knowledge analysis of whole chapters by `novelId`, `lang` (`src`, `VI` or `EN`) and `chapters`, with `overwrite` only when the user wants analyzed chapters analyzed again.
",
);

const SYNTHESIS_TOOL: &str = "- `start_synthesis`: prepare the audio generation of script units by `projectId` and `units` (unit ids), with `mode` `missing` (every block without up-to-date audio, the default) or `all`.
";

const PIPELINE_STATUS_TOOLS: &str = concat!(
    "- `list_pipeline`: list the latest runs of translation, analysis and audio generation with their status and progress.
",
    "- `read_pipeline`: read one run by `pipelineId` with the state of each of its tasks.
",
    "- `cancel_pipeline`: cancel a queued or running run by `pipelineId`.
",
);

const PIPELINE_RULES: &str = concat!(
    "- The `start_*` tools never start a job: they show a confirmation card and the job starts only when the user presses Run on it. Never say that a job has started or finished before the user confirmed it, and tell the user to confirm on the card.
",
    "- Queue only the chapters or units the user asked for. When a `start_*` tool reports that nothing is left to run or that a voice is missing, tell the user and ask before you use `overwrite` or another `mode`.
",
    "- Use `list_pipeline` and `read_pipeline` only when the user asks about the status of a run, and `cancel_pipeline` only when the user asks to stop one.
",
);

const PROJECT_READING_RULE: &str = "- Read the script with `read_script` and `read_script_unit` before you answer about it, and point to blocks by their id and position `p`.\n";

const DRAFT_RULES: &str = concat!(
    "- To rewrite or write a whole script unit, read it first with `read_script` and `read_script_unit`, then send the whole new unit once with `submit_script_draft`.\n",
    "- `submit_script_draft` shows a card and the script changes only when the user applies it: never say the script has changed before that, and tell the user to review the card.\n",
    "- When the user does not say which unit to rewrite and several could match, ask which one. Choose speakers only from evidence in the text and leave `who` empty when unsure.\n",
);

const EDIT_RULES: &str = concat!(
    "- For a small fix of a few blocks, such as a typo, a speaker or a pause, read the unit right before and use `edit_script_unit`; it writes at once, so change only what the user asked for.\n",
    "- To assign voices, read `read_audiobook` and the cast with `read_script`, read `read_novel_knowledge` for the traits of the characters, then `list_voice`, and set them with `edit_audiobook_voices`. Use only voice ids from `list_voice`, never invent one, and say which voice each speaker got and why.\n",
    "- After an edit tool, say plainly what changed. Changing the text, the speaker or the parenthetical of a block, or the voice or speed of a speaker, makes the audio already generated for them outdated: report the `staleAudio` or `outdatedAudio` count of the result and tell the user the audio must be generated again.\n",
);

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
    prompt.push_str("## Tools\n");
    prompt.push_str(
        "Use only the MCP tools of the `dreamy` server to look at and change the workspace:\n",
    );
    prompt.push_str("- `list_novel`: list every novel with its id, title, author, language, tags and chapter counts.\n");
    prompt.push_str(
        "- `read_novel`: read one novel by `novelId`, with the outline of its chapters.\n",
    );
    prompt.push_str("- `read_novel_chapter`: read the paragraphs of one chapter by `novelId` and `chapter` (the chapter number). A page holds a limited number of paragraphs; when the result has a `next` value, call the tool again with `from` set to it to read on.\n");
    prompt.push_str("- `read_novel_knowledge`: read the knowledge of one novel by `novelId` and `lang` (`src`, `VI` or `EN`), optionally filtered by `query` and `type`. When the result has a `next` offset, call the tool again with `offset` set to it to read on.\n");
    prompt.push_str("- `edit_novel`: change the metadata fields of one novel by `novelId`.\n");
    prompt.push_str("- `edit_novel_chapter`: change one chapter by `novelId` and `chapter`, with an optional new `title` and `paragraphs`, a list of `{p, expected, text}` where `expected` must be the exact current text of paragraph `p` and `text` is its replacement.\n");
    prompt.push_str("- `edit_novel_knowledge`: change the knowledge of one novel by `novelId` and `lang`, with `edits`, a list of edits each carrying a `k` tag that names its kind.\n");
    prompt.push_str(project_tools(scope));
    prompt.push_str(&pipeline_tools(scope));
    prompt.push('\n');
    prompt.push_str("## Rules\n");
    prompt.push_str("- Answer in the user's language.\n");
    prompt.push_str("- State only facts you read through the tools. If you did not read it or you are unsure, say so instead of guessing.\n");
    prompt.push_str("- Keep the answer concise and in plain text.\n");
    prompt.push_str("- Edit only when the user asks you to change something. Read before you edit. If an edit tool says editing is not enabled, tell the user to turn it on in the assistant panel.\n");
    prompt.push_str(PIPELINE_RULES);
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

fn project_tools(scope: &AssistantScope) -> &'static str {
    if scope.kind == ScopeKind::Novel {
        ""
    } else {
        PROJECT_TOOLS
    }
}

fn pipeline_tools(scope: &AssistantScope) -> String {
    let synthesis = if scope.kind == ScopeKind::Novel {
        ""
    } else {
        SYNTHESIS_TOOL
    };
    format!("{RUN_TOOLS}{synthesis}{PIPELINE_STATUS_TOOLS}")
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
    format!("{focus}{novel}{PROJECT_READING_RULE}{DRAFT_RULES}{EDIT_RULES}")
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

#[cfg(test)]
#[path = "../../../test/features/assistant/prompt.test.rs"]
mod tests;
