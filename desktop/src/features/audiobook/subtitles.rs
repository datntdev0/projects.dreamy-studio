use std::fmt::Write;

const ARROW: &str = "-->";
const BOM: char = '\u{feff}';

#[derive(Debug, Clone, PartialEq)]
pub struct Cue {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

impl Cue {
    pub fn shifted(&self, offset: f64) -> Self {
        Self {
            start: self.start + offset,
            end: self.end + offset,
            text: self.text.clone(),
        }
    }

    pub fn scaled(&self, factor: f64) -> Self {
        Self {
            start: self.start * factor,
            end: self.end * factor,
            text: self.text.clone(),
        }
    }
}

pub fn srt_text(cues: &[Cue]) -> String {
    let mut out = String::new();
    for (index, cue) in cues.iter().enumerate() {
        let _ = write!(
            out,
            "{}\n{} --> {}\n{}\n\n",
            index + 1,
            srt_time(cue.start),
            srt_time(cue.end),
            cue.text.trim()
        );
    }
    out
}

pub fn srt_time(seconds: f64) -> String {
    let total = (seconds.max(0.0) * 1000.0).round() as u64;
    let (hours, rest) = (total / 3_600_000, total % 3_600_000);
    let (minutes, rest) = (rest / 60_000, rest % 60_000);
    format!(
        "{hours:02}:{minutes:02}:{:02},{:03}",
        rest / 1000,
        rest % 1000
    )
}

pub fn parse_srt(text: &str) -> Vec<Cue> {
    let normalized = text.trim_start_matches(BOM).replace("\r\n", "\n");
    normalized.split("\n\n").filter_map(parse_cue).collect()
}

pub fn rescale_srt(text: &str, speed: f64) -> Option<String> {
    let factor = if speed > 0.0 { 1.0 / speed } else { 1.0 };
    let cues: Vec<Cue> = parse_srt(text)
        .iter()
        .map(|cue| cue.scaled(factor))
        .collect();
    (!cues.is_empty()).then(|| srt_text(&cues))
}

fn parse_cue(chunk: &str) -> Option<Cue> {
    let mut lines = chunk.lines().skip_while(|line| !line.contains(ARROW));
    let (start, end) = parse_span(lines.next()?)?;
    let text = lines.collect::<Vec<_>>().join("\n");
    let text = text.trim();
    (!text.is_empty()).then(|| Cue {
        start,
        end,
        text: text.to_string(),
    })
}

fn parse_span(line: &str) -> Option<(f64, f64)> {
    let (start, end) = line.split_once(ARROW)?;
    let end = end.split_whitespace().next()?;
    Some((parse_time(start.trim())?, parse_time(end)?))
}

pub fn parse_time(value: &str) -> Option<f64> {
    let (clock, millis) = value.split_once([',', '.']).unwrap_or((value, "0"));
    let parts = clock
        .split(':')
        .map(|part| part.trim().parse::<u64>().ok())
        .collect::<Option<Vec<u64>>>()?;
    let [hours, minutes, seconds] = parts.as_slice() else {
        return None;
    };
    let fraction: f64 = format!("0.{}", millis.trim()).parse().ok()?;
    let millis = (fraction * 1000.0).round() as u64;
    let total = hours * 3_600_000 + minutes * 60_000 + seconds * 1000 + millis;
    Some(total as f64 / 1000.0)
}
