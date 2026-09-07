use crate::features::assistant::cards;
use crate::features::assistant::grants::TurnSink;
use crate::features::assistant::models::AssistantResult;
use crate::features::assistant::models::Decision;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::output;
use serde::Serialize;
use serde_json::Value;
use serde_json::json;

pub const RUN_KIND: &str = "pipeline_run";
const CARD_PREFIX: &str = "pr";
const WAITING_NOTE: &str = "waiting for the user to confirm on the card";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunJob {
    Translation,
    Analysis,
    Synthesis,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOwner {
    pub novel_id: Option<i64>,
    pub project_id: Option<i64>,
}

impl RunOwner {
    pub fn novel(novel_id: i64) -> Self {
        Self {
            novel_id: Some(novel_id),
            project_id: None,
        }
    }

    pub fn project(project_id: i64) -> Self {
        Self {
            novel_id: None,
            project_id: Some(project_id),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunItem {
    pub id: String,
    pub seq: Option<i64>,
    pub title: String,
    pub tasks: usize,
    pub note: Option<String>,
    pub block_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSkip {
    pub id: String,
    pub seq: Option<i64>,
    pub title: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPlan {
    pub job: RunJob,
    pub owner: RunOwner,
    pub title: String,
    pub target: Option<String>,
    pub mode: Option<String>,
    pub overwrite: bool,
    pub items: Vec<RunItem>,
    pub skipped: Vec<RunSkip>,
    pub warnings: Vec<String>,
}

impl RunPlan {
    pub fn total_tasks(&self) -> usize {
        self.items.iter().map(|item| item.tasks).sum()
    }

    pub fn require_work(&self) -> Result<(), String> {
        if !self.items.is_empty() {
            return Ok(());
        }
        let reasons: Vec<String> = self
            .skipped
            .iter()
            .map(|skip| format!("{}: {}", skip.title, skip.reason))
            .collect();
        Err(format!(
            "nothing is left to run. Skipped: {}",
            reasons.join("; ")
        ))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunCard<'a> {
    kind: &'static str,
    id: &'a str,
    #[serde(flatten)]
    plan: &'a RunPlan,
    total_tasks: usize,
    status: &'static str,
    pipeline_id: Option<i64>,
}

pub fn submit(plan: &RunPlan, call: &str, sink: &dyn TurnSink) -> Result<ToolOutput, String> {
    let id = format!("{CARD_PREFIX}{}", sink.attached(RUN_KIND) + 1);
    let card = RunCard {
        kind: RUN_KIND,
        id: &id,
        plan,
        total_tasks: plan.total_tasks(),
        status: cards::PENDING,
        pipeline_id: None,
    };
    sink.attach(serde_json::to_value(&card).map_err(|error| error.to_string())?);
    let value = json!({
        "cardId": id,
        "job": plan.job,
        "totalTasks": plan.total_tasks(),
        "items": plan.items,
        "skipped": plan.skipped,
        "warnings": plan.warnings,
        "status": cards::PENDING,
        "note": WAITING_NOTE,
    });
    let label = format!("{call} → {} tác vụ, chờ xác nhận", plan.total_tasks());
    Ok(output(value, label))
}

pub fn resolve(
    attachments: &mut [Value],
    item_ids: &[String],
    status: Decision,
    pipeline_id: Option<i64>,
) -> AssistantResult<()> {
    let picked = cards::picked(attachments, RUN_KIND, item_ids);
    for index in &picked {
        cards::require_pending(&attachments[*index])?;
    }
    for index in picked {
        let attachment = &mut attachments[index];
        attachment["status"] = json!(status.as_str());
        if status == Decision::Applied {
            attachment["pipelineId"] = json!(pipeline_id);
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "../../../test/features/assistant/runs.test.rs"]
mod tests;
