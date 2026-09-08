use super::*;
use crate::features::pipeline::models::JobOwner;
use crate::features::pipeline::models::PipelineStatus;
use crate::testing::assistant::FakePipelines;
use crate::testing::assistant::ToolWorld;
use crate::testing::assistant::pipeline_run;
use serde_json::json;

fn world() -> ToolWorld {
    let mut world = ToolWorld::new();
    world.pipelines = FakePipelines::with_runs(vec![
        pipeline_run(
            1,
            JobOwner::Novel(1),
            "translation",
            PipelineStatus::Completed,
        ),
        pipeline_run(2, JobOwner::Project(5), "audio", PipelineStatus::Running),
        pipeline_run(3, JobOwner::Novel(1), "analysis", PipelineStatus::Queued),
        pipeline_run(4, JobOwner::Project(6), "audio", PipelineStatus::Running),
        pipeline_run(
            5,
            JobOwner::Novel(2),
            "translation",
            PipelineStatus::Running,
        ),
    ]);
    world
}

fn run(
    world: &ToolWorld,
    name: &str,
    args: Value,
    scope: &AssistantScope,
) -> Result<Value, String> {
    world.run(name, args, scope).0
}

fn listed(runs: &Value) -> Vec<i64> {
    runs.as_array()
        .unwrap()
        .iter()
        .map(|item| item["pipelineId"].as_i64().unwrap())
        .collect()
}

#[test]
fn a_workspace_lists_every_run_newest_first() {
    let runs = run(
        &world(),
        "list_pipeline",
        json!({}),
        &AssistantScope::workspace(),
    )
    .unwrap();

    assert_eq!(listed(&runs), [5, 4, 3, 2, 1]);
    assert_eq!(runs[0]["kind"], "translation");
    assert_eq!(runs[0]["status"], "running");
    assert_eq!(runs[0]["novelId"], 2);
    assert_eq!(runs[0]["projectId"], Value::Null);
    assert_eq!(runs[0]["total"], 2);
    assert_eq!(runs[0]["done"], 1);
    assert!(runs[0].get("tasks").is_none());
}

#[test]
fn the_limit_is_clamped_to_a_sane_range() {
    let world = world();
    let scope = AssistantScope::workspace();

    let two = run(&world, "list_pipeline", json!({ "limit": 2 }), &scope).unwrap();
    assert_eq!(listed(&two), [5, 4]);

    let floor = run(&world, "list_pipeline", json!({ "limit": 0 }), &scope).unwrap();
    assert_eq!(listed(&floor), [5]);
}

#[test]
fn a_novel_scope_lists_only_the_runs_of_its_novel() {
    let runs = run(
        &world(),
        "list_pipeline",
        json!({}),
        &AssistantScope::novel(1),
    )
    .unwrap();

    assert_eq!(listed(&runs), [3, 1]);
}

#[test]
fn a_project_scope_lists_its_project_and_its_linked_novel() {
    let world = world();

    let runs = run(
        &world,
        "list_pipeline",
        json!({}),
        &AssistantScope::project(5),
    )
    .unwrap();
    assert_eq!(listed(&runs), [3, 2, 1]);

    let limited = run(
        &world,
        "list_pipeline",
        json!({ "limit": 2 }),
        &AssistantScope::project(5),
    )
    .unwrap();
    assert_eq!(listed(&limited), [3, 2]);
}

#[test]
fn a_project_without_a_linked_novel_lists_only_its_own_runs() {
    let mut world = world();
    world.linked_novel = None;

    let runs = run(
        &world,
        "list_pipeline",
        json!({}),
        &AssistantScope::project(6),
    )
    .unwrap();

    assert_eq!(listed(&runs), [4]);
}

#[test]
fn list_pipeline_filters_by_owner_inside_the_scope() {
    let world = world();
    let workspace = AssistantScope::workspace();

    let novel = run(&world, "list_pipeline", json!({ "novelId": 1 }), &workspace).unwrap();
    assert_eq!(listed(&novel), [3, 1]);

    let project = run(
        &world,
        "list_pipeline",
        json!({ "projectId": 5 }),
        &workspace,
    )
    .unwrap();
    assert_eq!(listed(&project), [2]);

    let own = run(
        &world,
        "list_pipeline",
        json!({ "projectId": 5 }),
        &AssistantScope::project(5),
    )
    .unwrap();
    assert_eq!(listed(&own), [2]);
}

#[test]
fn list_pipeline_rejects_owners_outside_the_scope() {
    let world = world();
    let cases = [
        (json!({ "novelId": 1 }), AssistantScope::novel(2)),
        (json!({ "projectId": 5 }), AssistantScope::novel(1)),
        (json!({ "projectId": 6 }), AssistantScope::project(5)),
        (json!({ "novelId": 2 }), AssistantScope::project(5)),
    ];
    for (args, scope) in cases {
        let error = run(&world, "list_pipeline", args, &scope).unwrap_err();
        assert!(error.contains("outside the current scope"), "{error}");
    }
    let both = run(
        &world,
        "list_pipeline",
        json!({ "novelId": 1, "projectId": 5 }),
        &AssistantScope::workspace(),
    )
    .unwrap_err();
    assert!(both.contains("not both"));
}

#[test]
fn read_pipeline_returns_the_status_of_every_task() {
    let run = run(
        &world(),
        "read_pipeline",
        json!({ "pipelineId": 2 }),
        &AssistantScope::project(5),
    )
    .unwrap();

    assert_eq!(run["pipelineId"], 2);
    assert_eq!(run["status"], "running");
    assert_eq!(run["projectId"], 5);
    assert_eq!(
        run["tasks"],
        json!([{
            "taskId": 20,
            "chapterId": "chapter-1-1",
            "segmentId": null,
            "passage": null,
            "status": "running",
            "progress": 40,
            "error": "",
            "startedAt": null,
            "finishedAt": null
        }])
    );
}

#[test]
fn read_pipeline_refuses_runs_outside_the_scope() {
    let world = world();

    let foreign = run(
        &world,
        "read_pipeline",
        json!({ "pipelineId": 5 }),
        &AssistantScope::novel(1),
    )
    .unwrap_err();
    assert!(foreign.contains("run 5 is outside the current scope"));

    let linked = run(
        &world,
        "read_pipeline",
        json!({ "pipelineId": 1 }),
        &AssistantScope::project(5),
    );
    assert!(linked.is_ok());

    let missing = run(
        &world,
        "read_pipeline",
        json!({ "pipelineId": 99 }),
        &AssistantScope::workspace(),
    )
    .unwrap_err();
    assert!(missing.contains("run 99 not found"));
}

#[test]
fn cancel_pipeline_stops_an_active_run_in_scope() {
    let world = world();

    let queued = run(
        &world,
        "cancel_pipeline",
        json!({ "pipelineId": 3 }),
        &AssistantScope::novel(1),
    )
    .unwrap();
    assert_eq!(queued, json!({ "pipelineId": 3, "cancelled": true }));

    let running = run(
        &world,
        "cancel_pipeline",
        json!({ "pipelineId": 2 }),
        &AssistantScope::project(5),
    )
    .unwrap();
    assert_eq!(running["cancelled"], true);
    assert_eq!(world.pipelines.cancelled(), [3, 2]);
}

#[test]
fn cancel_pipeline_leaves_finished_runs_alone() {
    let world = world();

    let finished = run(
        &world,
        "cancel_pipeline",
        json!({ "pipelineId": 1 }),
        &AssistantScope::workspace(),
    )
    .unwrap();

    assert_eq!(finished["cancelled"], false);
    assert!(world.pipelines.cancelled().is_empty());
}

#[test]
fn cancel_pipeline_refuses_runs_outside_the_scope() {
    let world = world();
    let cases = [
        (5, AssistantScope::novel(1)),
        (4, AssistantScope::project(5)),
        (2, AssistantScope::novel(1)),
    ];
    for (pipeline_id, scope) in cases {
        let error = run(
            &world,
            "cancel_pipeline",
            json!({ "pipelineId": pipeline_id }),
            &scope,
        )
        .unwrap_err();
        assert!(error.contains("outside the current scope"), "{error}");
    }
    assert!(world.pipelines.cancelled().is_empty());
}

#[test]
fn the_pipeline_tools_are_listed_in_every_scope_and_synthesis_only_outside_a_novel() {
    for (scope, synthesis) in [
        (AssistantScope::novel(1), false),
        (AssistantScope::workspace(), true),
        (AssistantScope::project(5), true),
    ] {
        let tools = definitions(&scope);
        let list = tools.as_array().unwrap();
        let names: Vec<&str> = list
            .iter()
            .map(|tool| tool["name"].as_str().unwrap())
            .collect();
        for tool in ["start_run", "read_pipeline", "cancel_pipeline"] {
            assert!(names.contains(&tool), "{tool}");
        }
        let start = list
            .iter()
            .find(|tool| tool["name"] == "start_run")
            .unwrap();
        let kinds = &start["inputSchema"]["properties"]["kind"]["enum"];
        assert_eq!(
            kinds.as_array().unwrap().contains(&json!("synthesis")),
            synthesis
        );
        let properties = start["inputSchema"]["properties"].as_object().unwrap();
        for key in ["projectId", "units", "mode"] {
            assert_eq!(properties.contains_key(key), synthesis, "{key}");
        }
    }
}

#[test]
fn a_novel_scope_refuses_a_synthesis_run() {
    let world = world();

    let error = run(
        &world,
        "start_run",
        json!({ "kind": "synthesis", "projectId": 5, "units": ["c1"] }),
        &AssistantScope::novel(1),
    )
    .unwrap_err();

    assert!(error.contains("not available in this scope"));
}

#[test]
fn read_pipeline_lists_the_runs_without_a_pipeline_id_and_reads_one_with_it() {
    let world = world();
    let scope = AssistantScope::workspace();

    let runs = run(&world, "read_pipeline", json!({}), &scope).unwrap();
    let one = run(&world, "read_pipeline", json!({ "pipelineId": 2 }), &scope).unwrap();

    assert_eq!(listed(&runs), [5, 4, 3, 2, 1]);
    assert_eq!(one["pipelineId"], 2);
    assert!(one.get("tasks").is_some());
}
