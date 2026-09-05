const SAMPLE_RATE = 8000;
const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;
const PCM_FORMAT = 1;
const MONO = 1;
const BITS_PER_SAMPLE = 16;
const FORMAT_CHUNK_BYTES = 16;

function writeText(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

export function silenceWav(seconds: number): ArrayBuffer {
  const samples = Math.max(1, Math.round(Math.max(0, seconds) * SAMPLE_RATE));
  const dataBytes = samples * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  writeText(view, 0, 'RIFF');
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  writeText(view, 8, 'WAVE');
  writeText(view, 12, 'fmt ');
  view.setUint32(16, FORMAT_CHUNK_BYTES, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, MONO, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeText(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  return buffer;
}
