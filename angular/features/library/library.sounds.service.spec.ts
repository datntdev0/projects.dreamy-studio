import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastService } from "@core/toast/toast.service";
import { FakeIpc } from "@testing/fake-ipc";
import { librarySound } from "@testing/fixtures";
import { flushEffects, setupApp } from "@testing/service";
import { WorkspaceService } from "../workspace/workspace.service";
import { LibraryService } from "./library.service";
import { LibrarySoundPlayer } from "./library.sounds.player";
import { LibrarySoundService } from "./library.sounds.service";

const counts = { image: 0, sound: 0, video: 0, prompt: 0 };

describe("LibrarySoundService", () => {
  let ipc: FakeIpc;
  let sounds: LibrarySoundService;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on("library_collection_list", []);
    ipc.on("library_tag_list", []);
    ipc.on("library_summary", { assets: counts, unfiled: counts });
    ipc.on("library_sound_list", [librarySound({ id: 1, name: "a" }), librarySound({ id: 2, name: "b", tags: ["t"] })]);
    sounds = TestBed.inject(LibrarySoundService);
    flushEffects();
    await sounds.ensureLoaded();
  });

  it("loads and filters", async () => {
    await sounds.ensureLoaded();
    expect(ipc.called("library_sound_list")).toBe(1);
    sounds.query.set("b");
    expect(sounds.visible().map((item) => item.id)).toEqual([2]);
    sounds.select(2);
    expect(sounds.selected()?.id).toBe(2);
    sounds.select(null);
    expect(sounds.selected()).toBeNull();
  });

  it("proxies pick and inspect and uploads in order", async () => {
    ipc.on("library_sound_pick", ["/a.mp3"]);
    ipc.on("library_sound_inspect", []);
    expect(await sounds.pick()).toEqual(["/a.mp3"]);
    expect(await sounds.inspect(["/a.mp3"])).toEqual([]);
    ipc.fail("library_sound_upload", "x");
    await expect(sounds.upload("/a", { tags: [], rights: "own" })).rejects.toBe("x");
    ipc.on("library_sound_upload", librarySound({ id: 7 }));
    await sounds.upload("/b", { tags: [], rights: "own" });
    expect(sounds.items()[0].id).toBe(7);
  });

  it("updates, removes and stops playback of removed sounds", async () => {
    ipc.on("library_sound_update", librarySound({ id: 1, name: "z" }));
    await sounds.update(1, { name: "z" });
    expect(sounds.items().find((item) => item.id === 1)?.name).toBe("z");
    const player = TestBed.inject(LibrarySoundPlayer);
    player.currentId.set(1);
    sounds.select(1);
    ipc.on("library_sound_delete", 1);
    await sounds.remove([1]);
    expect(player.currentId()).toBeNull();
    expect(sounds.selectedId()).toBeNull();
    await sounds.remove([2]);
  });

  it("caches decoded peaks", async () => {
    ipc.on("library_sound_peaks", btoa(String.fromCharCode(1, 2, 3)));
    expect(sounds.peaks(1)).toBeNull();
    expect(sounds.peaks(1)).toBeNull();
    await vi.waitFor(() => expect([...(sounds.peaks(1) ?? [])]).toEqual([1, 2, 3]));
    expect(ipc.called("library_sound_peaks")).toBe(1);
    ipc.fail("library_sound_peaks", "x");
    sounds.peaks(9);
    await vi.waitFor(() => expect(ipc.called("library_sound_peaks")).toBe(2));
  });

  it("reports load errors and reloads on revision changes", async () => {
    TestBed.inject(LibraryService).revision.update((value) => value + 1);
    flushEffects();
    await vi.waitFor(() => expect(ipc.called("library_sound_list")).toBeGreaterThan(1));
    ipc.fail("library_sound_list", { code: "io", detail: "x" });
    ipc.on("workspace_current", { name: "w", path: "/w" });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    await vi.waitFor(() => expect(sounds.error()).toEqual({ code: "io", detail: "x" }));
  });
});

describe("LibrarySoundPlayer", () => {
  const sound = librarySound({ id: 3, durationMs: 10_000 });
  let player: LibrarySoundPlayer;
  let audio: HTMLAudioElement;

  beforeEach(() => {
    setupApp();
    const listeners = new Map<string, () => void>();
    audio = {
      crossOrigin: "",
      src: "",
      currentTime: 0,
      duration: 10,
      pause: vi.fn(() => listeners.get("pause")?.()),
      play: vi.fn(async () => listeners.get("play")?.()),
      addEventListener: vi.fn((name: string, listener: () => void) => listeners.set(name, listener)),
    } as unknown as HTMLAudioElement;
    vi.stubGlobal("Audio", function () {
      return audio;
    });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      void callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    player = TestBed.inject(LibrarySoundPlayer);
    (audio as unknown as { listeners: typeof listeners }).listeners = listeners;
  });

  afterEach(() => vi.unstubAllGlobals());

  function fire(name: string): void {
    (audio as unknown as { listeners: Map<string, () => void> }).listeners.get(name)?.();
  }

  it("plays, pauses and switches sounds", async () => {
    await player.toggle(sound);
    expect(player.currentId()).toBe(3);
    expect(player.playing()).toBe(true);
    expect(audio.src).toContain("dreamy-sound");
    await player.toggle(sound);
    expect(player.playing()).toBe(false);
    await player.toggle(sound);
    expect(player.playing()).toBe(true);
    await player.toggle(librarySound({ id: 4 }));
    expect(player.currentId()).toBe(4);
  });

  it("tracks time and ending", async () => {
    await player.toggle(sound);
    audio.currentTime = 2.34;
    fire("timeupdate");
    expect(player.position()).toBe(2.3);
    expect(player.currentTime()).toBe(2.34);
    fire("ended");
    expect(player.position()).toBe(0);
    expect(player.playing()).toBe(false);
    expect(player.currentTime()).toBe(0);
  });

  it("seeks within bounds and switches sounds", async () => {
    await player.seek(sound, 0.5);
    expect(audio.currentTime).toBe(5);
    expect(player.currentId()).toBe(3);
    await player.seek(sound, 5);
    expect(audio.currentTime).toBe(10);
    await player.seek(librarySound({ id: 8 }), -1);
    expect(player.currentId()).toBe(8);
    expect(audio.currentTime).toBe(0);
  });

  it("stops", async () => {
    await player.toggle(sound);
    player.stop();
    expect(player.currentId()).toBeNull();
    expect(player.playing()).toBe(false);
    const idle = TestBed.inject(LibrarySoundPlayer);
    idle.stop();
  });

  it("reports playback failures", async () => {
    (audio.play as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("blocked"));
    await player.toggle(sound);
    expect(player.playing()).toBe(false);
    expect(TestBed.inject(ToastService).items()[0].tone).toBe("danger");
  });

  it("exposes spectrum data only with an analyser", async () => {
    expect(player.spectrum(4)).toBeNull();
    const analyser = { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 64, connect: vi.fn(), getByteFrequencyData: vi.fn() };
    vi.stubGlobal("AudioContext", function () {
      return { sampleRate: 44100, destination: {}, createMediaElementSource: () => ({ connect: vi.fn() }), createAnalyser: () => analyser, resume: vi.fn() };
    });
    await player.toggle(sound);
    expect(player.analysing()).toBe(true);
    expect(player.spectrum(4)).toHaveLength(4);
  });

  it("tolerates analyser setup failures", async () => {
    vi.stubGlobal("AudioContext", function () {
      throw new Error("no audio");
    });
    await player.toggle(sound);
    expect(player.analysing()).toBe(false);
  });
});
