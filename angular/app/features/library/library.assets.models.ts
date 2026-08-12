import { LibraryImage } from "./library.images.models";
import { AssetRef } from "./library.models";
import { LibrarySound } from "./library.sounds.models";
import { LibraryVideo } from "./library.videos.models";

export interface AssetRow {
  ref: AssetRef;
  name: string;
  size: number;
  createdAt: string;
  tags: string[];
  collectionId: number | null;
  image?: LibraryImage;
  sound?: LibrarySound;
  video?: LibraryVideo;
}

function imageRow(image: LibraryImage): AssetRow { return { ref: { kind: "image", id: image.id }, name: image.name, size: image.size, createdAt: image.createdAt, tags: image.tags, collectionId: image.collectionId, image }; }
function soundRow(sound: LibrarySound): AssetRow { return { ref: { kind: "sound", id: sound.id }, name: sound.name, size: sound.size, createdAt: sound.createdAt, tags: sound.tags, collectionId: sound.collectionId, sound }; }
function videoRow(video: LibraryVideo): AssetRow { return { ref: { kind: "video", id: video.id }, name: video.name, size: video.size, createdAt: video.createdAt, tags: video.tags, collectionId: video.collectionId, video }; }

export function toAssetRows(images: LibraryImage[], sounds: LibrarySound[], videos: LibraryVideo[]): AssetRow[] { return [...images.map(imageRow), ...sounds.map(soundRow), ...videos.map(videoRow)]; }
