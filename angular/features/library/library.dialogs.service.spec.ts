import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { LibraryDialogsService } from "./library.dialogs.service";

describe("LibraryDialogsService", () => {
  const dialogs = () => TestBed.inject(LibraryDialogsService);

  it("opens and closes the collection dialog", () => {
    dialogs().openCreateCollection();
    expect(dialogs().createCollectionOpen()).toBe(true);
    dialogs().closeCreateCollection();
    expect(dialogs().createCollectionOpen()).toBe(false);
  });

  it("opens and closes uploads", () => {
    dialogs().openUpload(["a"], "sound", 3, "write");
    expect(dialogs().uploadOpen()).toBe(true);
    expect([dialogs().uploadPaths(), dialogs().uploadKind(), dialogs().uploadCollectionId(), dialogs().uploadMode()]).toEqual([["a"], "sound", 3, "write"]);
    dialogs().closeUpload();
    expect([dialogs().uploadOpen(), dialogs().uploadPaths(), dialogs().uploadKind(), dialogs().uploadCollectionId(), dialogs().uploadMode()]).toEqual([false, [], "image", null, "files"]);
    dialogs().openUpload();
    expect(dialogs().uploadKind()).toBe("image");
  });

  it("opens one preview at a time", () => {
    const sequence = [{ kind: "image" as const, id: 1 }];
    dialogs().openPreview(1, sequence);
    expect(dialogs().previewImageId()).toBe(1);
    expect(dialogs().previewSequence()).toBe(sequence);
    dialogs().openSoundPreview(2);
    expect([dialogs().previewImageId(), dialogs().previewSoundId()]).toEqual([null, 2]);
    dialogs().openVideoPreview(3);
    expect([dialogs().previewSoundId(), dialogs().previewVideoId()]).toEqual([null, 3]);
    dialogs().openPromptPreview(4);
    expect([dialogs().previewVideoId(), dialogs().previewPromptId()]).toEqual([null, 4]);
    dialogs().openPreviewRef({ kind: "sound", id: 5 });
    dialogs().openPreviewRef({ kind: "video", id: 6 });
    dialogs().openPreviewRef({ kind: "prompt", id: 7 });
    dialogs().openPreviewRef({ kind: "image", id: 8 });
    expect(dialogs().previewImageId()).toBe(8);
    dialogs().closePreview();
    expect([dialogs().previewImageId(), dialogs().previewPromptId(), dialogs().previewSequence()]).toEqual([null, null, null]);
  });
});
