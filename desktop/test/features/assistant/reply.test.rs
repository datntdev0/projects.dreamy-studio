use super::*;
use crate::testing::assistant::FakeNovels;

fn cite(novel_id: i64, chapter: i64, p: i64, quote: &str) -> AssistantCitation {
    AssistantCitation {
        novel_id,
        chapter,
        p,
        quote: quote.to_string(),
    }
}

fn novels() -> FakeNovels {
    FakeNovels::new().with_novel(1, "First").with_chapter(
        1,
        3,
        "Third",
        &["The wolf howled.", "  Rain fell all night.  "],
    )
}

#[test]
fn parse_strips_the_block_and_reads_citations() {
    let raw = "The wolf appears.\n\n<citations>[{\"novelId\":1,\"chapter\":3,\"p\":1,\"quote\":\"The wolf howled.\"}]</citations>\n";
    let (text, citations) = parse(raw);
    assert_eq!(text, "The wolf appears.");
    assert_eq!(citations, vec![cite(1, 3, 1, "The wolf howled.")]);
}

#[test]
fn parse_without_a_block_returns_trimmed_text() {
    let (text, citations) = parse("  Just an answer.\n");
    assert_eq!(text, "Just an answer.");
    assert!(citations.is_empty());
}

#[test]
fn parse_malformed_block_keeps_text_and_drops_citations() {
    let (text, citations) = parse("Answer.\n<citations>[{\"novelId\":1,</citations>");
    assert_eq!(text, "Answer.");
    assert!(citations.is_empty());
}

#[test]
fn parse_non_array_block_gives_no_citations() {
    let (text, citations) = parse("Answer.<citations>{\"novelId\":1}</citations>");
    assert_eq!(text, "Answer.");
    assert!(citations.is_empty());
}

#[test]
fn parse_skips_entries_that_do_not_fit() {
    let raw = "A<citations>[{\"novelId\":1,\"chapter\":3,\"p\":1,\"quote\":\"q\"},{\"bad\":true}]</citations>";
    let (_, citations) = parse(raw);
    assert_eq!(citations, vec![cite(1, 3, 1, "q")]);
}

#[test]
fn parse_accepts_a_fenced_block() {
    let raw = "A<citations>\n```json\n[{\"novelId\":1,\"chapter\":3,\"p\":2,\"quote\":\"q\"}]\n```\n</citations>";
    let (text, citations) = parse(raw);
    assert_eq!(text, "A");
    assert_eq!(citations, vec![cite(1, 3, 2, "q")]);
}

#[test]
fn parse_handles_crlf() {
    let raw = "Line one.\r\nLine two.\r\n\r\n<citations>\r\n[{\"novelId\":2,\"chapter\":1,\"p\":4,\"quote\":\"q\"}]\r\n</citations>\r\n";
    let (text, citations) = parse(raw);
    assert_eq!(text, "Line one.\nLine two.");
    assert_eq!(citations, vec![cite(2, 1, 4, "q")]);
}

#[test]
fn parse_uses_the_last_block_and_strips_all() {
    let raw = "A<citations>[{\"novelId\":1,\"chapter\":1,\"p\":1,\"quote\":\"old\"}]</citations> B\n<citations>[{\"novelId\":1,\"chapter\":1,\"p\":1,\"quote\":\"new\"}]</citations>";
    let (text, citations) = parse(raw);
    assert_eq!(text, "A B");
    assert_eq!(citations, vec![cite(1, 1, 1, "new")]);
}

#[test]
fn parse_leaves_an_unclosed_tag_in_the_text() {
    let (text, citations) = parse("Answer <citations>[");
    assert_eq!(text, "Answer <citations>[");
    assert!(citations.is_empty());
}

#[test]
fn verify_keeps_exact_quotes() {
    let kept = verify(
        vec![
            cite(1, 3, 1, "wolf howled"),
            cite(1, 3, 2, "Rain fell all night."),
        ],
        &novels(),
    );
    assert_eq!(kept.len(), 2);
}

#[test]
fn verify_accepts_a_quote_after_trimming() {
    let kept = verify(vec![cite(1, 3, 1, "  The wolf howled. ")], &novels());
    assert_eq!(kept.len(), 1);
}

#[test]
fn verify_drops_a_wrong_paragraph() {
    assert!(verify(vec![cite(1, 3, 2, "The wolf howled.")], &novels()).is_empty());
    assert!(verify(vec![cite(1, 3, 9, "The wolf howled.")], &novels()).is_empty());
    assert!(verify(vec![cite(1, 3, 0, "The wolf howled.")], &novels()).is_empty());
}

#[test]
fn verify_drops_a_wrong_chapter() {
    assert!(verify(vec![cite(1, 4, 1, "The wolf howled.")], &novels()).is_empty());
}

#[test]
fn verify_drops_an_unknown_novel() {
    assert!(verify(vec![cite(2, 3, 1, "The wolf howled.")], &novels()).is_empty());
}

#[test]
fn verify_drops_invented_or_empty_quotes() {
    let kept = verify(
        vec![cite(1, 3, 1, "The dragon roared."), cite(1, 3, 1, "   ")],
        &novels(),
    );
    assert!(kept.is_empty());
}

#[test]
fn verify_keeps_order_and_only_valid_entries() {
    let kept = verify(
        vec![
            cite(1, 3, 2, "Rain fell"),
            cite(1, 3, 1, "nope"),
            cite(1, 3, 1, "The wolf"),
        ],
        &novels(),
    );
    assert_eq!(
        kept,
        vec![cite(1, 3, 2, "Rain fell"), cite(1, 3, 1, "The wolf")]
    );
}
