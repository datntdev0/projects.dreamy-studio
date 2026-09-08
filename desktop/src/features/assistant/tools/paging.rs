use serde_json::Value;
use serde_json::json;

pub const PAGE_PARAGRAPHS: usize = 60;
pub const PAGE_CHARS: usize = 12_000;
pub(super) const NEXT_NOTE: &str =
    "Results come in pages: while `next` is not null, call again with `from` set to `next`.";

pub(super) fn page_bounds(sizes: &[usize], from: Option<i64>, to: Option<i64>) -> (usize, usize) {
    let total = sizes.len();
    if total == 0 {
        return (1, 0);
    }
    let start = clamp_position(from.unwrap_or(1), 1, total);
    let wanted = clamp_position(to.unwrap_or(total as i64), start, total);
    let mut end = start - 1;
    let mut chars = 0;
    for size in &sizes[start - 1..wanted] {
        if end >= start && (end - start + 1 >= PAGE_PARAGRAPHS || chars + *size > PAGE_CHARS) {
            break;
        }
        chars += *size;
        end += 1;
    }
    (start, end)
}

fn clamp_position(value: i64, low: usize, high: usize) -> usize {
    value.clamp(low as i64, high as i64) as usize
}

pub(super) fn next_position(end: usize, total: usize) -> Value {
    if end < total {
        json!(end + 1)
    } else {
        Value::Null
    }
}
