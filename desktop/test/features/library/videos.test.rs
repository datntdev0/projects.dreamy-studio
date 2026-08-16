use super::*;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use crate::testing::video::write_sample_clip;
use std::fs;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

fn test_connection() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    Migrator::migrate(
        &mut conn,
        &workspace_scripts().unwrap(),
        &AtomicBool::new(false),
    )
    .unwrap();
    conn
}

fn new_video(name: &str) -> NewVideo {
    NewVideo {
        name: name.to_string(),
        ext: "mp4".to_string(),
        size: 12,
        duration_ms: 2_000,
        width: 1_920,
        height: 1_080,
        fps: None,
        rights: AssetRights::Own,
        collection_id: None,
        tags: vec!["Example".to_string()],
    }
}

#[test]
fn stages_commits_discards_and_reads_video_files() {
    let directory = TempDir::new().unwrap();
    let source = directory.path().join("source.mp4");
    let bytes = b"video data";
    fs::write(&source, bytes).unwrap();
    let files = VideoFiles::new(directory.path().to_path_buf());
    let staged = files.stage(&source).unwrap();
    assert!(staged.exists());
    files.commit(&staged, 7, VideoFormat::Mp4).unwrap();
    assert!(!staged.exists());
    assert_eq!(files.len(7, VideoFormat::Mp4).unwrap(), bytes.len() as u64);
    assert_eq!(
        files.read_range(7, VideoFormat::Mp4, 2, 5).unwrap(),
        bytes[2..7]
    );
    files.discard(&staged).unwrap();
    files.discard(&staged).unwrap();
}

#[test]
fn stores_and_removes_posters_and_videos() {
    let directory = TempDir::new().unwrap();
    let source = directory.path().join("source.mp4");
    fs::write(&source, b"video").unwrap();
    let files = VideoFiles::new(directory.path().to_path_buf());
    let staged = files.stage(&source).unwrap();
    files.commit(&staged, 4, VideoFormat::Mp4).unwrap();
    assert_eq!(files.read_poster(4).unwrap(), None);
    assert_eq!(
        files.write_poster(4, b"not-jpeg").unwrap_err().code,
        LibraryErrorCode::VideoUnreadable
    );
    let oversized = vec![0xff; POSTER_MAX_BYTES + 1];
    assert_eq!(
        files.write_poster(4, &oversized).unwrap_err().code,
        LibraryErrorCode::VideoUnreadable
    );
    let poster = vec![0xff, 0xd8, 0xff, 0xdb];
    files.write_poster(4, &poster).unwrap();
    assert_eq!(files.read_poster(4).unwrap(), Some(poster));
    files.remove(4, VideoFormat::Mp4).unwrap();
    files.remove(4, VideoFormat::Mp4).unwrap();
    assert_eq!(files.read_poster(4).unwrap(), None);
}

#[test]
fn stores_updates_marks_and_deletes_videos() {
    let conn = test_connection();
    let id = insert(&conn, &new_video("clip.mp4"), "2026-01-01T00:00:00Z").unwrap();
    let duplicate = unique_name(&conn, "CLIP.mp4", None).unwrap();
    let patch = AssetPatch {
        name: Some("renamed.mp4".to_string()),
        rights: Some(AssetRights::Licensed),
        collection_id: None,
        tags: Some((0..12).map(|index| format!("tag-{index}")).collect()),
    };
    let videos = list(&conn).unwrap();
    assert_eq!(videos[0].tags, vec!["example"]);
    assert_eq!(videos[0].fps, None);
    assert_eq!(duplicate, "CLIP (2).mp4");
    let tag_limit = AssetPatch {
        tags: Some((0..13).map(|index| format!("too-many-{index}")).collect()),
        ..AssetPatch::default()
    };
    assert_eq!(
        update(&conn, id, &tag_limit, "2026-01-02T00:00:00Z")
            .unwrap_err()
            .code,
        LibraryErrorCode::TagLimit
    );
    let updated = update(&conn, id, &patch, "2026-01-02T00:00:00Z").unwrap();
    assert_eq!(updated.name, "renamed.mp4");
    assert_eq!(updated.rights, AssetRights::Licensed);
    assert_eq!(updated.tags.len(), 12);
    let missing_collection = AssetPatch {
        collection_id: Some(Some(99)),
        ..AssetPatch::default()
    };
    assert_eq!(
        update(&conn, id, &missing_collection, "2026-01-02T00:00:00Z")
            .unwrap_err()
            .code,
        LibraryErrorCode::CollectionNotFound
    );
    mark_poster(&conn, id).unwrap();
    assert!(get(&conn, id).unwrap().has_poster);
    assert_eq!(delete(&conn, &[id]).unwrap(), vec![(id, "mp4".to_string())]);
    assert_eq!(
        conn.query_row(
            "SELECT COUNT(*) FROM ws_tags WHERE type = 'library_video'",
            [],
            |row| row.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}

fn boxed(kind: &[u8; 4], payload: Vec<u8>) -> Vec<u8> {
    let mut output = Vec::with_capacity(8 + payload.len());
    output.extend_from_slice(&((payload.len() + 8) as u32).to_be_bytes());
    output.extend_from_slice(kind);
    output.extend_from_slice(&payload);
    output
}

fn large_box(kind: &[u8; 4], payload: Vec<u8>) -> Vec<u8> {
    let mut output = Vec::with_capacity(16 + payload.len());
    output.extend_from_slice(&1_u32.to_be_bytes());
    output.extend_from_slice(kind);
    output.extend_from_slice(&((payload.len() + 16) as u64).to_be_bytes());
    output.extend_from_slice(&payload);
    output
}

fn mvhd(version: u8, duration: u64) -> Vec<u8> {
    let mut output = if version == 0 {
        vec![0; 20]
    } else {
        vec![0; 32]
    };
    output[0] = version;
    if version == 0 {
        output[12..16].copy_from_slice(&1_000_u32.to_be_bytes());
        output[16..20].copy_from_slice(&(duration as u32).to_be_bytes());
    } else {
        output[20..24].copy_from_slice(&1_000_u32.to_be_bytes());
        output[24..32].copy_from_slice(&duration.to_be_bytes());
    }
    boxed(b"mvhd", output)
}

fn tkhd(rotated: bool) -> Vec<u8> {
    let mut output = vec![0; 84];
    if rotated {
        output[44..48].copy_from_slice(&0x0001_0000_i32.to_be_bytes());
        output[52..56].copy_from_slice(&(-0x0001_0000_i32).to_be_bytes());
    } else {
        output[40..44].copy_from_slice(&0x0001_0000_i32.to_be_bytes());
        output[56..60].copy_from_slice(&0x0001_0000_i32.to_be_bytes());
    }
    output[76..80].copy_from_slice(&(1920_u32 << 16).to_be_bytes());
    output[80..84].copy_from_slice(&(1080_u32 << 16).to_be_bytes());
    boxed(b"tkhd", output)
}

fn video_track(handler: &[u8; 4], rotated: bool) -> Vec<u8> {
    let mut hdlr = vec![0; 12];
    hdlr[8..12].copy_from_slice(handler);
    let mut mdhd = vec![0; 20];
    mdhd[12..16].copy_from_slice(&1_000_u32.to_be_bytes());
    mdhd[16..20].copy_from_slice(&2_000_u32.to_be_bytes());
    let mut stts = vec![0; 16];
    stts[4..8].copy_from_slice(&1_u32.to_be_bytes());
    stts[8..12].copy_from_slice(&60_u32.to_be_bytes());
    stts[12..16].copy_from_slice(&1_u32.to_be_bytes());
    let stbl = boxed(b"stbl", boxed(b"stts", stts));
    let minf = boxed(b"minf", stbl);
    let mut mdia = boxed(b"hdlr", hdlr);
    mdia.extend(boxed(b"mdhd", mdhd));
    mdia.extend(minf);
    let mut track = tkhd(rotated);
    track.extend(boxed(b"mdia", mdia));
    boxed(b"trak", track)
}

fn mp4(
    version: u8,
    rotated: bool,
    after_mdat: bool,
    large_moov: bool,
    audio_only: bool,
) -> Vec<u8> {
    let mut moov = mvhd(version, 2_000);
    moov.extend(video_track(
        if audio_only { b"soun" } else { b"vide" },
        rotated,
    ));
    let moov = if large_moov {
        large_box(b"moov", moov)
    } else {
        boxed(b"moov", moov)
    };
    let mut output = boxed(b"ftyp", b"isom".to_vec());
    if after_mdat {
        output.extend(boxed(b"mdat", vec![0; 1024 * 1024]));
    }
    output.extend(moov);
    output
}

fn fragmented_mp4() -> Vec<u8> {
    let mut moov = mvhd(0, 0);
    let mut mehd = vec![0; 8];
    mehd[4..8].copy_from_slice(&2_000_u32.to_be_bytes());
    moov.extend(boxed(b"mvex", boxed(b"mehd", mehd)));
    moov.extend(video_track(b"vide", false));
    let mut output = boxed(b"ftyp", b"isom".to_vec());
    output.extend(boxed(b"moov", moov));
    output
}

fn ebml(id: &[u8], payload: Vec<u8>) -> Vec<u8> {
    let mut output = Vec::new();
    output.extend_from_slice(id);
    output.push(0x80 | payload.len() as u8);
    output.extend(payload);
    output
}

fn webm(include_duration: bool, unknown_segment: bool) -> Vec<u8> {
    let mut info = ebml(&[0x2a, 0xd7, 0xb1], 1_000_000_u32.to_be_bytes().to_vec());
    if include_duration {
        info.extend(ebml(&[0x44, 0x89], 2_000_f64.to_be_bytes().to_vec()));
    }
    let mut video = ebml(&[0xb0], 1920_u16.to_be_bytes().to_vec());
    video.extend(ebml(&[0xba], 1080_u16.to_be_bytes().to_vec()));
    let mut track = ebml(&[0x83], vec![1]);
    track.extend(ebml(&[0xe0], video));
    track.extend(ebml(
        &[0x23, 0xe3, 0x83],
        33_333_333_u32.to_be_bytes().to_vec(),
    ));
    let tracks = ebml(&[0x16, 0x54, 0xae, 0x6b], ebml(&[0xae], track));
    let mut segment = ebml(&[0x15, 0x49, 0xa9, 0x66], info);
    segment.extend(tracks);
    let mut output = ebml(&[0x1a, 0x45, 0xdf, 0xa3], Vec::new());
    output.extend_from_slice(&[0x18, 0x53, 0x80, 0x67]);
    output.push(if unknown_segment {
        0xff
    } else {
        0x80 | segment.len() as u8
    });
    output.extend(segment);
    output
}

fn write(dir: &TempDir, name: &str, bytes: &[u8]) -> std::path::PathBuf {
    let path = dir.path().join(name);
    fs::write(&path, bytes).unwrap();
    path
}

#[test]
fn probes_iso_boxes_before_after_mdat_and_large_size() {
    let dir = TempDir::new().unwrap();
    for (name, bytes, version, large) in [
        ("before.mp4", mp4(0, false, false, false, false), 0, false),
        ("after.mp4", mp4(0, false, true, false, false), 0, false),
        ("large.mp4", mp4(1, false, false, true, false), 1, true),
    ] {
        let info = probe(&write(&dir, name, &bytes), VideoFormat::Mp4).unwrap();
        assert_eq!(
            (info.duration_ms, info.width, info.height, info.fps),
            (2_000, 1920, 1080, Some(30.0)),
            "{version} {large}"
        );
    }
}

#[test]
fn probes_rotation_and_fragment_duration_and_rejects_audio_track() {
    let dir = TempDir::new().unwrap();
    let portrait = probe(
        &write(&dir, "portrait.mp4", &mp4(0, true, false, false, false)),
        VideoFormat::Mp4,
    )
    .unwrap();
    assert_eq!((portrait.width, portrait.height), (1080, 1920));
    assert_eq!(
        probe(
            &write(&dir, "fragment.mp4", &fragmented_mp4()),
            VideoFormat::Mp4
        )
        .unwrap()
        .duration_ms,
        2_000
    );
    assert_eq!(
        probe(
            &write(&dir, "audio.mp4", &mp4(0, false, false, false, true)),
            VideoFormat::Mp4
        )
        .unwrap_err()
        .code,
        LibraryErrorCode::VideoUnreadable
    );
}

#[test]
fn probes_webm_unknown_segment_and_rejects_missing_duration() {
    let dir = TempDir::new().unwrap();
    let info = probe(
        &write(&dir, "clip.webm", &webm(true, true)),
        VideoFormat::Webm,
    )
    .unwrap();
    assert_eq!(
        (info.duration_ms, info.width, info.height),
        (2_000, 1920, 1080)
    );
    assert_eq!(info.fps, Some(30.0));
    assert_eq!(
        probe(
            &write(&dir, "none.webm", &webm(false, true)),
            VideoFormat::Webm
        )
        .unwrap_err()
        .code,
        LibraryErrorCode::VideoUnreadable
    );
}

#[test]
fn rejects_invalid_and_mismatched_containers() {
    let dir = TempDir::new().unwrap();
    for (name, bytes, format) in [
        ("zero.mp4", Vec::new(), VideoFormat::Mp4),
        ("short.mp4", vec![0, 0, 0, 8, b'm'], VideoFormat::Mp4),
        ("random.mp4", b"random bytes".to_vec(), VideoFormat::Mp4),
        ("mismatch.mov", webm(true, false), VideoFormat::Mov),
    ] {
        assert_eq!(
            probe(&write(&dir, name, &bytes), format).unwrap_err().code,
            LibraryErrorCode::VideoUnreadable
        );
    }
    assert_eq!(VideoFormat::from_extension("avi"), None);
}

fn jpeg_size(bytes: &[u8]) -> (u32, u32) {
    let image = image::load_from_memory(bytes).unwrap();
    (image.width(), image.height())
}

#[test]
fn plans_the_first_second_then_the_first_frame() {
    assert_eq!(seek_candidates(5_000), vec![1, 0]);
    assert_eq!(seek_candidates(1_001), vec![1, 0]);
    assert_eq!(seek_candidates(1_000), vec![0]);
    assert_eq!(seek_candidates(0), vec![0]);
}

#[test]
fn extracts_a_scaled_jpeg_frame_from_the_first_second() {
    let directory = TempDir::new().unwrap();
    let clip = directory.path().join("clip.mp4");
    write_sample_clip(&clip, "3");
    let bytes = extract_poster(&clip, 3_000).unwrap();
    assert!(bytes.starts_with(&JPEG_MAGIC));
    assert_eq!(jpeg_size(&bytes), (480, 270));
}

#[test]
fn falls_back_to_the_first_frame_for_clips_shorter_than_a_second() {
    let directory = TempDir::new().unwrap();
    let clip = directory.path().join("short.mp4");
    write_sample_clip(&clip, "0.5");
    let bytes = extract_poster(&clip, 500).unwrap();
    assert_eq!(jpeg_size(&bytes), (480, 270));
    let overestimated = extract_poster(&clip, 5_000).unwrap();
    assert!(overestimated.starts_with(&JPEG_MAGIC));
}

#[test]
fn rejects_files_that_ffmpeg_cannot_decode() {
    let directory = TempDir::new().unwrap();
    let broken = directory.path().join("broken.mp4");
    std::fs::write(&broken, b"not a video").unwrap();
    let error = extract_poster(&broken, 2_000).unwrap_err();
    assert_eq!(error.code, LibraryErrorCode::VideoUnreadable);
}
