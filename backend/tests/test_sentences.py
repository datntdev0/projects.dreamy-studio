import unittest

from app.features.speeches.sentences import MAX_SENTENCE_LENGTH, split_sentences


class SentenceTests(unittest.TestCase):
    def test_vietnamese_sentences_keep_punctuation(self):
        text = "Xin chào các bạn! Hôm nay   trời đẹp quá. Bạn có khỏe không?"
        self.assertEqual(
            split_sentences(text),
            ["Xin chào các bạn!", "Hôm nay trời đẹp quá.", "Bạn có khỏe không?"],
        )

    def test_english_terminators_and_newlines(self):
        text = "Wait… what; really?\n\nYes  it is\r\nThe end."
        self.assertEqual(
            split_sentences(text), ["Wait…", "what;", "really?", "Yes it is", "The end."]
        )

    def test_terminator_inside_word_does_not_split(self):
        self.assertEqual(split_sentences("Version 2.5 is out."), ["Version 2.5 is out."])

    def test_cjk_terminators(self):
        self.assertEqual(split_sentences("你好。今天好吗？好！"), ["你好。", "今天好吗？", "好！"])

    def test_empty_pieces_are_dropped(self):
        self.assertEqual(split_sentences(" \n . \n\n"), ["."])
        self.assertEqual(split_sentences("   "), [])

    def test_long_sentence_splits_at_last_comma(self):
        head = "a" * 300 + ","
        tail = " " + "b " * 150 + "end."
        pieces = split_sentences(head + tail)
        self.assertEqual(pieces, [head, tail.strip()])

    def test_long_sentence_splits_at_last_space(self):
        words = " ".join(["từ"] * 400)
        pieces = split_sentences(words)
        self.assertTrue(all(len(piece) <= MAX_SENTENCE_LENGTH for piece in pieces))
        self.assertEqual(" ".join(pieces), words)
        self.assertGreater(len(pieces), 1)

    def test_unbroken_text_splits_at_limit(self):
        pieces = split_sentences("x" * 1200)
        self.assertEqual([len(piece) for piece in pieces], [500, 500, 200])
