from dataclasses import dataclass


@dataclass(frozen=True)
class Cue:
    text: str
    start_ms: int
    end_ms: int


def srt_time(total_ms: int) -> str:
    hours, rest = divmod(total_ms, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    seconds, millis = divmod(rest, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{millis:03}"


def srt_block(index: int, cue: Cue) -> str:
    return f"{index}\n{srt_time(cue.start_ms)} --> {srt_time(cue.end_ms)}\n{cue.text}\n"


def build_srt(cues: list[Cue]) -> str:
    return "\n".join(srt_block(index, cue) for index, cue in enumerate(cues, start=1))
