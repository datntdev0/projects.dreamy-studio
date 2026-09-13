pub struct SkillDoc {
    pub name: &'static str,
    pub description: &'static str,
    pub body: &'static str,
}

pub const NOVEL_SKILL: &str = "dreamy-novel";
pub const TRANSLATION_SKILL: &str = "dreamy-translation";
pub const KNOWLEDGE_SKILL: &str = "dreamy-knowledge";
pub const SCRIPT_SKILL: &str = "dreamy-script";
pub const AUDIOBOOK_SKILL: &str = "dreamy-audiobook";
pub const PIPELINE_SKILL: &str = "dreamy-pipeline";

pub const SKILL_DOCS: [SkillDoc; 6] = [
    SkillDoc {
        name: NOVEL_SKILL,
        description: "Reads and edits the text of novels in Dreamy Studio with the dreamy MCP tools read_novel, read_novel_chapter and edit_novel. Use it when the user asks about a novel, its chapters or paragraphs, or wants to change metadata, a chapter title or paragraph text (tiểu thuyết, truyện, chương, đoạn văn, sửa nội dung).",
        body: include_str!("skills/novel.md"),
    },
    SkillDoc {
        name: TRANSLATION_SKILL,
        description: "Reads and edits the translation of a novel and its translation dictionary in Dreamy Studio with the dreamy MCP tools read_translation, edit_translation and submit_translation_review. Use it for the translated text, translation guidelines, the dictionary or glossary of names and terms, and reviewing a translated chapter (bản dịch, từ điển, thuật ngữ, tên riêng, dịch, rà soát bản dịch).",
        body: include_str!("skills/translation.md"),
    },
    SkillDoc {
        name: KNOWLEDGE_SKILL,
        description: "Reads and edits the knowledge base of a novel (characters, places, organizations, facts, aliases, evidence) in Dreamy Studio with the dreamy MCP tools read_novel_knowledge, read_knowledge_issues, edit_novel_knowledge and submit_knowledge_changes. Use it for entities, facts and knowledge checker issues, not for the translation dictionary (thư viện tri thức, nhân vật, thực thể, sự kiện, lỗi tri thức).",
        body: include_str!("skills/knowledge.md"),
    },
    SkillDoc {
        name: SCRIPT_SKILL,
        description: "Reads, searches, drafts and edits the script of a project in Dreamy Studio with the dreamy MCP tools read_project, read_script, search_project, edit_project, edit_script and submit_script_draft. Use it for script units, narration and dialogue blocks, speakers, the cast, and rewriting a unit (kịch bản, đơn vị kịch bản, lời thoại, người kể, nhân vật, viết lại kịch bản, dự án).",
        body: include_str!("skills/script.md"),
    },
    SkillDoc {
        name: AUDIOBOOK_SKILL,
        description: "Reads and edits the audiobook of a project in Dreamy Studio with the dreamy MCP tools read_audiobook, list_voice, edit_audiobook and flag_audio_segment. Use it for voices, speaker voice assignment, speed, the audio mix, and the state or flags of generated audio (sách nói, giọng đọc, chọn giọng, tốc độ, âm thanh, audio lỗi thời).",
        body: include_str!("skills/audiobook.md"),
    },
    SkillDoc {
        name: PIPELINE_SKILL,
        description: "Prepares, checks and cancels runs of translation, knowledge analysis and audio generation in Dreamy Studio with the dreamy MCP tools start_run, read_pipeline and cancel_pipeline. Use it when the user wants to translate, analyze or generate audio for chapters or units, or asks about the status of a run (chạy dịch, phân tích, tạo audio, tiến trình, hủy tiến trình).",
        body: include_str!("skills/pipeline.md"),
    },
];

pub fn skill_file(doc: &SkillDoc) -> String {
    format!(
        "---\nname: {}\ndescription: \"{}\"\n---\n\n{}",
        doc.name,
        yaml_escape(doc.description),
        doc.body
    )
}

fn yaml_escape(text: &str) -> String {
    text.replace('\\', "\\\\").replace('"', "\\\"")
}
