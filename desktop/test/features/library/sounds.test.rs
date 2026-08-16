use super::*;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

fn wav_bytes() -> Vec<u8> {
    let sample_rate = 8_000_u32;
    let samples = sample_rate as usize * 2;
    let data_len = samples * 2;
    let mut bytes = Vec::with_capacity(44 + data_len);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16_u32.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2_u16.to_le_bytes());
    bytes.extend_from_slice(&16_u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&(data_len as u32).to_le_bytes());
    for index in 0..samples {
        let sample = if index < sample_rate as usize {
            0_i16
        } else {
            i16::MAX
        };
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}

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

fn new_sound(name: &str) -> NewSound {
    NewSound {
        name: name.to_string(),
        ext: "wav".to_string(),
        size: 12,
        duration_ms: 2_000,
        sample_rate: 8_000,
        channels: 1,
        peaks: vec![0; 24],
        overview: [0; 32],
        rights: AssetRights::Own,
        collection_id: None,
        tags: vec!["Example".to_string()],
    }
}

#[test]
fn analyzes_pcm_wav_peaks_and_overview() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("signal.wav");
    fs::write(&path, wav_bytes()).unwrap();

    let analysis = analyze(&path, SoundFormat::Wav).unwrap();

    assert_eq!(analysis.duration_ms, 2_000);
    assert_eq!(analysis.sample_rate, 8_000);
    assert_eq!(analysis.channels, 1);
    assert_eq!(analysis.peaks.len(), 24);
    assert_eq!(&analysis.peaks[..12], &[0; 12]);
    assert_eq!(&analysis.peaks[12..], &[255; 12]);
    assert_eq!(&analysis.overview[..16], &[0; 16]);
    assert_eq!(&analysis.overview[16..], &[255; 16]);
}

#[test]
fn rejects_mismatched_and_garbage_sounds() {
    let dir = TempDir::new().unwrap();
    let wav = dir.path().join("signal.wav");
    let garbage = dir.path().join("garbage.wav");
    fs::write(&wav, wav_bytes()).unwrap();
    fs::write(&garbage, b"not sound data").unwrap();

    assert_eq!(
        analyze(&wav, SoundFormat::Mp3).unwrap_err().code,
        LibraryErrorCode::SoundUnreadable
    );
    assert_eq!(
        analyze(&garbage, SoundFormat::Wav).unwrap_err().code,
        LibraryErrorCode::SoundUnreadable
    );
}

#[test]
fn writes_reads_ranges_and_removes_files() {
    let dir = TempDir::new().unwrap();
    let source = dir.path().join("source.wav");
    let data = wav_bytes();
    fs::write(&source, &data).unwrap();
    let files = SoundFiles::new(dir.path().to_path_buf());

    files.write_original(7, SoundFormat::Wav, &source).unwrap();

    assert_eq!(files.len(7, SoundFormat::Wav).unwrap(), data.len() as u64);
    assert_eq!(
        files.read_range(7, SoundFormat::Wav, 4, 8).unwrap(),
        data[4..12]
    );
    files.remove(7, SoundFormat::Wav).unwrap();
    files.remove(7, SoundFormat::Wav).unwrap();
}

#[test]
fn stores_updates_and_deletes_sounds() {
    let conn = test_connection();
    let id = insert(&conn, &new_sound("signal.wav"), "2026-01-01T00:00:00Z").unwrap();
    let duplicate = unique_name(&conn, "SIGNAL.wav", None).unwrap();
    let mut patch = AssetPatch {
        name: Some("renamed.wav".to_string()),
        rights: Some(AssetRights::Licensed),
        collection_id: None,
        tags: Some((0..12).map(|index| format!("tag-{index}")).collect()),
    };

    assert_eq!(duplicate, "SIGNAL (2).wav");
    assert_eq!(list(&conn).unwrap()[0].tags, vec!["example"]);
    assert_eq!(peaks(&conn, id).unwrap(), vec![0; 24]);
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
    assert_eq!(updated.name, "renamed.wav");
    assert_eq!(updated.rights, AssetRights::Licensed);
    assert_eq!(updated.tags.len(), 12);
    patch.collection_id = Some(Some(99));
    assert_eq!(
        update(&conn, id, &patch, "2026-01-02T00:00:00Z")
            .unwrap_err()
            .code,
        LibraryErrorCode::CollectionNotFound
    );
    assert_eq!(delete(&conn, &[id]).unwrap(), vec![(id, "wav".to_string())]);
    assert_eq!(
        conn.query_row(
            "SELECT COUNT(*) FROM ws_tags WHERE type = 'library_sound'",
            [],
            |row| row.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}
