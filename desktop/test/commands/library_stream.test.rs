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
