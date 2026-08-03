import { Injectable } from "@angular/core";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { DesktopIpcError } from "./desktop-ipc-error";

@Injectable({ providedIn: "root" })
export class DesktopIpcService {
  async invoke<TResult>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<TResult> {
    try {
      return await tauriInvoke<TResult>(command, args);
    } catch (cause) {
      throw new DesktopIpcError(command, cause);
    }
  }
}
