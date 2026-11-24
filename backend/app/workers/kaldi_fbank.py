import numpy as np

FRAME_LENGTH_MS = 25.0
FRAME_SHIFT_MS = 10.0
PREEMPHASIS = 0.97
POVEY_POWER = 0.85
LOW_FREQUENCY = 20.0
EPSILON = float(np.finfo(np.float32).eps)


def mel_scale(frequency: np.ndarray | float) -> np.ndarray:
    return 1127.0 * np.log1p(np.asarray(frequency, dtype=np.float64) / 700.0)


def padded_size(frame_length: int) -> int:
    return 1 << (frame_length - 1).bit_length()


def povey_window(frame_length: int) -> np.ndarray:
    phase = 2.0 * np.pi * np.arange(frame_length) / (frame_length - 1)
    return (0.5 - 0.5 * np.cos(phase)) ** POVEY_POWER


def mel_banks(n_mels: int, fft_size: int, sample_rate: int) -> np.ndarray:
    low = mel_scale(LOW_FREQUENCY)
    delta = (mel_scale(sample_rate / 2.0) - low) / (n_mels + 1)
    edges = low + delta * np.arange(n_mels + 2)
    left, center, right = edges[:-2, None], edges[1:-1, None], edges[2:, None]
    mel = mel_scale(np.arange(fft_size // 2) * sample_rate / fft_size)[None, :]
    rising = (mel - left) / (center - left)
    falling = (right - mel) / (right - center)
    weights = np.where(mel <= center, rising, falling)
    weights = np.where((mel > left) & (mel < right), weights, 0.0)
    return np.pad(weights, ((0, 0), (0, 1)))


def split_frames(wav: np.ndarray, frame_length: int, frame_shift: int) -> np.ndarray:
    count = 1 + (len(wav) - frame_length) // frame_shift
    starts = np.arange(count)[:, None] * frame_shift
    return wav[starts + np.arange(frame_length)[None, :]]


def preemphasize(frames: np.ndarray) -> np.ndarray:
    previous = np.concatenate([frames[:, :1], frames[:, :-1]], axis=1)
    return frames - PREEMPHASIS * previous


def dithered(frames: np.ndarray, dither: float) -> np.ndarray:
    if dither == 0.0:
        return frames
    return frames + dither * np.random.default_rng().standard_normal(frames.shape)


def kaldi_fbank(wav: np.ndarray, sample_rate: int, n_mels: int, dither: float) -> np.ndarray:
    frame_length = int(sample_rate * FRAME_LENGTH_MS / 1000)
    frame_shift = int(sample_rate * FRAME_SHIFT_MS / 1000)
    if len(wav) < frame_length:
        raise ValueError(
            f"Audio too short for fbank ({len(wav)} samples @ {sample_rate} Hz "
            f"< one {FRAME_LENGTH_MS:.0f} ms frame)."
        )
    frames = split_frames(np.asarray(wav, dtype=np.float64), frame_length, frame_shift)
    frames = dithered(frames, dither)
    frames = frames - frames.mean(axis=1, keepdims=True)
    frames = preemphasize(frames) * povey_window(frame_length)
    fft_size = padded_size(frame_length)
    power = np.abs(np.fft.rfft(frames, n=fft_size, axis=1)) ** 2
    energies = power @ mel_banks(n_mels, fft_size, sample_rate).T
    return np.log(np.maximum(energies, EPSILON)).astype(np.float32)
