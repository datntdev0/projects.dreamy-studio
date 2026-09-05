use super::*;

fn cue(start: f64, end: f64, text: &str) -> Cue {
    Cue {
        start,
        end,
        text: text.to_string(),
    }
}

#[test]
fn cues_are_numbered_in_order() {
    let text = srt_text(&[cue(1.0, 2.0, " One "), cue(3.0, 5.25, "Two")]);

    assert_eq!(
        text,
        "1\n00:00:01,000 --> 00:00:02,000\nOne\n\n2\n00:00:03,000 --> 00:00:05,250\nTwo\n\n"
    );
    assert_eq!(srt_time(3725.5), "01:02:05,500");
    assert_eq!(srt_time(-1.0), "00:00:00,000");
}

#[test]
fn srt_text_is_parsed_back_into_cues() {
    let source = "\u{feff}1\r\n00:00:00,000 --> 00:00:01,200\r\nOne.\r\n\r\n\
                  2\r\n00:00:01,500 --> 00:00:03,000 X1:0\r\nTwo\r\nlines.\r\n\r\n\
                  3\r\nbroken\r\n\r\n4\r\n00:00:04.000 --> 00:00:05.000\r\n\r\n";

    assert_eq!(
        parse_srt(source),
        vec![cue(0.0, 1.2, "One."), cue(1.5, 3.0, "Two\nlines.")]
    );
    assert_eq!(parse_srt(""), Vec::<Cue>::new());
    assert_eq!(parse_time("01:00:02.5"), Some(3602.5));
    assert_eq!(parse_time("1:2"), None);
}

#[test]
fn parsed_cues_round_trip() {
    let cues = vec![cue(0.5, 1.0, "A"), cue(1.25, 2.0, "B")];

    assert_eq!(parse_srt(&srt_text(&cues)), cues);
}

#[test]
fn rescaling_divides_timings_by_the_speed() {
    let source = srt_text(&[cue(0.0, 1.5, "A"), cue(3.0, 6.0, "B")]);

    assert_eq!(
        rescale_srt(&source, 1.5).as_deref(),
        Some("1\n00:00:00,000 --> 00:00:01,000\nA\n\n2\n00:00:02,000 --> 00:00:04,000\nB\n\n")
    );
    assert_eq!(rescale_srt(&source, 1.0).as_deref(), Some(source.as_str()));
    assert_eq!(rescale_srt("garbage", 1.0), None);
}

#[test]
fn cues_shift_and_scale() {
    let base = cue(1.0, 2.0, "A");

    assert_eq!(base.shifted(10.0), cue(11.0, 12.0, "A"));
    assert_eq!(base.scaled(0.5), cue(0.5, 1.0, "A"));
}
