use crate::features::library::assets;
use crate::features::library::models::AssetPatch;
use crate::features::library::models::AssetRights;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibrarySound;
use crate::shared::files;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::params;
use std::fs;
use std::fs::File;
use std::io::Read;
use std::io::Seek;
use std::io::SeekFrom;
use std::path::Path;
use std::path::PathBuf;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

pub const SOUND_MAX_BYTES: usize = 200 * 1024 * 1024;
pub const SOUND_EXTENSIONS: [&str; 3] = ["mp3", "wav", "aac"];
pub const PEAK_RATE: u32 = 12;

const SOUND_TAG_TYPE: &str = "library_sound";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SoundFormat {
    Mp3,
    Wav,
    Aac,
}

impl SoundFormat {
    pub fn from_extension(extension: &str) -> Option<Self> {
        match extension.to_ascii_lowercase().as_str() {
            "mp3" => Some(Self::Mp3),
            "wav" => Some(Self::Wav),
            "aac" => Some(Self::Aac),
            _ => None,
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Mp3 => "mp3",
            Self::Wav => "wav",
            Self::Aac => "aac",
        }
    }

    pub fn mime(self) -> &'static str {
        match self {
            Self::Mp3 => "audio/mpeg",
            Self::Wav => "audio/wav",
            Self::Aac => "audio/aac",
        }
    }

    pub fn matches(self, bytes: &[u8]) -> bool {
        let id3 = bytes.starts_with(b"ID3");
        match self {
            Self::Mp3 => {
                id3 || bytes.len() >= 2
                    && bytes[0] == 0xff
                    && bytes[1] & 0xe0 == 0xe0
                    && bytes[1] & 0x06 != 0
            }
            Self::Wav => bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE",
            Self::Aac => id3 || bytes.len() >= 2 && bytes[0] == 0xff && bytes[1] & 0xf6 == 0xf0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SoundAnalysis {
    pub duration_ms: i64,
    pub sample_rate: u32,
    pub channels: u32,
    pub peaks: Vec<u8>,
    pub overview: [u8; 32],
}

#[derive(Debug, Clone, PartialEq)]
pub struct DecodedSound {
    pub sample_rate: u32,
    pub channels: u32,
    pub samples: Vec<f32>,
}

pub fn decode(path: &Path, format: SoundFormat) -> LibraryResult<DecodedSound> {
    let mut samples = Vec::new();
    let (sample_rate, channels) = decode_with(path, format, &mut |values, _, _| {
        samples.extend_from_slice(values);
    })?;
    Ok(DecodedSound {
        sample_rate,
        channels,
        samples,
    })
}

pub fn analyze(path: &Path, format: SoundFormat) -> LibraryResult<SoundAnalysis> {
    let mut peaks = Vec::new();
    let mut frames = 0_u64;
    let (sample_rate, channels) = decode_with(path, format, &mut |values, rate, channels| {
        frames = collect_peaks(&mut peaks, values, rate, channels, frames);
    })?;
    if frames == 0 {
        return Err(sound_unreadable("sound has no decodable audio"));
    }
    let mut overview = [0_u8; 32];
    let overview_len = overview.len();
    for (index, value) in overview.iter_mut().enumerate() {
        let start = index * peaks.len() / overview_len;
        let end = ((index + 1) * peaks.len()).div_ceil(overview_len);
        let values = &peaks[start..end];
        *value =
            (values.iter().map(|peak| u32::from(*peak)).sum::<u32>() / values.len() as u32) as u8;
    }
    Ok(SoundAnalysis {
        duration_ms: (frames * 1000 / u64::from(sample_rate)) as i64,
        sample_rate,
        channels,
        peaks,
        overview,
    })
}

fn collect_peaks(
    peaks: &mut Vec<u8>,
    values: &[f32],
    sample_rate: u32,
    channels: u32,
    mut frames: u64,
) -> u64 {
    let width = channels as usize;
    for frame in values.chunks_exact(width) {
        let peak = frame
            .iter()
            .map(|sample| sample.abs())
            .fold(0_f32, f32::max)
            .clamp(0.0, 1.0);
        let peak_index = (frames * u64::from(PEAK_RATE) / u64::from(sample_rate)) as usize;
        if peaks.len() <= peak_index {
            peaks.resize(peak_index + 1, 0);
        }
        peaks[peak_index] = peaks[peak_index].max((peak * 255.0).round() as u8);
        frames += 1;
    }
    frames
}

type SampleSink<'a> = dyn FnMut(&[f32], u32, u32) + 'a;

fn decode_with(
    path: &Path,
    format: SoundFormat,
    sink: &mut SampleSink<'_>,
) -> LibraryResult<(u32, u32)> {
    let mut header = [0_u8; 16];
    let mut source = File::open(path)?;
    let count = source.read(&mut header)?;
    if !format.matches(&header[..count]) {
        return Err(sound_unreadable(
            "sound extension and file content do not match",
        ));
    }
    source.seek(SeekFrom::Start(0))?;

    let mut hint = Hint::new();
    hint.with_extension(format.extension());
    let stream = MediaSourceStream::new(Box::new(source), Default::default());
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(sound_decode_error)?;
    let mut reader = probed.format;
    let track = reader
        .default_track()
        .ok_or_else(|| sound_unreadable("sound has no audio track"))?;
    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| sound_unreadable("sound has no sample rate"))?;
    let channels = track
        .codec_params
        .channels
        .ok_or_else(|| sound_unreadable("sound has no channels"))?
        .count() as u32;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(sound_decode_error)?;
    let mut decoded = false;

    loop {
        let packet = match reader.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(_) if decoded => continue,
            Err(error) => return Err(sound_decode_error(error)),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let audio = match decoder.decode(&packet) {
            Ok(audio) => audio,
            Err(_) if decoded => continue,
            Err(error) => return Err(sound_decode_error(error)),
        };
        decoded = true;
        let mut samples = SampleBuffer::<f32>::new(audio.capacity() as u64, *audio.spec());
        samples.copy_interleaved_ref(audio);
        sink(samples.samples(), sample_rate, channels);
    }
    if !decoded {
        return Err(sound_unreadable("sound has no decodable audio"));
    }
    Ok((sample_rate, channels))
}

#[derive(Debug, Clone)]
pub struct SoundFiles {
    workspace_dir: PathBuf,
}

impl SoundFiles {
    pub fn new(workspace_dir: PathBuf) -> Self {
        Self { workspace_dir }
    }

    pub fn write_original(&self, id: i64, format: SoundFormat, source: &Path) -> LibraryResult<()> {
        let directory = self.sounds_dir();
        fs::create_dir_all(&directory)?;
        let temp = directory.join(format!(".{id}.{}.tmp", format.extension()));
        let target = self.original_path(id, format);
        fs::copy(source, &temp)?;
        if let Err(error) = fs::rename(&temp, target) {
            let _ = fs::remove_file(&temp);
            return Err(error.into());
        }
        Ok(())
    }

    pub fn read_range(
        &self,
        id: i64,
        format: SoundFormat,
        start: u64,
        len: u64,
    ) -> LibraryResult<Vec<u8>> {
        Ok(files::read_range(
            &self.original_path(id, format),
            start,
            len,
        )?)
    }

    pub fn len(&self, id: i64, format: SoundFormat) -> LibraryResult<u64> {
        Ok(fs::metadata(self.original_path(id, format))?.len())
    }

    pub fn remove(&self, id: i64, format: SoundFormat) -> LibraryResult<()> {
        assets::remove_if_exists(&self.original_path(id, format))
    }

    fn sounds_dir(&self) -> PathBuf {
        self.workspace_dir.join("library").join("sounds")
    }

    pub fn original_path(&self, id: i64, format: SoundFormat) -> PathBuf {
        self.sounds_dir()
            .join(format!("{id}.{}", format.extension()))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewSound {
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub duration_ms: i64,
    pub sample_rate: u32,
    pub channels: u32,
    pub peaks: Vec<u8>,
    pub overview: [u8; 32],
    pub rights: AssetRights,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
}

pub fn list(conn: &Connection) -> LibraryResult<Vec<LibrarySound>> {
    let mut statement = conn.prepare("SELECT id, name, ext, size, duration_ms, sample_rate, channels, overview, rights, origin, collection_id, created_at, updated_at FROM ws_library_sounds ORDER BY created_at DESC, id DESC")?;
    let rows = statement.query_map([], sound_from_row)?;
    let mut sounds = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    for sound in &mut sounds {
        sound.tags = assets::tags_for(conn, SOUND_TAG_TYPE, sound.id)?;
    }
    Ok(sounds)
}

pub fn get(conn: &Connection, id: i64) -> LibraryResult<LibrarySound> {
    let mut sound = conn
        .query_row("SELECT id, name, ext, size, duration_ms, sample_rate, channels, overview, rights, origin, collection_id, created_at, updated_at FROM ws_library_sounds WHERE id = ?1", [id], sound_from_row)
        .optional()?
        .ok_or_else(|| sound_not_found(id))?;
    sound.tags = assets::tags_for(conn, SOUND_TAG_TYPE, id)?;
    Ok(sound)
}

pub fn unique_name(conn: &Connection, name: &str, except_id: Option<i64>) -> LibraryResult<String> {
    assets::unique_name(conn, "ws_library_sounds", name, except_id)
}

pub fn insert(conn: &Connection, sound: &NewSound, now: &str) -> LibraryResult<i64> {
    let tags = assets::normalized_tags(&sound.tags)?;
    assets::require_collection(conn, sound.collection_id)?;
    conn.execute("INSERT INTO ws_library_sounds (name, ext, size, duration_ms, sample_rate, channels, peaks, overview, rights, origin, collection_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'upload', ?10, ?11, ?11)", params![sound.name, sound.ext, sound.size, sound.duration_ms, sound.sample_rate, sound.channels, sound.peaks, sound.overview.as_slice(), sound.rights.as_str(), sound.collection_id, now])?;
    let id = conn.last_insert_rowid();
    assets::replace_tags(conn, SOUND_TAG_TYPE, id, &tags)?;
    Ok(id)
}

pub fn peaks(conn: &Connection, id: i64) -> LibraryResult<Vec<u8>> {
    conn.query_row(
        "SELECT peaks FROM ws_library_sounds WHERE id = ?1",
        [id],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| sound_not_found(id))
}

pub fn update(
    conn: &Connection,
    id: i64,
    patch: &AssetPatch,
    now: &str,
) -> LibraryResult<LibrarySound> {
    get(conn, id)?;
    if let Some(name) = patch.name.as_deref() {
        let name = unique_name(conn, name, Some(id))?;
        conn.execute(
            "UPDATE ws_library_sounds SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now, id],
        )?;
    }
    if let Some(rights) = patch.rights {
        conn.execute(
            "UPDATE ws_library_sounds SET rights = ?1, updated_at = ?2 WHERE id = ?3",
            params![rights.as_str(), now, id],
        )?;
    }
    if let Some(collection_id) = patch.collection_id {
        assets::require_collection(conn, collection_id)?;
        conn.execute(
            "UPDATE ws_library_sounds SET collection_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![collection_id, now, id],
        )?;
    }
    if let Some(tags) = patch.tags.as_ref() {
        assets::replace_tags(conn, SOUND_TAG_TYPE, id, &assets::normalized_tags(tags)?)?;
        conn.execute(
            "UPDATE ws_library_sounds SET updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, ids: &[i64]) -> LibraryResult<Vec<(i64, String)>> {
    let mut removed = Vec::new();
    for id in ids {
        let ext = conn
            .query_row(
                "SELECT ext FROM ws_library_sounds WHERE id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(ext) = ext else {
            continue;
        };
        assets::delete_tags(conn, SOUND_TAG_TYPE, *id)?;
        conn.execute("DELETE FROM ws_library_sounds WHERE id = ?1", [id])?;
        removed.push((*id, ext));
    }
    Ok(removed)
}

fn sound_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibrarySound> {
    let rights = row.get::<_, String>(8)?;
    let rights = AssetRights::parse(&rights).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            8,
            rusqlite::types::Type::Text,
            format!("invalid sound rights: {rights}").into(),
        )
    })?;
    Ok(LibrarySound {
        id: row.get(0)?,
        name: row.get(1)?,
        ext: row.get(2)?,
        size: row.get(3)?,
        duration_ms: row.get(4)?,
        sample_rate: row.get(5)?,
        channels: row.get(6)?,
        overview: row.get(7)?,
        rights,
        origin: row.get(9)?,
        collection_id: row.get(10)?,
        tags: Vec::new(),
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn sound_not_found(id: i64) -> LibraryError {
    LibraryError::new(
        LibraryErrorCode::SoundNotFound,
        format!("sound {id} does not exist"),
    )
}

fn sound_unreadable(detail: impl Into<String>) -> LibraryError {
    LibraryError::new(LibraryErrorCode::SoundUnreadable, detail)
}

fn sound_decode_error(error: SymphoniaError) -> LibraryError {
    sound_unreadable(error.to_string())
}

#[cfg(test)]
#[path = "../../../test/features/library/sounds.test.rs"]
mod tests;
