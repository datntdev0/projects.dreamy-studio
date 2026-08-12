use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryResult;
use std::fs::File;
use std::io::Read;
use std::io::Seek;
use std::io::SeekFrom;
use std::path::Path;

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
        return Err(unreadable("video extension and file content do not match"));
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
        return Err(unreadable("video is missing valid duration or dimensions"));
    }
    Ok(info)
}

fn probe_iso(file: &mut File) -> LibraryResult<VideoInfo> {
    let length = file.metadata()?.len();
    let mut offset = 0_u64;
    let mut moov = None;
    while offset < length {
        file.seek(SeekFrom::Start(offset))?;
        let Some((size, kind, header)) = read_box_header(file, length - offset)? else {
            break;
        };
        if size < header || size > length - offset {
            return Err(unreadable("invalid ISO box size"));
        }
        if &kind == b"moov" {
            let payload_len = size - header;
            if payload_len > MAX_MOOV_BYTES {
                return Err(unreadable("moov box is too large"));
            }
            let mut data = vec![0; payload_len as usize];
            file.read_exact(&mut data)?;
            moov = Some(data);
            break;
        }
        offset = offset
            .checked_add(size)
            .ok_or_else(|| unreadable("invalid ISO box offset"))?;
    }
    let moov = moov.ok_or_else(|| unreadable("video has no moov box"))?;
    parse_moov(&moov)
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
            return Err(unreadable("truncated large ISO box"));
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
            return Err(unreadable("truncated ISO child box"));
        }
        let mut size = u64::from(u32::from_be_bytes(data[..4].try_into().unwrap()));
        let kind = data[4..8].try_into().unwrap();
        let mut header = 8_usize;
        if size == 1 {
            if data.len() < 16 {
                return Err(unreadable("truncated large ISO child box"));
            }
            size = u64::from_be_bytes(data[8..16].try_into().unwrap());
            header = 16;
        } else if size == 0 {
            size = data.len() as u64;
        }
        if size < header as u64 || size > data.len() as u64 {
            return Err(unreadable("invalid ISO child size"));
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

fn parse_moov(data: &[u8]) -> LibraryResult<VideoInfo> {
    let mvhd = iso_find(data, b"mvhd")?.ok_or_else(|| unreadable("video has no mvhd"))?;
    let (movie_scale, mut duration) = iso_time(mvhd)?;
    if duration == 0 {
        if let Some(mvex) = iso_find(data, b"mvex")? {
            if let Some(mehd) = iso_find(mvex, b"mehd")? {
                duration = mehd_duration(mehd)?;
            }
        }
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
    let (mut width, mut height, track_scale, track_duration, samples) =
        video.ok_or_else(|| unreadable("video has no video track"))?;
    if duration == 0 {
        duration = track_duration;
    }
    let duration_ms = duration
        .checked_mul(1000)
        .ok_or_else(|| unreadable("video duration overflows"))?
        / movie_scale.max(1);
    let fps = samples.and_then(|count| fps(count, track_scale, track_duration));
    if width == 0 || height == 0 {
        return Err(unreadable("video has invalid dimensions"));
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
        .ok_or_else(|| unreadable("truncated ISO time box"))?;
    match version {
        0 if data.len() >= 20 => Ok((
            u64::from(u32::from_be_bytes(data[12..16].try_into().unwrap())),
            u64::from(u32::from_be_bytes(data[16..20].try_into().unwrap())),
        )),
        1 if data.len() >= 32 => Ok((
            u64::from(u32::from_be_bytes(data[20..24].try_into().unwrap())),
            u64::from_be_bytes(data[24..32].try_into().unwrap()),
        )),
        _ => Err(unreadable("truncated ISO time box")),
    }
}

fn mehd_duration(data: &[u8]) -> LibraryResult<u64> {
    match data.first().copied() {
        Some(0) if data.len() >= 8 => Ok(u64::from(u32::from_be_bytes(
            data[4..8].try_into().unwrap(),
        ))),
        Some(1) if data.len() >= 12 => Ok(u64::from_be_bytes(data[4..12].try_into().unwrap())),
        _ => Err(unreadable("truncated mehd box")),
    }
}

fn parse_track(data: &[u8]) -> LibraryResult<Option<(u32, u32, u64, u64, Option<u64>)>> {
    let mdia = match iso_find(data, b"mdia")? {
        Some(value) => value,
        None => return Ok(None),
    };
    let hdlr = iso_find(mdia, b"hdlr")?.ok_or_else(|| unreadable("track has no handler"))?;
    if hdlr.len() < 12 || &hdlr[8..12] != b"vide" {
        return Ok(None);
    }
    let tkhd = iso_find(data, b"tkhd")?.ok_or_else(|| unreadable("video track has no tkhd"))?;
    let (width, height, rotated) = tkhd_dimensions(tkhd)?;
    let mdhd = iso_find(mdia, b"mdhd")?.ok_or_else(|| unreadable("video track has no mdhd"))?;
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
    Ok(Some((width, height, scale, duration, samples)))
}

fn tkhd_dimensions(data: &[u8]) -> LibraryResult<(u32, u32, bool)> {
    let version = *data.first().ok_or_else(|| unreadable("truncated tkhd"))?;
    let (matrix, dimensions) = match version {
        0 => (40, 76),
        1 => (52, 88),
        _ => return Err(unreadable("unknown tkhd version")),
    };
    if data.len() < dimensions + 8 {
        return Err(unreadable("truncated tkhd"));
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
        return Err(unreadable("truncated stts"));
    }
    let count = u32::from_be_bytes(data[4..8].try_into().unwrap()) as usize;
    if data.len() < 8 + count.saturating_mul(8) {
        return Err(unreadable("truncated stts entries"));
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
        ebml_find(&data, 0x1853_8067)?.ok_or_else(|| unreadable("video has no Segment"))?;
    let info = ebml_find(segment, 0x1549_a966)?.ok_or_else(|| unreadable("video has no Info"))?;
    let tracks =
        ebml_find(segment, 0x1654_ae6b)?.ok_or_else(|| unreadable("video has no Tracks"))?;
    let scale = ebml_uint(ebml_find(info, 0x002a_d7b1)?.unwrap_or(&[])).unwrap_or(1_000_000);
    let duration =
        ebml_float(ebml_find(info, 0x4489)?.ok_or_else(|| unreadable("video has no Duration"))?)?;
    let track = ebml_children(tracks)?
        .into_iter()
        .find(|entry| entry.0 == 0xae)
        .map(|entry| entry.1)
        .ok_or_else(|| unreadable("video has no track"))?;
    if ebml_uint(ebml_find(track, 0x83)?.unwrap_or(&[])) != Some(1) {
        return Err(unreadable("video has no video track"));
    }
    let video =
        ebml_find(track, 0xe0)?.ok_or_else(|| unreadable("video track has no dimensions"))?;
    let width = ebml_uint(ebml_find(video, 0xb0)?.ok_or_else(|| unreadable("video has no width"))?)
        .ok_or_else(|| unreadable("invalid video width"))? as u32;
    let height =
        ebml_uint(ebml_find(video, 0xba)?.ok_or_else(|| unreadable("video has no height"))?)
            .ok_or_else(|| unreadable("invalid video height"))? as u32;
    let fps = ebml_find(track, 0x23e3_83)?
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
        let (id, id_len) =
            ebml_vint(&data[offset..], false).ok_or_else(|| unreadable("truncated EBML id"))?;
        offset += id_len;
        let (size, size_len) =
            ebml_vint(&data[offset..], true).ok_or_else(|| unreadable("truncated EBML size"))?;
        offset += size_len;
        let end = if size == u64::MAX {
            data.len()
        } else {
            offset
                .checked_add(size as usize)
                .filter(|end| *end <= data.len())
                .ok_or_else(|| unreadable("invalid EBML size"))?
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
        _ => Err(unreadable("invalid EBML duration")),
    }
}

fn unreadable(detail: impl Into<String>) -> LibraryError {
    LibraryError::new(LibraryErrorCode::VideoUnreadable, detail)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

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
}
