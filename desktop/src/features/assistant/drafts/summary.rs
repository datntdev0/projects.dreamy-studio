use crate::features::assistant::drafts::card::DraftBlock;
use crate::features::assistant::drafts::card::DraftMember;
use crate::features::assistant::drafts::card::DraftStats;
use crate::features::assistant::drafts::card::Speaker;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::rules::DIALOGUE_TYPE;
use crate::features::audiobook::rules::is_current;
use crate::features::audiobook::rules::is_voiced;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::ScriptBlock;

const NARRATION_TYPE: &str = "narration";

pub fn stats_of(blocks: &[DraftBlock], stale_audio: usize) -> DraftStats {
    DraftStats {
        blocks: blocks.len(),
        voiced: blocks
            .iter()
            .filter(|block| is_voiced(&block.to_script(String::new())))
            .count(),
        words: blocks
            .iter()
            .map(|block| block.text.split_whitespace().count())
            .sum(),
        narration: count_kind(blocks, NARRATION_TYPE),
        dialogue: count_kind(blocks, DIALOGUE_TYPE),
        kept: blocks.iter().filter(|block| block.kept).count(),
        stale_audio,
    }
}

pub fn speakers_of(
    blocks: &[DraftBlock],
    cast: &[CastMember],
    members: &[DraftMember],
) -> Vec<Speaker> {
    let mut speakers: Vec<Speaker> = Vec::new();
    for block in blocks.iter().filter(|block| speaks(block)) {
        match speakers.iter_mut().find(|speaker| speaker.id == block.who) {
            Some(speaker) => speaker.blocks += 1,
            None => speakers.push(Speaker {
                id: block.who.clone(),
                name: name_of(&block.who, cast, members),
                blocks: 1,
            }),
        }
    }
    speakers
}

pub fn unresolved_of(blocks: &[DraftBlock]) -> usize {
    blocks
        .iter()
        .filter(|block| block.kind == DIALOGUE_TYPE && block.who.is_empty())
        .count()
}

pub fn stale_audio(book: Option<&Audiobook>, unit_id: &str, blocks: &[DraftBlock]) -> usize {
    let kept: Vec<ScriptBlock> = blocks
        .iter()
        .filter_map(|block| block.id.clone().map(|id| block.to_script(id)))
        .collect();
    outdated_audio(book, unit_id, &kept)
}

pub fn outdated_audio(book: Option<&Audiobook>, unit_id: &str, blocks: &[ScriptBlock]) -> usize {
    let Some(book) = book else {
        return 0;
    };
    let Some(unit) = book.unit(unit_id) else {
        return 0;
    };
    unit.audio
        .iter()
        .filter(|(block_id, record)| {
            !blocks
                .iter()
                .any(|block| block.id == **block_id && is_current(book, block, record))
        })
        .count()
}

fn speaks(block: &DraftBlock) -> bool {
    block.kind == DIALOGUE_TYPE && !block.who.is_empty()
}

fn count_kind(blocks: &[DraftBlock], kind: &str) -> usize {
    blocks.iter().filter(|block| block.kind == kind).count()
}

fn name_of(id: &str, cast: &[CastMember], members: &[DraftMember]) -> String {
    cast.iter()
        .map(|member| (member.id.as_str(), member.name.as_str()))
        .chain(
            members
                .iter()
                .map(|member| (member.id.as_str(), member.name.as_str())),
        )
        .find(|(known, _)| *known == id)
        .map_or_else(|| id.to_string(), |(_, name)| name.to_string())
}
