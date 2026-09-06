import { LibraryImage } from './library.images.models';
import { AssetRef } from './library.models';
import { LibraryPrompt } from './library.prompts.models';
import { LibrarySound } from './library.sounds.models';
import { LibraryVideo } from './library.videos.models';
import { LibraryVoice } from './library.voices.models';

export interface AssetRow {
  id: number;
  ref: AssetRef;
  name: string;
  size: number;
  createdAt: string;
  tags: string[];
  collectionId: number | null;
  image?: LibraryImage;
  sound?: LibrarySound;
  video?: LibraryVideo;
  prompt?: LibraryPrompt;
  voice?: LibraryVoice;
}

function imageRow(image: LibraryImage): AssetRow {
  return {
    id: image.id,
    ref: { kind: 'image', id: image.id },
    name: image.name,
    size: image.size,
    createdAt: image.createdAt,
    tags: image.tags,
    collectionId: image.collectionId,
    image,
  };
}
function soundRow(sound: LibrarySound): AssetRow {
  return {
    id: sound.id,
    ref: { kind: 'sound', id: sound.id },
    name: sound.name,
    size: sound.size,
    createdAt: sound.createdAt,
    tags: sound.tags,
    collectionId: sound.collectionId,
    sound,
  };
}
function videoRow(video: LibraryVideo): AssetRow {
  return {
    id: video.id,
    ref: { kind: 'video', id: video.id },
    name: video.name,
    size: video.size,
    createdAt: video.createdAt,
    tags: video.tags,
    collectionId: video.collectionId,
    video,
  };
}
function promptRow(prompt: LibraryPrompt): AssetRow {
  return {
    id: prompt.id,
    ref: { kind: 'prompt', id: prompt.id },
    name: prompt.name,
    size: prompt.size,
    createdAt: prompt.createdAt,
    tags: prompt.tags,
    collectionId: prompt.collectionId,
    prompt,
  };
}

function voiceRow(voice: LibraryVoice): AssetRow {
  return {
    id: voice.id,
    ref: { kind: 'voice', id: voice.id },
    name: voice.name,
    size: 0,
    createdAt: voice.createdAt,
    tags: voice.tags,
    collectionId: voice.collectionId,
    voice,
  };
}

export function toAssetRows(
  images: LibraryImage[],
  sounds: LibrarySound[],
  videos: LibraryVideo[],
  prompts: LibraryPrompt[] = [],
  voices: LibraryVoice[] = [],
): AssetRow[] {
  return [
    ...images.map(imageRow),
    ...sounds.map(soundRow),
    ...videos.map(videoRow),
    ...prompts.map(promptRow),
    ...voices.map(voiceRow),
  ];
}
