use crate::features::library::assets;
use crate::features::library::models::AssetPatch;
use crate::features::library::models::AssetRights;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibraryVideo;
use crate::shared::ffmpeg;
use crate::shared::files;
use crate::shared::process::hide_window;
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
use std::process::Command;
use std::process::Output;
use std::process::Stdio;
use uuid::Uuid;

pub const VIDEO_MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub const VIDEO_EXTENSIONS: [&str; 4] = ["mp4", "mov", "webm", "mkv"];
pub const POSTER_MAX_BYTES: usize = 2 * 1024 * 1024;
const VIDEO_TAG_TYPE: &str = "library_video";

#[derive(Debug, Clone)]
pub struct VideoFiles {
    workspace_dir: PathBuf,
}

impl VideoFiles {
    pub fn new(workspace_dir: PathBuf) -> Self {
        Self { workspace_dir }
    }

    pub fn stage(&self, source: &Path) -> LibraryResult<PathBuf> {
        let directory = self.videos_dir();
        fs::create_dir_all(&directory)?;
        let staged = directory.join(format!(".upload-{}.tmp", Uuid::new_v4()));
        fs::copy(source, &staged)?;
        Ok(staged)
    }

    pub fn commit(&self, staged: &Path, id: i64, format: VideoFormat) -> LibraryResult<()> {
        fs::rename(staged, self.original_path(id, format))?;
        Ok(())
    }

    pub fn discard(&self, staged: &Path) -> LibraryResult<()> {
        assets::remove_if_exists(staged)
    }

    pub fn len(&self, id: i64, format: VideoFormat) -> LibraryResult<u64> {
        Ok(fs::metadata(self.original_path(id, format))?.len())
    }

    pub fn read_range(
        &self,
        id: i64,
        format: VideoFormat,
        start: u64,
        len: u64,
    ) -> LibraryResult<Vec<u8>> {
        Ok(files::read_range(
            &self.original_path(id, format),
            start,
            len,
        )?)
    }

    pub fn write_poster(&self, id: i64, bytes: &[u8]) -> LibraryResult<()> {
        if bytes.len() > POSTER_MAX_BYTES || !bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            return Err(video_unreadable("invalid JPEG poster"));
        }
        let directory = self.posters_dir();
        fs::create_dir_all(&directory)?;
        let temporary = directory.join(format!(".{id}.tmp"));
        fs::write(&temporary, bytes)?;
        fs::rename(temporary, self.poster_path(id))?;
        Ok(())
    }

    pub fn read_poster(&self, id: i64) -> LibraryResult<Option<Vec<u8>>> {
        Ok(files::read_if_exists(&self.poster_path(id))?)
    }

    pub fn remove(&self, id: i64, format: VideoFormat) -> LibraryResult<()> {
        assets::remove_if_exists(&self.original_path(id, format))?;
        assets::remove_if_exists(&self.poster_path(id))
    }

    fn videos_dir(&self) -> PathBuf {
        self.workspace_dir.join("library").join("videos")
    }

    fn posters_dir(&self) -> PathBuf {
        self.videos_dir().join("posters")
    }

    fn original_path(&self, id: i64, format: VideoFormat) -> PathBuf {
        self.videos_dir()
            .join(format!("{id}.{}", format.extension()))
    }

    fn poster_path(&self, id: i64) -> PathBuf {
        self.posters_dir().join(format!("{id}.jpg"))
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct NewVideo {
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub duration_ms: i64,
    pub width: u32,
    pub height: u32,
    pub fps: Option<f64>,
    pub rights: AssetRights,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
}

pub fn list(conn: &Connection) -> LibraryResult<Vec<LibraryVideo>> {
    let mut statement = conn.prepare("SELECT id, name, ext, size, duration_ms, width, height, fps, rights, origin, collection_id, has_poster, created_at, updated_at FROM ws_library_videos ORDER BY created_at DESC, id DESC")?;
    let rows = statement.query_map([], video_from_row)?;
    let mut videos = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    for video in &mut videos {
        video.tags = assets::tags_for(conn, VIDEO_TAG_TYPE, video.id)?;
    }
    Ok(videos)
}

pub fn get(conn: &Connection, id: i64) -> LibraryResult<LibraryVideo> {
    let mut video = conn.query_row("SELECT id, name, ext, size, duration_ms, width, height, fps, rights, origin, collection_id, has_poster, created_at, updated_at FROM ws_library_videos WHERE id = ?1", [id], video_from_row).optional()?.ok_or_else(|| video_not_found(id))?;
    video.tags = assets::tags_for(conn, VIDEO_TAG_TYPE, id)?;
    Ok(video)
}

pub fn unique_name(conn: &Connection, name: &str, except_id: Option<i64>) -> LibraryResult<String> {
    assets::unique_name(conn, "ws_library_videos", name, except_id)
}

pub fn insert(conn: &Connection, video: &NewVideo, now: &str) -> LibraryResult<i64> {
    let tags = assets::normalized_tags(&video.tags)?;
    assets::require_collection(conn, video.collection_id)?;
    conn.execute("INSERT INTO ws_library_videos (name, ext, size, duration_ms, width, height, fps, rights, origin, collection_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'upload', ?9, ?10, ?10)", params![video.name, video.ext, video.size, video.duration_ms, video.width, video.height, video.fps, video.rights.as_str(), video.collection_id, now])?;
    let id = conn.last_insert_rowid();
    assets::replace_tags(conn, VIDEO_TAG_TYPE, id, &tags)?;
    Ok(id)
}

pub fn update(
    conn: &Connection,
    id: i64,
    patch: &AssetPatch,
    now: &str,
) -> LibraryResult<LibraryVideo> {
    get(conn, id)?;
    if let Some(name) = patch.name.as_deref() {
        let name = unique_name(conn, name, Some(id))?;
        conn.execute(
            "UPDATE ws_library_videos SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now, id],
        )?;
    }
    if let Some(rights) = patch.rights {
        conn.execute(
            "UPDATE ws_library_videos SET rights = ?1, updated_at = ?2 WHERE id = ?3",
            params![rights.as_str(), now, id],
        )?;
    }
    if let Some(collection_id) = patch.collection_id {
        assets::require_collection(conn, collection_id)?;
        conn.execute(
            "UPDATE ws_library_videos SET collection_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![collection_id, now, id],
        )?;
    }
    if let Some(tags) = patch.tags.as_ref() {
        assets::replace_tags(conn, VIDEO_TAG_TYPE, id, &assets::normalized_tags(tags)?)?;
        conn.execute(
            "UPDATE ws_library_videos SET updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
    }
    get(conn, id)
}

pub fn mark_poster(conn: &Connection, id: i64) -> LibraryResult<()> {
    conn.execute(
        "UPDATE ws_library_videos SET has_poster = 1 WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, ids: &[i64]) -> LibraryResult<Vec<(i64, String)>> {
    let mut removed = Vec::new();
    for id in ids {
        let ext = conn
            .query_row(
                "SELECT ext FROM ws_library_videos WHERE id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(ext) = ext else {
            continue;
        };
        assets::delete_tags(conn, VIDEO_TAG_TYPE, *id)?;
        conn.execute("DELETE FROM ws_library_videos WHERE id = ?1", [id])?;
        removed.push((*id, ext));
    }
    Ok(removed)
}

fn video_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryVideo> {
    let rights = row.get::<_, String>(8)?;
    let rights = AssetRights::parse(&rights).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            8,
            rusqlite::types::Type::Text,
            format!("invalid video rights: {rights}").into(),
        )
    })?;
    Ok(LibraryVideo {
        id: row.get(0)?,
        name: row.get(1)?,
        ext: row.get(2)?,
        size: row.get(3)?,
        duration_ms: row.get(4)?,
        width: row.get(5)?,
        height: row.get(6)?,
        fps: row.get(7)?,
        rights,
        origin: row.get(9)?,
        collection_id: row.get(10)?,
        tags: Vec::new(),
        has_poster: row.get::<_, i64>(11)? != 0,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn video_not_found(id: i64) -> LibraryError {
    LibraryError::new(
        LibraryErrorCode::VideoNotFound,
        format!("video {id} does not exist"),
    )
}

fn video_unreadable(detail: impl Into<String>) -> LibraryError {
    LibraryError::new(LibraryErrorCode::VideoUnreadable, detail)
}

const MAX_MOOV_BYTES: u64 = 64 * 1024 * 1024;
const MAX_EBML_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoFormat {
    Mp4,
    Mov,
    Webm,
    Mkv,
}

impl VideoFormat {
    pub fn from_extension(extension: &str) -> Option<Self> {
        match extension.to_ascii_lowercase().as_str() {
            "mp4" => Some(Self::Mp4),
            "mov" => Some(Self::Mov),
            "webm" => Some(Self::Webm),
            "mkv" => Some(Self::Mkv),
            _ => None,
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
            Self::Mov => "mov",
            Self::Webm => "webm",
            Self::Mkv => "mkv",
        }
    }

    pub fn mime(self) -> &'static str {
        match self {
            Self::Mp4 => "video/mp4",
            Self::Mov => "video/quicktime",
            Self::Webm => "video/webm",
            Self::Mkv => "video/x-matroska",
        }
    }

    pub fn matches(self, bytes: &[u8]) -> bool {
        match self {
            Self::Mp4 | Self::Mov => {
                bytes.len() >= 8
                    && matches!(
                        &bytes[4..8],
                        b"ftyp" | b"moov" | b"mdat" | b"free" | b"skip" | b"wide" | b"pnot"
                    )
            }
            Self::Webm | Self::Mkv => bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct VideoInfo {
    pub duration_ms: i64,
    pub width: u32,
    pub height: u32,
    pub fps: Option<f64>,
}

pub fn probe(path: &Path, format: VideoFormat) -> LibraryResult<VideoInfo> {
    let mut file = File::open(path)?;
    let mut header = [0_u8; 16];
    let count = file.read(&mut header)?;
    if !format.matches(&header[..count]) {
        return Err(video_unreadable(
            "video extension and file content do not match",
        ));
    }
    let info = match format {
        VideoFormat::Mp4 | VideoFormat::Mov => probe_iso(&mut file)?,
        VideoFormat::Webm | VideoFormat::Mkv => probe_ebml(&mut file)?,
    };
    validate(info)
}

fn validate(info: VideoInfo) -> LibraryResult<VideoInfo> {
    if info.duration_ms <= 0
        || !(1..=16_384).contains(&info.width)
        || !(1..=16_384).contains(&info.height)
    {
        return Err(video_unreadable(
            "video is missing valid duration or dimensions",
        ));
    }
    Ok(info)
}

fn probe_iso(file: &mut File) -> LibraryResult<VideoInfo> {
    let length = file.metadata()?.len();
    let mut offset = 0_u64;
    let mut moov = None;
    let mut fragments = Vec::new();
    let mut loaded = 0_u64;
    while offset < length {
        file.seek(SeekFrom::Start(offset))?;
        let Some((size, kind, header)) = read_box_header(file, length - offset)? else {
            break;
        };
        if size < header || size > length - offset {
            return Err(video_unreadable("invalid ISO box size"));
        }
        if &kind == b"moov" || &kind == b"moof" {
            let payload_len = size - header;
            loaded = loaded.saturating_add(payload_len);
            if loaded > MAX_MOOV_BYTES {
                return Err(video_unreadable("moov box is too large"));
            }
            let mut data = vec![0; payload_len as usize];
            file.read_exact(&mut data)?;
            if &kind == b"moov" {
                moov = Some(data);
            } else {
                fragments.push(data);
            }
        }
        offset = offset
            .checked_add(size)
            .ok_or_else(|| video_unreadable("invalid ISO box offset"))?;
    }
    let moov = moov.ok_or_else(|| video_unreadable("video has no moov box"))?;
    parse_moov(&moov, &fragments)
}

fn read_box_header(file: &mut File, remaining: u64) -> LibraryResult<Option<(u64, [u8; 4], u64)>> {
    if remaining < 8 {
        return Ok(None);
    }
    let mut header = [0_u8; 8];
    file.read_exact(&mut header)?;
    let mut size = u64::from(u32::from_be_bytes(header[..4].try_into().unwrap()));
    let kind: [u8; 4] = header[4..8].try_into().unwrap();
    let mut header_len = 8;
    if size == 1 {
        if remaining < 16 {
            return Err(video_unreadable("truncated large ISO box"));
        }
        let mut large = [0_u8; 8];
        file.read_exact(&mut large)?;
        size = u64::from_be_bytes(large);
        header_len = 16;
    } else if size == 0 {
        size = remaining;
    }
    Ok(Some((size, kind, header_len)))
}

#[derive(Clone, Copy)]
struct IsoBox<'a> {
    kind: [u8; 4],
    payload: &'a [u8],
}

fn iso_children(mut data: &[u8]) -> LibraryResult<Vec<IsoBox<'_>>> {
    let mut output = Vec::new();
    while !data.is_empty() {
        if data.len() < 8 {
            return Err(video_unreadable("truncated ISO child box"));
        }
        let mut size = u64::from(u32::from_be_bytes(data[..4].try_into().unwrap()));
        let kind = data[4..8].try_into().unwrap();
        let mut header = 8_usize;
        if size == 1 {
            if data.len() < 16 {
                return Err(video_unreadable("truncated large ISO child box"));
            }
            size = u64::from_be_bytes(data[8..16].try_into().unwrap());
            header = 16;
        } else if size == 0 {
            size = data.len() as u64;
        }
        if size < header as u64 || size > data.len() as u64 {
            return Err(video_unreadable("invalid ISO child size"));
        }
        output.push(IsoBox {
            kind,
            payload: &data[header..size as usize],
        });
        data = &data[size as usize..];
    }
    Ok(output)
}

fn iso_find<'a>(data: &'a [u8], wanted: &[u8; 4]) -> LibraryResult<Option<&'a [u8]>> {
    for entry in iso_children(data)? {
        if &entry.kind == wanted {
            return Ok(Some(entry.payload));
        }
    }
    Ok(None)
}

fn parse_moov(data: &[u8], fragments: &[Vec<u8>]) -> LibraryResult<VideoInfo> {
    let mvhd = iso_find(data, b"mvhd")?.ok_or_else(|| video_unreadable("video has no mvhd"))?;
    let (movie_scale, mut duration) = iso_time(mvhd)?;
    if duration == 0
        && let Some(mvex) = iso_find(data, b"mvex")?
        && let Some(mehd) = iso_find(mvex, b"mehd")?
    {
        duration = mehd_duration(mehd)?;
    }
    let mut video = None;
    for track in iso_children(data)?
        .into_iter()
        .filter(|entry| &entry.kind == b"trak")
    {
        if let Some(info) = parse_track(track.payload)? {
            video = Some(info);
            break;
        }
    }
    let VideoTrack {
        mut width,
        mut height,
        scale: track_scale,
        duration: mut track_duration,
        mut samples,
        track_id,
    } = video.ok_or_else(|| video_unreadable("video has no video track"))?;
    if duration == 0 && track_duration == 0 && !fragments.is_empty() {
        let totals = fragment_totals(data, fragments, track_id)?;
        track_duration = totals.end;
        samples = Some(totals.samples);
    }
    let (ticks, scale) = if duration > 0 {
        (duration, movie_scale)
    } else {
        (track_duration, track_scale)
    };
    let duration_ms = ticks
        .checked_mul(1000)
        .ok_or_else(|| video_unreadable("video duration overflows"))?
        / scale.max(1);
    let fps = samples.and_then(|count| fps(count, track_scale, track_duration));
    if width == 0 || height == 0 {
        return Err(video_unreadable("video has invalid dimensions"));
    }
    if track_scale == 0 {
        width = 0;
        height = 0;
    }
    Ok(VideoInfo {
        duration_ms: duration_ms as i64,
        width,
        height,
        fps,
    })
}

fn iso_time(data: &[u8]) -> LibraryResult<(u64, u64)> {
    let version = *data
        .first()
        .ok_or_else(|| video_unreadable("truncated ISO time box"))?;
    match version {
        0 if data.len() >= 20 => Ok((
            u64::from(u32::from_be_bytes(data[12..16].try_into().unwrap())),
            u64::from(u32::from_be_bytes(data[16..20].try_into().unwrap())),
        )),
        1 if data.len() >= 32 => Ok((
            u64::from(u32::from_be_bytes(data[20..24].try_into().unwrap())),
            u64::from_be_bytes(data[24..32].try_into().unwrap()),
        )),
        _ => Err(video_unreadable("truncated ISO time box")),
    }
}

fn mehd_duration(data: &[u8]) -> LibraryResult<u64> {
    match data.first().copied() {
        Some(0) if data.len() >= 8 => Ok(u64::from(u32::from_be_bytes(
            data[4..8].try_into().unwrap(),
        ))),
        Some(1) if data.len() >= 12 => Ok(u64::from_be_bytes(data[4..12].try_into().unwrap())),
        _ => Err(video_unreadable("truncated mehd box")),
    }
}

struct VideoTrack {
    width: u32,
    height: u32,
    scale: u64,
    duration: u64,
    samples: Option<u64>,
    track_id: u32,
}

struct FragmentTotals {
    end: u64,
    samples: u64,
}

struct FragmentHeader {
    track_id: u32,
    default_duration: Option<u32>,
}

const TFHD_BASE_DATA_OFFSET: u32 = 0x1;
const TFHD_DESCRIPTION_INDEX: u32 = 0x2;
const TFHD_DEFAULT_DURATION: u32 = 0x8;
const TRUN_DATA_OFFSET: u32 = 0x1;
const TRUN_FIRST_FLAGS: u32 = 0x4;
const TRUN_SAMPLE_DURATION: u32 = 0x100;
const TRUN_SAMPLE_FIELDS: [u32; 4] = [0x100, 0x200, 0x400, 0x800];

fn be_u32(data: &[u8], at: usize) -> LibraryResult<u32> {
    data.get(at..at + 4)
        .map(|bytes| u32::from_be_bytes(bytes.try_into().unwrap()))
        .ok_or_else(|| video_unreadable("truncated fragment box"))
}

fn be_u64(data: &[u8], at: usize) -> LibraryResult<u64> {
    data.get(at..at + 8)
        .map(|bytes| u64::from_be_bytes(bytes.try_into().unwrap()))
        .ok_or_else(|| video_unreadable("truncated fragment box"))
}

fn box_flags(data: &[u8]) -> LibraryResult<u32> {
    Ok(be_u32(data, 0)? & 0x00ff_ffff)
}

fn tkhd_track_id(data: &[u8]) -> LibraryResult<u32> {
    match data.first() {
        Some(1) => be_u32(data, 20),
        _ => be_u32(data, 12),
    }
}

fn trex_default_duration(moov: &[u8], track_id: u32) -> LibraryResult<u32> {
    let Some(mvex) = iso_find(moov, b"mvex")? else {
        return Ok(0);
    };
    for entry in iso_children(mvex)? {
        if &entry.kind == b"trex" && be_u32(entry.payload, 4)? == track_id {
            return be_u32(entry.payload, 12);
        }
    }
    Ok(0)
}

fn parse_tfhd(data: &[u8]) -> LibraryResult<FragmentHeader> {
    let flags = box_flags(data)?;
    let mut at = 8;
    if flags & TFHD_BASE_DATA_OFFSET != 0 {
        at += 8;
    }
    if flags & TFHD_DESCRIPTION_INDEX != 0 {
        at += 4;
    }
    let default_duration = if flags & TFHD_DEFAULT_DURATION != 0 {
        Some(be_u32(data, at)?)
    } else {
        None
    };
    Ok(FragmentHeader {
        track_id: be_u32(data, 4)?,
        default_duration,
    })
}

fn tfdt_time(data: &[u8]) -> LibraryResult<u64> {
    match data.first() {
        Some(1) => be_u64(data, 4),
        _ => Ok(u64::from(be_u32(data, 4)?)),
    }
}

fn trun_totals(data: &[u8], default_duration: u32) -> LibraryResult<(u64, u64)> {
    let flags = box_flags(data)?;
    let count = u64::from(be_u32(data, 4)?);
    if flags & TRUN_SAMPLE_DURATION == 0 {
        return Ok((count, count * u64::from(default_duration)));
    }
    let mut at = 8;
    if flags & TRUN_DATA_OFFSET != 0 {
        at += 4;
    }
    if flags & TRUN_FIRST_FLAGS != 0 {
        at += 4;
    }
    let stride = TRUN_SAMPLE_FIELDS
        .iter()
        .filter(|field| flags & **field != 0)
        .count()
        * 4;
    let mut ticks = 0_u64;
    for index in 0..count as usize {
        ticks += u64::from(be_u32(data, at + index * stride)?);
    }
    Ok((count, ticks))
}

fn add_traf(
    totals: &mut FragmentTotals,
    traf: &[u8],
    track_id: u32,
    trex_duration: u32,
) -> LibraryResult<()> {
    let tfhd = iso_find(traf, b"tfhd")?.ok_or_else(|| video_unreadable("fragment has no tfhd"))?;
    let header = parse_tfhd(tfhd)?;
    if header.track_id != track_id {
        return Ok(());
    }
    let default_duration = header.default_duration.unwrap_or(trex_duration);
    let mut end = match iso_find(traf, b"tfdt")? {
        Some(tfdt) => tfdt_time(tfdt)?,
        None => totals.end,
    };
    for entry in iso_children(traf)? {
        if &entry.kind == b"trun" {
            let (count, ticks) = trun_totals(entry.payload, default_duration)?;
            end = end.saturating_add(ticks);
            totals.samples += count;
        }
    }
    totals.end = totals.end.max(end);
    Ok(())
}

fn fragment_totals(
    moov: &[u8],
    fragments: &[Vec<u8>],
    track_id: u32,
) -> LibraryResult<FragmentTotals> {
    let trex_duration = trex_default_duration(moov, track_id)?;
    let mut totals = FragmentTotals { end: 0, samples: 0 };
    for moof in fragments {
        for entry in iso_children(moof)? {
            if &entry.kind == b"traf" {
                add_traf(&mut totals, entry.payload, track_id, trex_duration)?;
            }
        }
    }
    Ok(totals)
}

fn parse_track(data: &[u8]) -> LibraryResult<Option<VideoTrack>> {
    let mdia = match iso_find(data, b"mdia")? {
        Some(value) => value,
        None => return Ok(None),
    };
    let hdlr = iso_find(mdia, b"hdlr")?.ok_or_else(|| video_unreadable("track has no handler"))?;
    if hdlr.len() < 12 || &hdlr[8..12] != b"vide" {
        return Ok(None);
    }
    let tkhd =
        iso_find(data, b"tkhd")?.ok_or_else(|| video_unreadable("video track has no tkhd"))?;
    let (width, height, rotated) = tkhd_dimensions(tkhd)?;
    let track_id = tkhd_track_id(tkhd)?;
    let mdhd =
        iso_find(mdia, b"mdhd")?.ok_or_else(|| video_unreadable("video track has no mdhd"))?;
    let (scale, duration) = iso_time(mdhd)?;
    let samples = iso_find(mdia, b"minf")?
        .and_then(|minf| iso_find(minf, b"stbl").ok().flatten())
        .and_then(|stbl| iso_find(stbl, b"stts").ok().flatten())
        .map(stts_samples)
        .transpose()?;
    let (width, height) = if rotated {
        (height, width)
    } else {
        (width, height)
    };
    Ok(Some(VideoTrack {
        width,
        height,
        scale,
        duration,
        samples,
        track_id,
    }))
}

fn tkhd_dimensions(data: &[u8]) -> LibraryResult<(u32, u32, bool)> {
    let version = *data
        .first()
        .ok_or_else(|| video_unreadable("truncated tkhd"))?;
    let (matrix, dimensions) = match version {
        0 => (40, 76),
        1 => (52, 88),
        _ => return Err(video_unreadable("unknown tkhd version")),
    };
    if data.len() < dimensions + 8 {
        return Err(video_unreadable("truncated tkhd"));
    }
    let a = i32::from_be_bytes(data[matrix..matrix + 4].try_into().unwrap());
    let b = i32::from_be_bytes(data[matrix + 4..matrix + 8].try_into().unwrap());
    let c = i32::from_be_bytes(data[matrix + 12..matrix + 16].try_into().unwrap());
    let d = i32::from_be_bytes(data[matrix + 16..matrix + 20].try_into().unwrap());
    let rotated = a == 0 && d == 0 && (b.abs() == 0x0001_0000 || c.abs() == 0x0001_0000);
    Ok((
        u32::from_be_bytes(data[dimensions..dimensions + 4].try_into().unwrap()) >> 16,
        u32::from_be_bytes(data[dimensions + 4..dimensions + 8].try_into().unwrap()) >> 16,
        rotated,
    ))
}

fn stts_samples(data: &[u8]) -> LibraryResult<u64> {
    if data.len() < 8 {
        return Err(video_unreadable("truncated stts"));
    }
    let count = u32::from_be_bytes(data[4..8].try_into().unwrap()) as usize;
    if data.len() < 8 + count.saturating_mul(8) {
        return Err(video_unreadable("truncated stts entries"));
    }
    Ok((0..count)
        .map(|index| {
            u64::from(u32::from_be_bytes(
                data[8 + index * 8..12 + index * 8].try_into().unwrap(),
            ))
        })
        .sum())
}

fn fps(samples: u64, scale: u64, duration: u64) -> Option<f64> {
    if samples == 0 || scale == 0 || duration == 0 {
        return None;
    }
    let value = ((samples as f64 * scale as f64 / duration as f64) * 100.0).round() / 100.0;
    (value.is_finite() && value > 0.0 && value <= 1000.0).then_some(value)
}

fn probe_ebml(file: &mut File) -> LibraryResult<VideoInfo> {
    file.seek(SeekFrom::Start(0))?;
    let mut data = Vec::new();
    file.take(MAX_EBML_BYTES as u64).read_to_end(&mut data)?;
    let segment =
        ebml_find(&data, 0x1853_8067)?.ok_or_else(|| video_unreadable("video has no Segment"))?;
    let info =
        ebml_find(segment, 0x1549_a966)?.ok_or_else(|| video_unreadable("video has no Info"))?;
    let tracks =
        ebml_find(segment, 0x1654_ae6b)?.ok_or_else(|| video_unreadable("video has no Tracks"))?;
    let scale = ebml_uint(ebml_find(info, 0x002a_d7b1)?.unwrap_or(&[])).unwrap_or(1_000_000);
    let duration = ebml_float(
        ebml_find(info, 0x4489)?.ok_or_else(|| video_unreadable("video has no Duration"))?,
    )?;
    let track = ebml_children(tracks)?
        .into_iter()
        .find(|entry| entry.0 == 0xae)
        .map(|entry| entry.1)
        .ok_or_else(|| video_unreadable("video has no track"))?;
    if ebml_uint(ebml_find(track, 0x83)?.unwrap_or(&[])) != Some(1) {
        return Err(video_unreadable("video has no video track"));
    }
    let video =
        ebml_find(track, 0xe0)?.ok_or_else(|| video_unreadable("video track has no dimensions"))?;
    let width =
        ebml_uint(ebml_find(video, 0xb0)?.ok_or_else(|| video_unreadable("video has no width"))?)
            .ok_or_else(|| video_unreadable("invalid video width"))? as u32;
    let height =
        ebml_uint(ebml_find(video, 0xba)?.ok_or_else(|| video_unreadable("video has no height"))?)
            .ok_or_else(|| video_unreadable("invalid video height"))? as u32;
    let fps = ebml_find(track, 0x0023_e383)?
        .and_then(ebml_uint)
        .and_then(|nanos| {
            let value = ((1_000_000_000_f64 / nanos as f64) * 100.0).round() / 100.0;
            (value.is_finite() && value > 0.0 && value <= 1000.0).then_some(value)
        });
    Ok(VideoInfo {
        duration_ms: (duration * scale as f64 / 1_000_000.0).round() as i64,
        width,
        height,
        fps,
    })
}

fn ebml_children(data: &[u8]) -> LibraryResult<Vec<(u32, &[u8])>> {
    let mut offset = 0;
    let mut output = Vec::new();
    while offset < data.len() {
        let (id, id_len) = ebml_vint(&data[offset..], false)
            .ok_or_else(|| video_unreadable("truncated EBML id"))?;
        offset += id_len;
        let (size, size_len) = ebml_vint(&data[offset..], true)
            .ok_or_else(|| video_unreadable("truncated EBML size"))?;
        offset += size_len;
        let end = if size == u64::MAX {
            data.len()
        } else {
            offset
                .checked_add(size as usize)
                .filter(|end| *end <= data.len())
                .ok_or_else(|| video_unreadable("invalid EBML size"))?
        };
        output.push((id as u32, &data[offset..end]));
        offset = end;
    }
    Ok(output)
}

fn ebml_find(data: &[u8], wanted: u32) -> LibraryResult<Option<&[u8]>> {
    for (id, value) in ebml_children(data)? {
        if id == wanted {
            return Ok(Some(value));
        }
    }
    Ok(None)
}

fn ebml_vint(data: &[u8], clear_marker: bool) -> Option<(u64, usize)> {
    let first = *data.first()?;
    let length = (first.leading_zeros() + 1) as usize;
    if length > 8 || data.len() < length {
        return None;
    }
    let mut value = if clear_marker {
        u64::from(first & (0xff >> length))
    } else {
        u64::from(first)
    };
    for byte in &data[1..length] {
        value = value << 8 | u64::from(*byte);
    }
    if clear_marker && value == (1_u64 << (7 * length)) - 1 {
        value = u64::MAX;
    }
    Some((value, length))
}

fn ebml_uint(data: &[u8]) -> Option<u64> {
    if data.is_empty() || data.len() > 8 {
        return None;
    }
    Some(
        data.iter()
            .fold(0_u64, |value, byte| value << 8 | u64::from(*byte)),
    )
}

fn ebml_float(data: &[u8]) -> LibraryResult<f64> {
    match data.len() {
        4 => Ok(f32::from_be_bytes(data.try_into().unwrap()) as f64),
        8 => Ok(f64::from_be_bytes(data.try_into().unwrap())),
        _ => Err(video_unreadable("invalid EBML duration")),
    }
}

pub const FRAME_SECOND: i64 = 1;
const JPEG_MAGIC: [u8; 3] = [0xff, 0xd8, 0xff];
const JPEG_QUALITY: &str = "3";
const SCALE_FILTER: &str =
    "scale=w='if(gt(iw,ih),min(480,iw),-2)':h='if(gt(iw,ih),-2,min(480,ih))'";
const STDERR_DETAIL_LIMIT: usize = 400;

pub fn extract_poster(video: &Path, duration_ms: i64) -> LibraryResult<Vec<u8>> {
    let ffmpeg = sidecar_path()?;
    let mut failure = video_unreadable("ffmpeg produced no frame");
    for seconds in seek_candidates(duration_ms) {
        match run_ffmpeg(&ffmpeg, video, seconds) {
            Ok(bytes) => return Ok(bytes),
            Err(error) => failure = error,
        }
    }
    Err(failure)
}

fn seek_candidates(duration_ms: i64) -> Vec<i64> {
    if duration_ms > FRAME_SECOND * 1_000 {
        vec![FRAME_SECOND, 0]
    } else {
        vec![0]
    }
}

pub fn sidecar_path() -> LibraryResult<PathBuf> {
    ffmpeg::sidecar_path().map_err(video_unreadable)
}

fn run_ffmpeg(ffmpeg: &Path, video: &Path, seconds: i64) -> LibraryResult<Vec<u8>> {
    let mut command = Command::new(ffmpeg);
    command
        .args(["-v", "error", "-nostdin", "-ss"])
        .arg(seconds.to_string())
        .arg("-i")
        .arg(video)
        .args(["-frames:v", "1", "-an", "-sn", "-vf", SCALE_FILTER])
        .args([
            "-q:v",
            JPEG_QUALITY,
            "-f",
            "image2pipe",
            "-c:v",
            "mjpeg",
            "pipe:1",
        ])
        .stdin(Stdio::null());
    hide_window(&mut command);
    let output = command.output()?;
    if output.status.success() && output.stdout.starts_with(&JPEG_MAGIC) {
        return Ok(output.stdout);
    }
    Err(video_unreadable(failure_detail(&output)))
}

fn failure_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail: String = stderr.trim().chars().take(STDERR_DETAIL_LIMIT).collect();
    if detail.is_empty() {
        format!("ffmpeg returned no frame ({})", output.status)
    } else {
        format!("ffmpeg failed: {detail}")
    }
}

#[cfg(test)]
#[path = "../../../test/features/library/videos.test.rs"]
mod tests;
