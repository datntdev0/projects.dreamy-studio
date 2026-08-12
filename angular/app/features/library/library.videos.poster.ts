import { Injectable, Injector, inject } from "@angular/core";
import { DesktopIpcService } from "../../core/desktop/desktop-ipc.service";
import { LibraryVideoService } from "./library.videos.service";
import { LibraryVideo } from "./library.videos.models";

const CAPTURE_TIMEOUT_MS = 15_000;
const MAX_POSTER_LENGTH = 480;

function ignoreError(_error: unknown): void { return; }
function canvasSize(width: number, height: number): [number, number] { const scale = Math.min(1, MAX_POSTER_LENGTH / Math.max(width, height)); return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]; }
function seekTime(video: HTMLVideoElement): number { return Math.min(1, Number.isFinite(video.duration) ? video.duration / 10 : 0); }
function base64(buffer: ArrayBuffer): string { const bytes = new Uint8Array(buffer); const chunks: string[] = []; for (let offset = 0; offset < bytes.length; offset += 8_192) { const characters: string[] = []; const end = Math.min(offset + 8_192, bytes.length); for (let index = offset; index < end; index += 1) characters.push(String.fromCharCode(bytes[index] as number)); chunks.push(characters.join("")); } return btoa(chunks.join("")); }

@Injectable({ providedIn: "root" })
export class LibraryVideoPoster {
  private readonly ipc = inject(DesktopIpcService);
  private readonly injector = inject(Injector);
  private readonly attempted = new Set<number>();
  private readonly queue: LibraryVideo[] = [];
  private capturing = false;

  enqueue(video: LibraryVideo): void {
    if (video.hasPoster || this.attempted.has(video.id)) return;
    this.attempted.add(video.id);
    this.queue.push(video);
    void this.captureNext();
  }

  private async captureNext(): Promise<void> {
    if (this.capturing) return;
    this.capturing = true;
    try {
      while (this.queue.length > 0) {
        const video = this.queue.shift();
        if (video) await this.capture(video).catch(ignoreError);
      }
    } finally {
      this.capturing = false;
    }
  }

  private async capture(video: LibraryVideo): Promise<void> {
    const element = document.createElement("video");
    element.muted = true;
    element.playsInline = true;
    element.preload = "auto";
    element.crossOrigin = "anonymous";
    element.src = this.videos().source(video.id);
    element.style.display = "none";
    document.body.appendChild(element);
    try {
      await this.waitFor(element, "loadeddata");
      element.currentTime = seekTime(element);
      await this.waitFor(element, "seeked");
      const dataUrl = await this.captureFrame(element);
      const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
      await this.ipc.invoke<void>("library_video_poster_set", { id: video.id, data });
      this.videos().posterReady(video.id, dataUrl);
    } finally {
      element.pause();
      element.removeAttribute("src");
      element.load();
      element.remove();
    }
  }

  private waitFor(element: HTMLVideoElement, eventName: "loadeddata" | "seeked"): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(this.rejectTimeout.bind(null, reject), CAPTURE_TIMEOUT_MS);
      element.addEventListener(eventName, this.resolveEvent.bind(null, timer, resolve), { once: true });
      element.addEventListener("error", this.rejectMediaError.bind(null, timer, reject), { once: true });
    });
  }

  private captureFrame(video: HTMLVideoElement): Promise<string> {
    const [width, height] = canvasSize(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
    return new Promise(this.encodeCanvas.bind(null, canvas));
  }

  private encodeCanvas(canvas: HTMLCanvasElement, resolve: (value: string) => void, reject: (reason?: unknown) => void): void {
    canvas.toBlob(this.readBlob.bind(null, resolve, reject), "image/jpeg", 0.82);
  }

  private readBlob(resolve: (value: string) => void, reject: (reason?: unknown) => void, blob: Blob | null): void {
    if (blob === null) { reject(new Error("poster capture failed")); return; }
    const reader = new FileReader();
    reader.addEventListener("load", this.resolveReader.bind(null, reader, resolve), { once: true });
    reader.addEventListener("error", this.rejectReader.bind(null, reject), { once: true });
    reader.readAsArrayBuffer(blob);
  }

  private resolveReader(reader: FileReader, resolve: (value: string) => void): void { resolve(`data:image/jpeg;base64,${base64(reader.result as ArrayBuffer)}`); }
  private rejectReader(reject: (reason?: unknown) => void): void { reject(new Error("poster encoding failed")); }
  private rejectTimeout(reject: (reason?: unknown) => void): void { reject(new Error("poster capture timed out")); }
  private rejectMediaError(timer: number, reject: (reason?: unknown) => void): void { window.clearTimeout(timer); reject(new Error("video cannot be decoded")); }
  private resolveEvent(timer: number, resolve: () => void): void { window.clearTimeout(timer); resolve(); }
  private videos(): LibraryVideoService { return this.injector.get(LibraryVideoService); }
}
