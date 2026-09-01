export class DesktopIpcError extends Error {
  constructor(
    public readonly command: string,
    cause: unknown,
  ) {
    super(`Desktop command "${command}" failed`, { cause });
    this.name = 'DesktopIpcError';
  }
}

export function ipcErrorMessage(error: unknown): string | null {
  const cause = error instanceof Error ? (error as { cause?: unknown }).cause : error;
  return typeof cause === 'string' ? cause : null;
}
