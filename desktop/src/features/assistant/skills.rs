use crate::features::assistant::catalog::KNOWLEDGE_SKILL;
use crate::features::assistant::catalog::SCRIPT_SKILL;
use crate::features::assistant::catalog::TRANSLATION_SKILL;
use crate::features::knowledge::check::KnowledgeIssue;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;
use crate::features::project::models::ProjectSummary;
use crate::features::scripting::cast::knowledge_lang;

struct Workflow<'a> {
    skill: &'a str,
    section: &'a str,
    inputs: Vec<String>,
}

pub fn review_translation(
    novel: &NovelSummary,
    chapter: &ChapterRow,
    target: &str,
    opening: Option<String>,
) -> String {
    let workflow = Workflow {
        skill: TRANSLATION_SKILL,
        section: "review a chapter",
        inputs: vec![
            input("novelId", novel.id),
            input("novel title", novel.display_name()),
            input("target", target),
            input("chapter number", chapter.seq),
            input("chapter title", &chapter.title),
        ],
    };
    task_prompt(opening, &workflow)
}

pub fn review_knowledgebase(
    novel: &NovelSummary,
    lang: &str,
    issues: &[KnowledgeIssue],
    opening: Option<String>,
) -> String {
    let mut inputs = vec![
        input("novelId", novel.id),
        input("novel title", novel.display_name()),
        input("lang", lang),
    ];
    inputs.extend(issues.iter().map(issue_input));
    let workflow = Workflow {
        skill: KNOWLEDGE_SKILL,
        section: "fix knowledge issues",
        inputs,
    };
    task_prompt(opening, &workflow)
}

pub struct ScriptRewrite<'a> {
    pub project: &'a ProjectSummary,
    pub unit_id: &'a str,
    pub unit_title: &'a str,
    pub chapter: Option<i64>,
    pub note: Option<&'a str>,
}

pub fn rewrite_script_unit(rewrite: &ScriptRewrite, opening: Option<String>) -> String {
    let ScriptRewrite {
        project,
        unit_id,
        unit_title,
        chapter,
        note,
    } = rewrite;
    let mut inputs = vec![
        input("projectId", project.id),
        input("project name", &project.name),
        input("unitId", unit_id),
        input("unit title", unit_title),
    ];
    inputs.extend(chapter.map(|seq| input("chapter number", seq)));
    inputs.extend(linked_novel_inputs(project));
    inputs.extend(note.map(|text| input("user note", text)));
    let workflow = Workflow {
        skill: SCRIPT_SKILL,
        section: "rewrite a script unit",
        inputs,
    };
    task_prompt(opening, &workflow)
}

fn task_prompt(opening: Option<String>, workflow: &Workflow) -> String {
    let mut prompt = opening.unwrap_or_default();
    if !prompt.is_empty() {
        prompt.push('\n');
    }
    prompt.push_str(&format!(
        "## Task\nLoad the `{}` skill and follow its \"Workflow: {}\" section with these inputs:\n",
        workflow.skill, workflow.section
    ));
    for line in &workflow.inputs {
        prompt.push_str(line);
        prompt.push('\n');
    }
    prompt
}

fn input(key: &str, value: impl std::fmt::Display) -> String {
    format!("- {key}: {value}")
}

fn issue_input(issue: &KnowledgeIssue) -> String {
    format!(
        "- issue: id `{}`, rule {}, severity {}, message: {}",
        issue.id,
        issue.rule,
        json_text(&issue.severity),
        issue.message
    )
}

fn linked_novel_inputs(project: &ProjectSummary) -> Vec<String> {
    match project.novel_id {
        Some(novel_id) => vec![
            input("linked novelId", novel_id),
            input("knowledge lang", knowledge_lang(project)),
        ],
        None => vec![input("linked novelId", "none")],
    }
}

fn json_text<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|item| item.as_str().map(str::to_string))
        .unwrap_or_default()
}
