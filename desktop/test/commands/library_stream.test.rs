use super::*;
use crate::testing::app::MockHost;
use crate::testing::audio::wav_bytes;
use serde_json::json;

#[test]
fn parses_open_ended_ranges() {
    assert_eq!(parse_range("bytes=0-", 100), Some((0, 99)));
}

#[test]
fn parses_bounded_ranges() {
    assert_eq!(parse_range("bytes=20-40", 100), Some((20, 40)));
    assert_eq!(parse_range("bytes=20-200", 100), Some((20, 99)));
}

#[test]
fn parses_suffix_ranges() {
    assert_eq!(parse_range("bytes=-20", 100), Some((80, 99)));
    assert_eq!(parse_range("bytes=-200", 100), Some((0, 99)));
}

#[test]
fn rejects_ranges_past_the_end() {
    assert_eq!(parse_range("bytes=100-", 100), None);
    assert_eq!(
        range_not_satisfiable(100).status(),
        StatusCode::RANGE_NOT_SATISFIABLE
    );
}

fn request(path: &str, range: Option<&str>) -> Request<Vec<u8>> {
    let mut builder = Request::builder().uri(format!("dreamy-sound://localhost{path}"));
    if let Some(range) = range {
        builder = builder.header(RANGE, range);
    }
    builder.body(Vec::new()).unwrap()
}

fn uploaded_sound(host: &MockHost) -> i64 {
    let path = host.dir.path().join("tone.wav");
    std::fs::write(&path, wav_bytes()).unwrap();
    let input = json!({ "collectionId": null, "tags": [], "rights": "own" });
    let sound = host
        .invoke(
            "library_sound_upload",
            json!({ "path": path.to_str().unwrap(), "input": input }),
        )
        .unwrap();
    sound["id"].as_i64().unwrap()
}

#[test]
fn options_requests_are_answered_without_a_workspace() {
    let host = MockHost::new();
    let preflight = Request::builder()
        .method("OPTIONS")
        .uri("dreamy-sound://localhost/1")
        .body(Vec::new())
        .unwrap();

    let response = respond(&host.handle(), preflight, StreamKind::Sound);

    assert!(response.status().is_success());
}

#[test]
fn unusable_stream_requests_are_not_found() {
    let host = MockHost::new();

    let without_workspace = respond(&host.handle(), request("/1", None), StreamKind::Sound);
    host.open_workspace();
    let bad_path = respond(&host.handle(), request("/abc", None), StreamKind::Sound);
    let unknown = respond(&host.handle(), request("/99", None), StreamKind::Sound);

    assert_eq!(without_workspace.status(), StatusCode::NOT_FOUND);
    assert_eq!(bad_path.status(), StatusCode::NOT_FOUND);
    assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
}

#[test]
fn a_sound_is_streamed_whole_or_by_range() {
    let host = MockHost::new();
    host.open_workspace();
    let id = uploaded_sound(&host);
    let path = format!("/{id}");

    let whole = respond(&host.handle(), request(&path, None), StreamKind::Sound);
    let part = respond(
        &host.handle(),
        request(&path, Some("bytes=0-9")),
        StreamKind::Sound,
    );
    let past_the_end = respond(
        &host.handle(),
        request(&path, Some("bytes=99999999-")),
        StreamKind::Sound,
    );

    assert_eq!(whole.status(), StatusCode::OK);
    assert!(whole.body().len() > 10);
    assert_eq!(part.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(part.body().len(), 10);
    assert!(part.headers().contains_key("Content-Range"));
    assert_eq!(past_the_end.status(), StatusCode::RANGE_NOT_SATISFIABLE);
}

#[test]
fn sounds_are_listed_updated_and_deleted_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let id = uploaded_sound(&host);

    let listed = host.invoke("library_sound_list", json!({})).unwrap();
    let renamed = host
        .invoke(
            "library_sound_update",
            json!({ "id": id, "patch": { "name": "Tone" } }),
        )
        .unwrap();
    let peaks = host
        .invoke("library_sound_peaks", json!({ "id": id }))
        .unwrap();
    let deleted = host
        .invoke("library_sound_delete", json!({ "ids": [id] }))
        .unwrap();

    assert_eq!(listed.as_array().unwrap().len(), 1);
    assert_eq!(renamed["name"], "Tone");
    assert!(peaks.is_string());
    assert_eq!(deleted, 1);
}
