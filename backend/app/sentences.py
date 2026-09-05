import re

MAX_SENTENCE_LENGTH = 500
WHITESPACE = re.compile(r"\s+")
LINE_BREAK = re.compile(r"[\r\n]+")
SENTENCE_BREAK = re.compile(r"(?<=[.!?…;])\s+|(?<=[。！？])\s*")
SOFT_BREAKS = (",", "，", "、")


def normalize_text(text: str) -> str:
    return WHITESPACE.sub(" ", text).strip()


def break_index(sentence: str) -> int:
    window = sentence[:MAX_SENTENCE_LENGTH]
    comma = max(window.rfind(mark) for mark in SOFT_BREAKS)
    if comma > 0:
        return comma + 1
    space = window.rfind(" ")
    return space if space > 0 else MAX_SENTENCE_LENGTH


def split_long(sentence: str) -> list[str]:
    pieces: list[str] = []
    while len(sentence) > MAX_SENTENCE_LENGTH:
        cut = break_index(sentence)
        pieces.append(sentence[:cut].strip())
        sentence = sentence[cut:].strip()
    pieces.append(sentence)
    return [piece for piece in pieces if piece]


def split_line(line: str) -> list[str]:
    sentences = (normalize_text(part) for part in SENTENCE_BREAK.split(line))
    return [piece for sentence in sentences if sentence for piece in split_long(sentence)]


def split_sentences(text: str) -> list[str]:
    return [sentence for line in LINE_BREAK.split(text) for sentence in split_line(line)]
