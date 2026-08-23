use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisFact;
use crate::features::knowledge::models::ChapterDraft;
use crate::features::knowledge::models::KnownEntity;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::ontology::PredicateKind;
use crate::features::knowledge::parse::parse_candidates;
use crate::features::knowledge::parse::parse_facts;
use crate::features::pipeline::llm::ClientError;
use crate::features::pipeline::llm::LlmClient;
use crate::features::pipeline::llm::Turn;
use crate::features::pipeline::log::TaskLog;
use crate::features::settings::repository::SettingsRepository;
use std::sync::atomic::AtomicBool;

pub const FEATURE: &str = "knowledge";
pub const PURPOSE_CANDIDATES: &str = "candidates";
pub const PURPOSE_FACTS: &str = "facts";
const CHARACTER: &str = "character";
const PERSONA_OF: &str = "persona_of";
const LABEL: &str = "knowledge analysis";
const MAX_RETRIES: usize = 2;
const MAX_LISTED: usize = 30;

const CANDIDATE_INTRO: &str = "You are a literary analyst. Read the novel chapters below and list the named entities they mention, following the entity types.\n";

const CANDIDATE_RULES: &str = "\nRules:\n\
- Entities have no description.\n\
- Copy every name exactly as it is written in the text, and keep one entity per (type, name).\n\
- Give titles and aliases only for personas: put the other names of a persona in aliases and its honorifics or epithets in titles.\n\
- Facts about people belong to personas, never to characters.\n\
- Every persona has exactly one persona_of fact that points to the character it belongs to: never none and never two. A character may have one persona or several, so list the same character as the object of every persona that is that real person.\n\
- When the text does not say who is behind a persona, list a new character named after that persona and link the persona to it. The name of a character does not have to appear in the chapters.\n\
- In a persona_of fact, subject is the exact name of a persona from the entity list and object is the exact name of a character from the entity list. List no other predicate in this step.\n\
- List only entities that are named in the text.\n";

const KNOWN_INTRO: &str = "\nKnown entities from earlier chapters, one per line as `- type | name | aliases | titles | character`:\n";

const KNOWN_RULES: &str = "When the text refers to one of these entities, reuse its exact name, type and character, and never invent a new spelling for it. When a known persona with a character appears, list that character and the persona_of fact again. A known entity does not need to appear in the reply unless these chapters mention it.\n";

const CANDIDATE_CONTRACT: &str = "\nReply with only one JSON object shaped like {\"entities\":[{\"type\":\"persona\",\"name\":\"...\",\"titles\":[],\"aliases\":[]}],\"facts\":[{\"pred\":\"persona_of\",\"subject\":\"...\",\"object\":\"...\"}]}. Every persona needs its persona_of fact, so \"facts\" is empty only when there is no persona. Do not add commentary or code fences.\n";

const FACTS_INTRO: &str = "You are a literary analyst. Read the novel chapter below and extract the facts it states, using only the listed entities and predicates.\n";

const FACTS_RULES: &str = "\nRules:\n\
- Every subject and object is an id from the entity list.\n\
- A scalar fact has no value and no object. Quote the sentence that carries the information as its evidence.\n\
- A relationship fact needs an object that fits the predicate.\n\
- All facts about people are attached to personas. Do not list persona_of; it is already known.\n\
- Every \"q\" must be copied verbatim from the paragraph numbered \"p\" (the number in square brackets, starting at 1).\n\
- State only what the text says. List one fact per (pred, subject, object); a scalar fact lists all its quotes in \"ev\".\n";

const FACTS_CONTRACT: &str = "\nReply with only one JSON object shaped like {\"facts\":[{\"pred\":\"occupation\",\"subject\":\"E1\",\"object\":\"E2\",\"ev\":[{\"p\":1,\"q\":\"...\"}]}]}. Omit `object` on scalar facts. Do not add commentary or code fences.\n";

const RETRY_CONTRACT: &str = "\nReply again with the complete corrected JSON object (every item, not only the fixed ones), in the same shape as before. Do not add commentary or code fences.\n";

#[derive(Debug, Clone)]
pub struct CandidateChapter {
    pub seq: i64,
    pub title: String,
    pub paragraphs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CandidateJob {
    pub lang: String,
    pub chapters: Vec<CandidateChapter>,
    pub known: Vec<KnownEntity>,
}

#[derive(Debug, Clone)]
pub struct FactsJob {
    pub lang: String,
    pub title: String,
    pub paragraphs: Vec<String>,
    pub entities: Vec<AnalysisEntity>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnalyzeError {
    Cancelled,
    Failed(String),
}

pub trait Analyzer: Send + Sync {
    fn candidates(
        &self,
        job: &CandidateJob,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Vec<ChapterDraft>, AnalyzeError>;

    fn facts(
        &self,
        job: &FactsJob,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Vec<AnalysisFact>, AnalyzeError>;
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

    fn run<T>(
        &self,
        purpose: &str,
        prompt: String,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
        read: &dyn Fn(&str) -> Result<(T, Vec<String>), String>,
    ) -> Result<T, AnalyzeError> {
        let first = self.client.start(purpose, prompt, log, progress, cancel)?;
        log.line(&format!("{purpose}: session {}", first.session));
        let session = first.session.clone();
        let result = self.converse(purpose, first, log, progress, cancel, read);
        self.client.forget(&session);
        result
    }

    fn converse<T>(
        &self,
        purpose: &str,
        first: Turn,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
        read: &dyn Fn(&str) -> Result<(T, Vec<String>), String>,
    ) -> Result<T, AnalyzeError> {
        let mut best = None;
        let mut last_error = String::new();
        let mut turn = first;
        for retry in 0..=MAX_RETRIES {
            let request = match read(&turn.text) {
                Ok((value, issues)) if issues.is_empty() => {
                    log.line(&format!("{purpose}: reply accepted"));
                    return Ok(value);
                }
                Ok((value, issues)) => {
                    log.line(&format!("{purpose}: reply has {} problems", issues.len()));
                    for issue in &issues {
                        log.line(&format!("problem: {issue}"));
                    }
                    best = Some(value);
                    fix_request(&issues)
                }
                Err(error) => {
                    log.line(&format!("{purpose}: reply cannot be used: {error}"));
                    let request = unreadable_request(&error);
                    last_error = error;
                    request
                }
            };
            if retry == MAX_RETRIES {
                break;
            }
            log.line(&format!(
                "{purpose}: retry {} of {MAX_RETRIES}, sending the problems back into session {}",
                retry + 1,
                turn.session
            ));
            match self
                .client
                .resume(purpose, &turn.session, request, log, progress, cancel)
            {
                Ok(next) => turn = next,
                Err(ClientError::Cancelled) => return Err(AnalyzeError::Cancelled),
                Err(ClientError::Failed(error)) => {
                    log.line(&format!("{purpose}: retry failed: {error}"));
                    last_error = error;
                    break;
                }
            }
        }
        match best {
            Some(value) => {
                log.line(&format!(
                    "{purpose}: keeping the valid part; the invalid items are dropped"
                ));
                Ok(value)
            }
            None => Err(AnalyzeError::Failed(last_error)),
        }
    }
}

impl Analyzer for LlmAnalyzer {
    fn candidates(
        &self,
        job: &CandidateJob,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Vec<ChapterDraft>, AnalyzeError> {
        let chapters: Vec<Vec<String>> = job
            .chapters
            .iter()
            .map(|chapter| chapter.paragraphs.clone())
            .collect();
        self.run(
            PURPOSE_CANDIDATES,
            build_candidate_prompt(job),
            log,
            progress,
            cancel,
            &|text| {
                parse_candidates(text, &chapters).map(|reading| (reading.chapters, reading.issues))
            },
        )
    }

    fn facts(
        &self,
        job: &FactsJob,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Vec<AnalysisFact>, AnalyzeError> {
        self.run(
            PURPOSE_FACTS,
            build_facts_prompt(job),
            log,
            progress,
            cancel,
            &|text| {
                parse_facts(text, &job.entities, &job.paragraphs)
                    .map(|reading| (reading.facts, reading.issues))
            },
        )
    }
}

fn fix_request(issues: &[String]) -> String {
    let mut text = String::from("Your reply breaks the ontology rules. Fix every problem below:\n");
    for issue in issues.iter().take(MAX_LISTED) {
        text.push_str(&format!("- {issue}\n"));
    }
    if issues.len() > MAX_LISTED {
        text.push_str(&format!(
            "- and {} more problems of the same kind\n",
            issues.len() - MAX_LISTED
        ));
    }
    text.push_str(RETRY_CONTRACT);
    text
}

fn unreadable_request(error: &str) -> String {
    format!("Your reply could not be used: {error}\n{RETRY_CONTRACT}")
}

pub fn build_candidate_prompt(job: &CandidateJob) -> String {
    let mut prompt = String::from(CANDIDATE_INTRO);
    prompt.push_str(&types_section());
    prompt.push_str(CANDIDATE_RULES);
    prompt.push_str(&known_section(&job.known));
    prompt.push_str(&format!(
        "\nLanguage of the text: {}\n",
        language_name(&job.lang)
    ));
    for chapter in &job.chapters {
        prompt.push_str(&format!(
            "\n## Chapter {}: {}\n{}\n",
            chapter.seq,
            chapter.title,
            chapter.paragraphs.join("\n\n")
        ));
    }
    prompt.push_str(CANDIDATE_CONTRACT);
    prompt
}

pub fn build_facts_prompt(job: &FactsJob) -> String {
    let mut prompt = String::from(FACTS_INTRO);
    prompt.push_str(&entities_section(&job.entities));
    prompt.push_str(&predicates_section());
    prompt.push_str(FACTS_RULES);
    prompt.push_str(&format!(
        "\nChapter title: {}\nLanguage of the text: {}\n\nParagraphs:\n",
        job.title,
        language_name(&job.lang)
    ));
    for (index, paragraph) in job.paragraphs.iter().enumerate() {
        prompt.push_str(&format!("[{}] {paragraph}\n", index + 1));
    }
    prompt.push_str(FACTS_CONTRACT);
    prompt
}

fn types_section() -> String {
    let mut section = String::from("\nEntity types:\n");
    for item in &Ontology::get().types {
        section.push_str(&format!("- {}: {}", item.key, item.hint));
        if !item.properties.is_empty() {
            section.push_str(&format!(" Properties: {}.", item.properties.join(", ")));
        }
        section.push('\n');
    }
    section
}

fn predicates_section() -> String {
    let mut section = String::from("\nPredicates:\n");
    for item in Ontology::get()
        .predicates
        .iter()
        .filter(|item| item.key != PERSONA_OF)
    {
        let subject = item.domain.join(" or ");
        match item.kind {
            PredicateKind::Scalar => section.push_str(&format!(
                "- {}: scalar; subject: {subject}; {}\n",
                item.key, item.hint
            )),
            PredicateKind::Relationship => section.push_str(&format!(
                "- {}: relationship; subject: {subject}; object: {}; {}\n",
                item.key,
                item.range.join(" or "),
                item.hint
            )),
        }
    }
    section
}

fn entities_section(entities: &[AnalysisEntity]) -> String {
    let mut section = String::from(
        "\nEntities of this chapter, one per line as `- id | type | name | aliases | titles`:\n",
    );
    for entity in entities.iter().filter(|entity| entity.kind != CHARACTER) {
        section.push_str(&format!(
            "- {} | {} | {}",
            entity.id, entity.kind, entity.name
        ));
        if !entity.aliases.is_empty() {
            section.push_str(&format!(" | aliases: {}", entity.aliases.join(", ")));
        }
        if !entity.titles.is_empty() {
            section.push_str(&format!(" | titles: {}", entity.titles.join(", ")));
        }
        section.push('\n');
    }
    section
}

fn known_section(known: &[KnownEntity]) -> String {
    if known.is_empty() {
        return String::new();
    }
    let mut section = String::from(KNOWN_INTRO);
    for entity in known.iter().filter(|entity| entity.kind != CHARACTER) {
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
