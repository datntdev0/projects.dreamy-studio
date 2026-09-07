use crate::features::assistant::drafts::card::DraftBlock;
use crate::features::assistant::drafts::card::DraftMember;
use crate::features::assistant::drafts::card::MAX_BLOCKS;
use crate::features::audiobook::rules::DIALOGUE_TYPE;
use crate::features::audiobook::rules::PAUSE_TYPE;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::ScriptBlock;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::collections::HashSet;

const SCENE_TYPE: &str = "scene";
const DEFAULT_PAUSE_MS: i64 = 800;
const MAX_PAUSE_MS: i64 = 30_000;
const DEFAULT_SCENE_TIME: &str = "MORNING";
const SCENE_TIMES: [&str; 7] = [
    "DAWN",
    "MORNING",
    "NOON",
    "AFTERNOON",
    "SUNSET",
    "NIGHT",
    "CONTINUOUS",
];

pub struct Rules<'a> {
    pub allowed: &'a [String],
    pub cast: &'a [CastMember],
    pub paragraphs: Option<&'a BTreeMap<i64, usize>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dropped {
    pub index: usize,
    pub reason: String,
}

#[derive(Debug)]
pub struct Plan {
    pub blocks: Vec<DraftBlock>,
    pub members: Vec<DraftMember>,
    pub dropped: Vec<Dropped>,
    pub warnings: Vec<String>,
}

#[derive(Deserialize)]
struct RawBlock {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
    who: Option<String>,
    paren: Option<String>,
    ms: Option<i64>,
    loc: Option<String>,
    time: Option<String>,
    beat: Option<String>,
    refs: Option<Vec<String>>,
    chars: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct RawMember {
    #[serde(rename = "ref")]
    reference: String,
    name: String,
}

#[derive(Default)]
struct Tally {
    refs: usize,
    chars: usize,
    times: usize,
}

struct Shape {
    text: bool,
    who: bool,
}

pub fn parse_members(raw: &[Value], cast: &[CastMember]) -> Result<Vec<DraftMember>, String> {
    let mut members: Vec<DraftMember> = Vec::new();
    for (index, value) in raw.iter().enumerate() {
        let item: RawMember = serde_json::from_value(value.clone())
            .map_err(|error| format!("extraCast[{index}] is invalid: {error}"))?;
        let member = DraftMember {
            id: item.reference.trim().to_string(),
            name: item.name.trim().to_string(),
        };
        check_member(&member, cast, &members)?;
        members.push(member);
    }
    Ok(members)
}

pub struct Shaped {
    pub results: Vec<Result<DraftBlock, String>>,
    tally: Tally,
}

impl Shaped {
    pub fn warnings(&self, rules: &Rules) -> Vec<String> {
        let tally = &self.tally;
        let mut warnings = Vec::new();
        if tally.refs > 0 {
            warnings.push(refs_warning(tally.refs, rules.paragraphs.is_some()));
        }
        if tally.chars > 0 {
            warnings.push(format!(
                "{} character id(s) were removed because they are not in the cast",
                tally.chars
            ));
        }
        if tally.times > 0 {
            warnings.push(format!(
                "{} scene time(s) were reset to {DEFAULT_SCENE_TIME}",
                tally.times
            ));
        }
        warnings
    }
}

pub fn shape_all(raw: &[Value], rules: &Rules, members: &[DraftMember]) -> Shaped {
    let mut tally = Tally::default();
    let results = raw
        .iter()
        .map(|value| shape_block(value, rules, members, &mut tally))
        .collect();
    Shaped { results, tally }
}

pub fn build(
    raw: &[Value],
    members: &[DraftMember],
    rules: &Rules,
    current: &[ScriptBlock],
) -> Result<Plan, String> {
    if raw.is_empty() {
        return Err("argument 'blocks' must list at least one block".to_string());
    }
    if raw.len() > MAX_BLOCKS {
        return Err(format!(
            "a draft holds at most {MAX_BLOCKS} blocks, got {}",
            raw.len()
        ));
    }
    let shaped = shape_all(raw, rules, members);
    let mut warnings = shaped.warnings(rules);
    let mut blocks = Vec::new();
    let mut dropped = Vec::new();
    for (index, result) in shaped.results.into_iter().enumerate() {
        match result {
            Ok(block) => blocks.push(block),
            Err(reason) => dropped.push(Dropped { index, reason }),
        }
    }
    if blocks.is_empty() {
        return Err(nothing_left(&dropped));
    }
    reuse_ids(&mut blocks, current);
    let (members, unused) = used_members(members, &blocks);
    warnings.extend(unused.iter().map(|name| unused_warning(name)));
    Ok(Plan {
        blocks,
        members,
        dropped,
        warnings,
    })
}

fn check_member(
    member: &DraftMember,
    cast: &[CastMember],
    known: &[DraftMember],
) -> Result<(), String> {
    if member.id.is_empty() || member.name.is_empty() {
        return Err("every extraCast member needs a non-empty `ref` and `name`".to_string());
    }
    if cast.iter().any(|item| item.id == member.id) || known.iter().any(|item| item.id == member.id)
    {
        return Err(format!(
            "extraCast ref '{}' is already used; pick a ref that is not a cast id",
            member.id
        ));
    }
    let lowered = member.name.to_lowercase();
    let same_name = cast
        .iter()
        .map(|item| (item.name.as_str(), item.id.as_str()))
        .chain(
            known
                .iter()
                .map(|item| (item.name.as_str(), item.id.as_str())),
        )
        .find(|(name, _)| name.to_lowercase() == lowered);
    match same_name {
        Some((_, id)) => Err(format!(
            "'{}' already exists in the cast with id '{id}'; use that id in `who` instead of adding it",
            member.name
        )),
        None => Ok(()),
    }
}

fn shape_block(
    value: &Value,
    rules: &Rules,
    members: &[DraftMember],
    tally: &mut Tally,
) -> Result<DraftBlock, String> {
    let raw: RawBlock = serde_json::from_value(value.clone())
        .map_err(|error| format!("the block is invalid: {error}"))?;
    let kind = raw.kind.trim().to_string();
    let shape = shape_of(&kind, rules)?;
    let text = text_of(&raw, &kind, &shape)?;
    Ok(DraftBlock {
        id: None,
        who: who_of(&raw, &shape, rules, members)?,
        paren: paren_of(&raw, &kind),
        ms: ms_of(&raw, &kind),
        loc: loc_of(&raw, &kind),
        time: time_of(&raw, &kind, tally),
        beat: trimmed(&raw.beat),
        refs: refs_of(&raw, rules, tally),
        chars: chars_of(&raw, rules, members, tally),
        kept: false,
        text,
        kind,
    })
}

fn shape_of(kind: &str, rules: &Rules) -> Result<Shape, String> {
    let shape = match kind {
        "heading" | "narration" | "note" | "action" => Shape {
            text: true,
            who: false,
        },
        DIALOGUE_TYPE => Shape {
            text: true,
            who: true,
        },
        PAUSE_TYPE | SCENE_TYPE => Shape {
            text: false,
            who: false,
        },
        other => return Err(format!("unknown block type '{other}'")),
    };
    if !rules.allowed.iter().any(|allowed| allowed == kind) {
        return Err(format!(
            "block type '{kind}' is not allowed in this script; use one of: {}",
            rules.allowed.join(", ")
        ));
    }
    Ok(shape)
}

fn text_of(raw: &RawBlock, kind: &str, shape: &Shape) -> Result<String, String> {
    if !shape.text {
        return Ok(String::new());
    }
    let text = trimmed(&raw.text);
    if text.is_empty() {
        return Err(format!("a {kind} block needs text"));
    }
    Ok(text)
}

fn who_of(
    raw: &RawBlock,
    shape: &Shape,
    rules: &Rules,
    members: &[DraftMember],
) -> Result<String, String> {
    let who = trimmed(&raw.who);
    if !shape.who || who.is_empty() {
        return Ok(String::new());
    }
    if is_speaker(&who, rules, members) {
        return Ok(who);
    }
    Err(format!(
        "unknown speaker '{who}'; use an id from the cast of read_script or declare it in extraCast"
    ))
}

fn paren_of(raw: &RawBlock, kind: &str) -> String {
    if kind == DIALOGUE_TYPE {
        trimmed(&raw.paren)
    } else {
        String::new()
    }
}

fn ms_of(raw: &RawBlock, kind: &str) -> i64 {
    if kind == PAUSE_TYPE {
        raw.ms.unwrap_or(DEFAULT_PAUSE_MS).clamp(0, MAX_PAUSE_MS)
    } else {
        0
    }
}

fn loc_of(raw: &RawBlock, kind: &str) -> String {
    if kind == SCENE_TYPE {
        trimmed(&raw.loc)
    } else {
        String::new()
    }
}

fn time_of(raw: &RawBlock, kind: &str, tally: &mut Tally) -> String {
    let given = trimmed(&raw.time).to_uppercase();
    if kind != SCENE_TYPE || given.is_empty() {
        return DEFAULT_SCENE_TIME.to_string();
    }
    if SCENE_TIMES.contains(&given.as_str()) {
        return given;
    }
    tally.times += 1;
    DEFAULT_SCENE_TIME.to_string()
}

fn refs_of(raw: &RawBlock, rules: &Rules, tally: &mut Tally) -> Vec<String> {
    let given = distinct(
        raw.refs
            .iter()
            .flatten()
            .map(|text| text.trim().to_string()),
    );
    let valid: Vec<String> = given
        .iter()
        .filter(|text| is_real_ref(text, rules.paragraphs))
        .cloned()
        .collect();
    tally.refs += given.len() - valid.len();
    valid
}

fn chars_of(
    raw: &RawBlock,
    rules: &Rules,
    members: &[DraftMember],
    tally: &mut Tally,
) -> Vec<String> {
    let given = distinct(
        raw.chars
            .iter()
            .flatten()
            .map(|text| text.trim().to_string()),
    );
    let valid: Vec<String> = given
        .iter()
        .filter(|id| is_speaker(id, rules, members))
        .cloned()
        .collect();
    tally.chars += given.len() - valid.len();
    valid
}

fn is_speaker(id: &str, rules: &Rules, members: &[DraftMember]) -> bool {
    rules.cast.iter().any(|member| member.id == id) || members.iter().any(|member| member.id == id)
}

fn is_real_ref(text: &str, paragraphs: Option<&BTreeMap<i64, usize>>) -> bool {
    let Some((chapter, p)) = parse_ref(text) else {
        return false;
    };
    paragraphs
        .and_then(|counts| counts.get(&chapter))
        .is_some_and(|count| (1..=*count).contains(&p))
}

fn parse_ref(text: &str) -> Option<(i64, usize)> {
    let (chapter, p) = text.split_once('.')?;
    Some((chapter.parse().ok()?, p.parse().ok()?))
}

pub fn ref_chapters(raw: &[Value]) -> BTreeSet<i64> {
    raw.iter()
        .filter_map(|value| value.get("refs")?.as_array())
        .flatten()
        .filter_map(Value::as_str)
        .filter_map(|text| parse_ref(text.trim()))
        .map(|(chapter, _)| chapter)
        .collect()
}

fn distinct(items: impl Iterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    items
        .filter(|item| !item.is_empty() && seen.insert(item.clone()))
        .collect()
}

fn trimmed(value: &Option<String>) -> String {
    value.as_deref().unwrap_or_default().trim().to_string()
}

fn reuse_ids(blocks: &mut [DraftBlock], current: &[ScriptBlock]) {
    let mut used: HashSet<&str> = HashSet::new();
    for block in blocks {
        let same = current
            .iter()
            .find(|old| !used.contains(old.id.as_str()) && is_same_block(old, block));
        if let Some(old) = same {
            used.insert(old.id.as_str());
            block.id = Some(old.id.clone());
            block.kept = true;
        }
    }
}

fn is_same_block(old: &ScriptBlock, new: &DraftBlock) -> bool {
    old.kind == new.kind
        && old.text == new.text
        && old.who == new.who
        && old.paren == new.paren
        && (new.kind != PAUSE_TYPE || old.ms == new.ms)
        && (new.kind != SCENE_TYPE || (old.loc == new.loc && old.time == new.time))
}

fn used_members(members: &[DraftMember], blocks: &[DraftBlock]) -> (Vec<DraftMember>, Vec<String>) {
    let mut used = Vec::new();
    let mut unused = Vec::new();
    for member in members {
        if blocks.iter().any(|block| mentions(block, &member.id)) {
            used.push(member.clone());
        } else {
            unused.push(member.name.clone());
        }
    }
    (used, unused)
}

fn mentions(block: &DraftBlock, id: &str) -> bool {
    block.who == id || block.chars.iter().any(|item| item == id)
}

fn unused_warning(name: &str) -> String {
    format!("the extraCast member '{name}' speaks in no block and was left out")
}

fn refs_warning(count: usize, has_source: bool) -> String {
    if has_source {
        format!("{count} source reference(s) were removed because they point to no paragraph")
    } else {
        format!(
            "{count} source reference(s) were removed because the project has no linked novel text"
        )
    }
}

fn nothing_left(dropped: &[Dropped]) -> String {
    let reasons: Vec<String> = dropped
        .iter()
        .take(10)
        .map(|item| format!("block {}: {}", item.index, item.reason))
        .collect();
    format!("no valid block is left. Dropped: {}", reasons.join("; "))
}

#[cfg(test)]
#[path = "../../../../test/features/assistant/drafts/plan.test.rs"]
mod tests;
