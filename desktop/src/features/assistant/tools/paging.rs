use serde_json::Value;
use serde_json::json;

pub const PAGE_PARAGRAPHS: usize = 200;
pub(super) const NEXT_NOTE: &str =
    "Results come in pages: while `next` is not null, call again with `from` set to `next`.";

pub(super) fn page_bounds(total: usize, from: Option<i64>, to: Option<i64>) -> (usize, usize) {
    if total == 0 {
        return (1, 0);
    }
    let start = clamp_position(from.unwrap_or(1), 1, total);
    let wanted = clamp_position(to.unwrap_or(total as i64), start, total);
    (start, wanted.min(start + PAGE_PARAGRAPHS - 1))
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
