use crate::features::assistant::drafts::DraftBlock;
use crate::features::assistant::drafts::MAX_BLOCKS;
use crate::features::assistant::drafts::Rules;
use crate::features::assistant::drafts::fresh_block_id;
use crate::features::assistant::drafts::shape_all;
use crate::features::scripting::models::ScriptBlock;
use serde::Deserialize;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::collections::HashSet;

pub const MAX_OPS: usize = 200;
const SCENE_TYPE: &str = "scene";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetOp {
    id: String,
    expected: String,
    #[serde(rename = "type")]
    kind: Option<String>,
    text: Option<String>,
    who: Option<String>,
    paren: Option<String>,
    ms: Option<i64>,
    loc: Option<String>,
    time: Option<String>,
    beat: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsertOp {
    after: Option<String>,
    #[serde(rename = "ref")]
    reference: Option<String>,
    block: Value,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteOp {
    id: String,
    expected: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveOp {
    id: String,
    after: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "k", rename_all = "snake_case")]
pub enum Op {
    Set(SetOp),
    Insert(InsertOp),
    Delete(DeleteOp),
    Move(MoveOp),
}

pub struct Edited {
    pub blocks: Vec<ScriptBlock>,
    pub seq: i64,
    pub remap: BTreeMap<String, String>,
    pub warnings: Vec<String>,
}

struct Editor<'a> {
    rules: &'a Rules<'a>,
    blocks: Vec<ScriptBlock>,
    taken: HashSet<String>,
    seq: i64,
    remap: BTreeMap<String, String>,
    warnings: Vec<String>,
}

pub fn parse(raw: &[Value]) -> Result<Vec<Op>, String> {
    if raw.is_empty() {
        return Err("argument 'ops' must list at least one operation".to_string());
    }
    if raw.len() > MAX_OPS {
        return Err(format!(
            "at most {MAX_OPS} operations per call, got {}",
            raw.len()
        ));
    }
    raw.iter()
        .enumerate()
        .map(|(index, value)| {
            parse_op(value).map_err(|reason| format!("ops[{index}] is invalid: {reason}"))
        })
        .collect()
}

fn parse_op(value: &Value) -> Result<Op, String> {
    let op: Op = serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;
    let needs_after = matches!(op, Op::Insert(_) | Op::Move(_));
    if needs_after && value.get("after").is_none() {
        return Err("`after` is required: a block id, or null to put the block first".to_string());
    }
    Ok(op)
}

pub fn inserted_blocks(ops: &[Op]) -> Vec<Value> {
    ops.iter()
        .filter_map(|op| match op {
            Op::Insert(insert) => Some(insert.block.clone()),
            _ => None,
        })
        .collect()
}

pub fn run(
    ops: &[Op],
    blocks: Vec<ScriptBlock>,
    seq: i64,
    rules: &Rules,
) -> Result<Edited, String> {
    let mut editor = Editor {
        rules,
        taken: blocks.iter().map(|block| block.id.clone()).collect(),
        blocks,
        seq,
        remap: BTreeMap::new(),
        warnings: Vec::new(),
    };
    for (index, op) in ops.iter().enumerate() {
        editor
            .step(op)
            .map_err(|reason| format!("ops[{index}]: {reason}; nothing was written"))?;
    }
    editor.finish()
}

impl Editor<'_> {
    fn step(&mut self, op: &Op) -> Result<(), String> {
        match op {
            Op::Set(patch) => self.set(patch),
            Op::Insert(insert) => self.insert(insert),
            Op::Delete(delete) => self.delete(delete),
            Op::Move(relocation) => self.relocate(relocation),
        }
    }

    fn finish(self) -> Result<Edited, String> {
        if self.blocks.len() > MAX_BLOCKS {
            return Err(format!(
                "a unit holds at most {MAX_BLOCKS} blocks, the edit would leave {}",
                self.blocks.len()
            ));
        }
        Ok(Edited {
            blocks: self.blocks,
            seq: self.seq,
            remap: self.remap,
            warnings: self.warnings,
        })
    }

    fn set(&mut self, patch: &SetOp) -> Result<(), String> {
        let index = self.index_of(&patch.id)?;
        let current = self.blocks[index].clone();
        check_expected(&current, index, &patch.expected)?;
        let shaped = self.shape(merged(&current, patch))?;
        let mut block = shaped.to_script(current.id.clone());
        block.reference = current.reference;
        block.refs = current.refs;
        block.chars = current.chars;
        if block.kind != SCENE_TYPE {
            block.time = current.time;
        }
        self.blocks[index] = block;
        Ok(())
    }

    fn insert(&mut self, insert: &InsertOp) -> Result<(), String> {
        let at = self.insertion_point(insert.after.as_deref())?;
        let reference = self.check_reference(insert.reference.as_deref())?;
        let shaped = self.shape(insert.block.clone())?;
        let id = fresh_block_id(&mut self.taken, &mut self.seq);
        if let Some(reference) = reference {
            self.remap.insert(reference, id.clone());
        }
        self.blocks.insert(at, shaped.to_script(id));
        Ok(())
    }

    fn delete(&mut self, delete: &DeleteOp) -> Result<(), String> {
        let index = self.index_of(&delete.id)?;
        check_expected(&self.blocks[index], index, &delete.expected)?;
        let removed = self.blocks.remove(index);
        self.remap.retain(|_, mapped| *mapped != removed.id);
        Ok(())
    }

    fn relocate(&mut self, relocation: &MoveOp) -> Result<(), String> {
        let index = self.index_of(&relocation.id)?;
        let target = self.blocks[index].id.clone();
        let after = relocation.after.as_deref();
        if after.is_some_and(|key| key == target || self.remap.get(key) == Some(&target)) {
            return Err(format!("block {target} cannot be moved after itself"));
        }
        let block = self.blocks.remove(index);
        match self.insertion_point(after) {
            Ok(at) => {
                self.blocks.insert(at, block);
                Ok(())
            }
            Err(reason) => {
                self.blocks.insert(index, block);
                Err(reason)
            }
        }
    }

    fn index_of(&self, key: &str) -> Result<usize, String> {
        let by_id = self.blocks.iter().position(|block| block.id == key);
        let mapped = self.remap.get(key);
        by_id
            .or_else(|| mapped.and_then(|id| self.blocks.iter().position(|b| &b.id == id)))
            .ok_or_else(|| format!("block '{key}' not found in the unit"))
    }

    fn insertion_point(&self, after: Option<&str>) -> Result<usize, String> {
        match after {
            None => Ok(0),
            Some(key) => self.index_of(key).map(|index| index + 1),
        }
    }

    fn check_reference(&self, reference: Option<&str>) -> Result<Option<String>, String> {
        let Some(reference) = reference.map(str::trim) else {
            return Ok(None);
        };
        if reference.is_empty() {
            return Err("`ref` must not be empty".to_string());
        }
        if self.remap.contains_key(reference) || self.taken.contains(reference) {
            return Err(format!(
                "`ref` '{reference}' is already used by a block; pick another"
            ));
        }
        Ok(Some(reference.to_string()))
    }

    fn shape(&mut self, raw: Value) -> Result<DraftBlock, String> {
        let shaped = shape_all(std::slice::from_ref(&raw), self.rules, &[]);
        for warning in shaped.warnings(self.rules) {
            if !self.warnings.contains(&warning) {
                self.warnings.push(warning);
            }
        }
        shaped
            .results
            .into_iter()
            .next()
            .unwrap_or_else(|| Err("the block is missing".to_string()))
    }
}

fn check_expected(block: &ScriptBlock, index: usize, expected: &str) -> Result<(), String> {
    if block.text == expected {
        return Ok(());
    }
    Err(format!(
        "block {} (p {}) does not match `expected`. Read the unit again and retry. Current text: {}",
        block.id,
        index + 1,
        block.text
    ))
}

fn merged(current: &ScriptBlock, patch: &SetOp) -> Value {
    json!({
        "type": patch.kind.as_deref().unwrap_or(&current.kind),
        "text": patch.text.as_deref().unwrap_or(&current.text),
        "who": patch.who.as_deref().unwrap_or(&current.who),
        "paren": patch.paren.as_deref().unwrap_or(&current.paren),
        "ms": patch.ms.unwrap_or(current.ms),
        "loc": patch.loc.as_deref().unwrap_or(&current.loc),
        "time": patch.time.as_deref().unwrap_or(&current.time),
        "beat": patch.beat.as_deref().unwrap_or(&current.beat),
    })
}
