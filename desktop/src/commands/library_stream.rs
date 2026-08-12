use crate::features::library::models::StreamKind;
use crate::features::library::service::LibraryService;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::http::Request;
use tauri::http::Response;
use tauri::http::StatusCode;
use tauri::http::header::RANGE;

pub fn parse_range(header: &str, total: u64) -> Option<(u64, u64)> {
    let value = header.trim().strip_prefix("bytes=")?;
    if value.contains(',') {
        return None;
    }
    let (start, end) = value.split_once('-')?;
    if start.is_empty() {
        let suffix = end.parse::<u64>().ok()?;
        if suffix == 0 || total == 0 {
            return None;
        }
        let length = suffix.min(total);
        return Some((total - length, total - 1));
    }
    let start = start.parse::<u64>().ok()?;
    if start >= total {
        return None;
    }
    let end = if end.is_empty() {
        total - 1
    } else {
        end.parse::<u64>().ok()?.min(total - 1)
    };
    (end >= start).then_some((start, end))
}

pub fn respond(app: &AppHandle, request: Request<Vec<u8>>, kind: StreamKind) -> Response<Vec<u8>> {
    if request.method() == tauri::http::Method::OPTIONS {
        return options();
    }
    let Some(id) = request
        .uri()
        .path()
        .strip_prefix('/')
        .and_then(|path| path.parse::<i64>().ok())
    else {
        return not_found();
    };
    let service = app.state::<LibraryService>();
    let session = app.state::<WorkspaceSession>();
    let Ok(workspace) = service.open(&session) else {
        return not_found();
    };
    let Ok(first) = workspace.stream(kind, id, None) else {
        return not_found();
    };
    let range = match request.headers().get(RANGE) {
        Some(header) => match header
            .to_str()
            .ok()
            .and_then(|value| parse_range(value, first.total))
        {
            Some(range) => Some(range),
            None => return range_not_satisfiable(first.total),
        },
        None => None,
    };
    let chunk = match range {
        Some((start, end)) => match workspace.stream(kind, id, Some((start, Some(end)))) {
            Ok(chunk) => chunk,
            Err(_) => return not_found(),
        },
        None => first,
    };
    let mut response = Response::builder()
        .status(if range.is_some() {
            StatusCode::PARTIAL_CONTENT
        } else {
            StatusCode::OK
        })
        .header("Accept-Ranges", "bytes")
        .header("Content-Type", chunk.mime)
        .header("Content-Length", chunk.bytes.len().to_string())
        .header("Access-Control-Allow-Origin", "*")
        .header(
            "Access-Control-Expose-Headers",
            "Content-Range, Accept-Ranges, Content-Length",
        );
    if range.is_some() {
        response = response.header(
            "Content-Range",
            format!("bytes {}-{}/{}", chunk.start, chunk.end, chunk.total),
        );
    }
    response
        .body(if request.method() == tauri::http::Method::HEAD {
            Vec::new()
        } else {
            chunk.bytes
        })
        .expect("stream response is valid")
}

fn options() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        .header("Access-Control-Allow-Headers", "Range")
        .body(Vec::new())
        .expect("options response is valid")
}

fn not_found() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .expect("sound response is valid")
}

fn range_not_satisfiable(total: u64) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::RANGE_NOT_SATISFIABLE)
        .header("Accept-Ranges", "bytes")
        .header("Content-Range", format!("bytes */{total}"))
        .header("Access-Control-Allow-Origin", "*")
        .header(
            "Access-Control-Expose-Headers",
            "Content-Range, Accept-Ranges, Content-Length",
        )
        .body(Vec::new())
        .expect("sound response is valid")
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
