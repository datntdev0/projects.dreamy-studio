import { Injectable } from "@angular/core";
import { Channel, convertFileSrc, invoke as tauriInvoke } from "@tauri-apps/api/core";
import { Event as TauriEvent } from "@tauri-apps/api/event";
import { DragDropEvent, getCurrentWebview } from "@tauri-apps/api/webview";
import { DesktopIpcError } from "./desktop-ipc-error";

export type DesktopDragDropEvent = DragDropEvent;

export type DesktopUnlisten = () => void;

function noop(): void {
  return;
}

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

  channel<TMessage>(onMessage: (message: TMessage) => void): Channel<TMessage> {
    return new Channel<TMessage>(onMessage);
  }

  mediaUrl(scheme: string, path: string): string {
    return convertFileSrc(path, scheme);
  }

  async onDragDrop(
    handler: (event: DesktopDragDropEvent) => void,
  ): Promise<DesktopUnlisten> {
    try {
      return await getCurrentWebview().onDragDropEvent(this.dropHandler(handler));
    } catch {
      return noop;
    }
  }

  private dropHandler(
    handler: (event: DesktopDragDropEvent) => void,
  ): (event: TauriEvent<DragDropEvent>) => void {
    return (event) => handler(event.payload);
  }
}
