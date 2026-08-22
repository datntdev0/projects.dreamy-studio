use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::KnownEntity;
use crate::features::knowledge::parse::parse_reply;
use crate::features::pipeline::llm::ClientError;
use crate::features::pipeline::llm::LlmClient;
use crate::features::settings::repository::SettingsRepository;
use std::sync::atomic::AtomicBool;

pub const FEATURE: &str = "knowledge";
const LABEL: &str = "knowledge analysis";
const FINISHED_PROGRESS: u8 = 100;

const INTRO: &str = "You are a literary analyst. Read the novel chapter below and extract what it says as entities and facts, following the ontology.\n";

const RULES: &str = "\nRules:\n\
- Entities have no description.\n\
- A scalar fact has no value. Quote the sentence that carries the information as its evidence.\n\
- A character is reached only through persona_of.\n\
- All facts about people are attached to personas, never to characters.\n\
- Give titles and aliases only for personas.\n\
- Every \"q\" must be copied verbatim from the paragraph numbered \"p\" (the number in square brackets, starting at 1).\n\
- Use the text's own spelling for names.\n\
- List one entity per (type, name) and one fact per (pred, subject, object). A scalar fact lists all its quotes in \"ev\".\n\
- Use local ids E1, E2, ... for entities and F1, F2, ... for facts.\n";

const KNOWN_INTRO: &str = "\nKnown entities from earlier chapters, one per line as `- type | name | aliases | titles | character`:\n";

const KNOWN_RULES: &str = "When the text refers to one of these entities, reuse its exact name and type, and never invent a new spelling for it. A known entity does not need to appear in the reply unless this chapter mentions it.\n";

const CONTRACT: &str = "\nReply with only one JSON object shaped like {\"entities\":[{\"id\":\"E1\",\"type\":\"persona\",\"name\":\"...\",\"titles\":[],\"aliases\":[],\"ev\":[{\"p\":1,\"q\":\"...\"}]}],\"facts\":[{\"id\":\"F1\",\"pred\":\"occupation\",\"subject\":\"E1\",\"object\":\"E2\",\"ev\":[{\"p\":1,\"q\":\"...\"}]}]}. Omit `object` on scalar facts. Do not add commentary or code fences.\n";

#[derive(Debug, Clone)]
pub struct AnalyzeJob {
    pub lang: String,
    pub title: String,
    pub paragraphs: Vec<String>,
    pub ontology: String,
    pub known: Vec<KnownEntity>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnalyzeError {
    Cancelled,
    Failed(String),
}

pub trait Analyzer: Send + Sync {
    fn analyze(
        &self,
        job: &AnalyzeJob,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<ChapterAnalysis, AnalyzeError>;
}

impl From<ClientError> for AnalyzeError {
    fn from(error: ClientError) -> Self {
        match error {
            ClientError::Cancelled => AnalyzeError::Cancelled,
            ClientError::Failed(message) => AnalyzeError::Failed(message),
        }
    }
}

#[derive(Debug, Clone)]
pub struct LlmAnalyzer {
    client: LlmClient,
}

impl LlmAnalyzer {
    pub fn new(repository: SettingsRepository) -> Self {
        Self {
            client: LlmClient::new(repository, FEATURE, LABEL),
        }
    }
}

impl Analyzer for LlmAnalyzer {
    fn analyze(
        &self,
        job: &AnalyzeJob,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<ChapterAnalysis, AnalyzeError> {
        let text = self.client.complete(build_prompt(job), progress, cancel)?;
        let analysis = parse_reply(&text, job.paragraphs.len()).map_err(AnalyzeError::Failed)?;
        progress(FINISHED_PROGRESS);
        Ok(analysis)
    }
}

pub fn build_prompt(job: &AnalyzeJob) -> String {
    let mut prompt = String::from(INTRO);
    prompt.push_str(&ontology_section(&job.ontology));
    prompt.push_str(RULES);
    prompt.push_str(&known_section(&job.known));
    prompt.push_str(&chapter_section(job));
    prompt.push_str(CONTRACT);
    prompt
}

fn ontology_section(ontology: &str) -> String {
    let mut section = String::from("\nOntology:\n```yaml\n");
    section.push_str(ontology);
    if !ontology.ends_with('\n') {
        section.push('\n');
    }
    section.push_str("```\n");
    section
}

fn known_section(known: &[KnownEntity]) -> String {
    if known.is_empty() {
        return String::new();
    }
    let mut section = String::from(KNOWN_INTRO);
    for entity in known {
        section.push_str(&known_line(entity));
        section.push('\n');
    }
    section.push_str(KNOWN_RULES);
    section
}

fn known_line(entity: &KnownEntity) -> String {
    let mut line = format!("- {} | {}", entity.kind, entity.name);
    if !entity.aliases.is_empty() {
        line.push_str(&format!(" | aliases: {}", entity.aliases.join(", ")));
    }
    if !entity.titles.is_empty() {
        line.push_str(&format!(" | titles: {}", entity.titles.join(", ")));
    }
    if let Some(character) = &entity.character {
        line.push_str(&format!(" | character: {character}"));
    }
    line
}

fn chapter_section(job: &AnalyzeJob) -> String {
    let mut section = format!(
        "\nChapter title: {}\nLanguage of the text: {}\n\nParagraphs:\n",
        job.title,
        language_name(&job.lang)
    );
    for (index, paragraph) in job.paragraphs.iter().enumerate() {
        section.push_str(&format!("[{}] {paragraph}\n", index + 1));
    }
    section
}

fn language_name(lang: &str) -> &'static str {
    match lang {
        "VI" => "Vietnamese",
        "EN" => "English",
        _ => "the original language of the novel",
    }
}

#[cfg(test)]
#[path = "../../../test/features/pipeline/analyzer.test.rs"]
mod tests;
