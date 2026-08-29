import { TestBed } from "@angular/core/testing";
import { ComponentCase, describeComponents } from "@testing/exercise";
import { libraryImage, libraryPrompt, librarySound, libraryVideo } from "@testing/fixtures";
import { setupWorld, warmWorld } from "@testing/world";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryImageService } from "../library.images.service";
import { LibraryPromptService } from "../library.prompts.service";
import { LibraryService } from "../library.service";
import { LibrarySoundService } from "../library.sounds.service";
import { LibraryVideoService } from "../library.videos.service";
import { LibraryCollectionAssets } from "./collection-assets.component";
import { LibraryCollectionView } from "./collection.component";
import { LibraryCollectionDialog } from "./collection.dialog";
import { LibraryCollectionPanel } from "./collection.panel";
import { LibraryCollections } from "./collections.component";
import { LibraryExplorer } from "./explorer.component";
import { LibraryImageConfirmThumb } from "./image-confirm-thumb.component";
import { LibraryImagePreviewDialog } from "./image-preview.dialog";
import { LibraryImageThumb } from "./image-thumb.component";
import { LibraryImagePanel } from "./image.panel";
import { LibraryImages } from "./images.component";
import { LibraryPromptMedia } from "./prompt-media.component";
import { LibraryPromptPreviewDialog } from "./prompt-preview.dialog";
import { LibraryPromptPanel } from "./prompt.panel";
import { LibraryPrompts } from "./prompts.component";
import { LibraryPromptsPanel } from "./prompts.panel";
import { LibrarySoundEq } from "./sound-eq.component";
import { LibrarySoundMedia } from "./sound-media.component";
import { LibrarySoundPlay } from "./sound-play.component";
import { LibrarySoundPreviewDialog } from "./sound-preview.dialog";
import { LibrarySoundTime } from "./sound-time.component";
import { LibrarySoundWave } from "./sound-wave.component";
import { LibrarySoundPanel } from "./sound.panel";
import { LibrarySounds } from "./sounds.component";
import { LibraryTagPanel } from "./tag.panel";
import { LibraryTaxonomyPanel } from "./taxonomy.panel";
import { LibraryUploadDialog } from "./upload.dialog";
import { LibraryVideoMedia } from "./video-media.component";
import { LibraryVideoPlay } from "./video-play.component";
import { LibraryVideoPreviewDialog } from "./video-preview.dialog";
import { LibraryVideoThumb } from "./video-thumb.component";
import { LibraryVideoPanel } from "./video.panel";
import { LibraryVideos } from "./videos.component";

async function warm(): Promise<void> {
  await warmWorld();
}

const image = libraryImage({ id: 1, name: "cover.png", tags: ["hero"], collectionId: 1 });
const sound = librarySound({ id: 1, name: "theme.mp3", tags: ["calm"], collectionId: 2 });
const video = libraryVideo({ id: 1, name: "clip.mp4", tags: ["hero"] });
const prompt = libraryPrompt({ id: 1, name: "Scene prompt", tags: ["calm"] });

const cases: ComponentCase[] = [
  { name: "LibraryExplorer", type: LibraryExplorer, before: warm },
  { name: "LibraryCollections", type: LibraryCollections, before: warm },
  { name: "LibraryCollectionView", type: LibraryCollectionView, inputs: { collectionId: 1 }, before: warm },
  { name: "LibraryCollectionAssets", type: LibraryCollectionAssets, inputs: { collectionId: 1 }, before: warm },
  { name: "LibraryCollectionPanel", type: LibraryCollectionPanel, inputs: { collectionId: 1 }, before: warm },
  { name: "LibraryTaxonomyPanel", type: LibraryTaxonomyPanel, before: warm },
  { name: "LibraryTaxonomyPanel (tag)", type: LibraryTaxonomyPanel, before: async () => { await warm(); TestBed.inject(LibraryService).selectTag("hero"); } },
  { name: "LibraryTagPanel", type: LibraryTagPanel, inputs: { tag: "hero" }, before: warm },
  { name: "LibraryImages", type: LibraryImages, before: warm },
  { name: "LibraryImages (selected)", type: LibraryImages, before: async () => { await warm(); TestBed.inject(LibraryImageService).select(1); TestBed.inject(LibraryService).setViewMode("list"); } },
  { name: "LibraryImagePanel", type: LibraryImagePanel, before: async () => { await warm(); TestBed.inject(LibraryImageService).select(1); } },
  { name: "LibraryImageThumb", type: LibraryImageThumb, inputs: { image }, before: warm },
  { name: "LibraryImageConfirmThumb", type: LibraryImageConfirmThumb, inputs: { item: { name: "a", data: image } }, before: warm },
  { name: "LibraryImagePreviewDialog", type: LibraryImagePreviewDialog, before: async () => { await warm(); TestBed.inject(LibraryDialogsService).openPreview(1, [{ kind: "image", id: 1 }, { kind: "image", id: 2 }]); } },
  { name: "LibrarySounds", type: LibrarySounds, before: warm },
  { name: "LibrarySoundPanel", type: LibrarySoundPanel, before: async () => { await warm(); TestBed.inject(LibrarySoundService).select(1); } },
  { name: "LibrarySoundMedia", type: LibrarySoundMedia, inputs: { sound }, before: warm },
  { name: "LibrarySoundPlay", type: LibrarySoundPlay, inputs: { sound }, before: warm },
  { name: "LibrarySoundTime", type: LibrarySoundTime, inputs: { sound }, before: warm },
  { name: "LibrarySoundEq", type: LibrarySoundEq, inputs: { sound }, before: warm },
  { name: "LibrarySoundWave", type: LibrarySoundWave, inputs: { sound }, before: warm },
  { name: "LibrarySoundPreviewDialog", type: LibrarySoundPreviewDialog, before: async () => { await warm(); TestBed.inject(LibraryDialogsService).openSoundPreview(1); } },
  { name: "LibraryVideos", type: LibraryVideos, before: warm },
  { name: "LibraryVideoPanel", type: LibraryVideoPanel, before: async () => { await warm(); TestBed.inject(LibraryVideoService).select(1); } },
  { name: "LibraryVideoMedia", type: LibraryVideoMedia, inputs: { video }, before: warm },
  { name: "LibraryVideoPlay", type: LibraryVideoPlay, inputs: { video }, before: warm },
  { name: "LibraryVideoThumb", type: LibraryVideoThumb, inputs: { video }, before: warm },
  { name: "LibraryVideoPreviewDialog", type: LibraryVideoPreviewDialog, before: async () => { await warm(); TestBed.inject(LibraryDialogsService).openVideoPreview(1); } },
  { name: "LibraryPrompts", type: LibraryPrompts, before: warm },
  { name: "LibraryPromptsPanel", type: LibraryPromptsPanel, before: warm },
  { name: "LibraryPromptPanel", type: LibraryPromptPanel, before: async () => { await warm(); TestBed.inject(LibraryPromptService).select(1); } },
  { name: "LibraryPromptMedia", type: LibraryPromptMedia, inputs: { prompt }, before: warm },
  { name: "LibraryPromptPreviewDialog", type: LibraryPromptPreviewDialog, before: async () => { await warm(); TestBed.inject(LibraryDialogsService).openPromptPreview(1); } },
  { name: "LibraryCollectionDialog", type: LibraryCollectionDialog, before: async () => { await warm(); TestBed.inject(LibraryDialogsService).openCreateCollection(); } },
  { name: "LibraryUploadDialog (images)", type: LibraryUploadDialog, before: async () => { await warm(); TestBed.inject(LibraryDialogsService).openUpload(["C:/in/a.png"], "image"); } },
  { name: "LibraryUploadDialog (sounds)", type: LibraryUploadDialog, before: async () => { await warm(); TestBed.inject(LibraryDialogsService).openUpload([], "sound", 2); } },
  { name: "LibraryUploadDialog (videos)", type: LibraryUploadDialog, before: async () => { await warm(); TestBed.inject(LibraryDialogsService).openUpload(["C:/in/a.mp4"], "video"); } },
  { name: "LibraryUploadDialog (prompts)", type: LibraryUploadDialog, before: async () => { await warm(); TestBed.inject(LibraryDialogsService).openUpload([], "prompt", null, "write"); } },
];

describeComponents("library components", cases, () => {
  setupWorld();
});
