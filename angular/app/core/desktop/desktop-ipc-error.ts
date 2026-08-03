export class DesktopIpcError extends Error {
  constructor(
    public readonly command: string,
    cause: unknown,
  ) {
    super(`Desktop command "${command}" failed`, { cause });
    this.name = "DesktopIpcError";
  }
}
