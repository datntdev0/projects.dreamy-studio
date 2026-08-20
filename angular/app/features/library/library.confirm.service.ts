import { Injectable, Type, inject } from "@angular/core";
import { DialogItem } from "@app/core/dialog/dialog.models";
import { DialogService } from "@app/core/dialog/dialog.service";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { TabsService } from "@layout/tabs.service";
import { LibraryImageConfirmThumb } from "./components/image-confirm-thumb.component";
import { imageCode } from "./library.images.rules";
import { LibraryImageService } from "./library.images.service";
import { LibraryPromptService } from "./library.prompts.service";
import { formatBytes, libraryErrorKey, sumCounts } from "./library.rules";
import { LibraryService } from "./library.service";
import { LibrarySoundService } from "./library.sounds.service";
import { LibraryVideoService } from "./library.videos.service";

const IMAGE_LIMIT = 8;

interface AssetKeys {
  title: [I18nKey, I18nKey];
  confirm: [I18nKey, I18nKey];
  toast: [I18nKey, I18nKey];
  close: I18nKey;
  warning: I18nKey;
}

const IMAGE_KEYS: AssetKeys = {
  title: ["library.imageDelete.title.one", "library.imageDelete.title.other"],
  confirm: ["library.imageDelete.confirm.one", "library.imageDelete.confirm.other"],
  toast: ["library.image.toast.deleted.one", "library.image.toast.deleted.other"],
  close: "library.imageDelete.close",
  warning: "library.imageDelete.warning",
};

const SOUND_KEYS: AssetKeys = {
  title: ["library.soundDelete.title.one", "library.soundDelete.title.other"],
  confirm: ["library.soundDelete.confirm.one", "library.soundDelete.confirm.other"],
  toast: ["library.sound.toast.deleted.one", "library.sound.toast.deleted.other"],
  close: "library.soundDelete.close",
  warning: "library.soundDelete.warning",
};

const VIDEO_KEYS: AssetKeys = {
  title: ["library.videoDelete.title.one", "library.videoDelete.title.other"],
  confirm: ["library.videoDelete.confirm.one", "library.videoDelete.confirm.other"],
  toast: ["library.video.toast.deleted.one", "library.video.toast.deleted.other"],
  close: "library.videoDelete.close",
  warning: "library.videoDelete.warning",
};

const PROMPT_KEYS: AssetKeys = {
  title: ["library.promptDelete.title.one", "library.promptDelete.title.other"],
  confirm: ["library.promptDelete.confirm.one", "library.promptDelete.confirm.other"],
  toast: ["library.prompt.toast.deleted.one", "library.prompt.toast.deleted.other"],
  close: "library.promptDelete.close",
  warning: "library.promptDelete.warning",
};

@Injectable({ providedIn: "root" })
export class LibraryConfirmService {
  private readonly dialogs = inject(DialogService);
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  private readonly tabs = inject(TabsService);
  private readonly library = inject(LibraryService);
  private readonly images = inject(LibraryImageService);
  private readonly sounds = inject(LibrarySoundService);
  private readonly videos = inject(LibraryVideoService);
  private readonly prompts = inject(LibraryPromptService);

  deleteCollection(id: number): Promise<boolean> {
    const collection = this.library.collectionById(id);
    if (!collection) {
      return Promise.resolve(false);
    }
    const total = sumCounts(collection.counts);
    return this.dialogs.ask({
      title: this.i18n.translate("library.delete.title"),
      eyebrow: this.i18n.translate("library.cap"),
      closeLabel: this.i18n.translate("library.delete.close"),
      message: this.i18n.translate("library.delete.question", { name: collection.name }),
      warning: this.i18n.translate(total ? "library.delete.warning" : "library.delete.empty", { count: total }),
      confirmLabel: this.i18n.translate("library.delete.confirm"),
      confirmIcon: "trash",
      onConfirm: this.removeCollection.bind(this, id),
    });
  }

  deleteImages(ids: number[]): Promise<boolean> {
    const picked = new Set(ids);
    const rows = this.images.items().filter((image) => picked.has(image.id));
    const items = rows.map((image): DialogItem => ({ name: image.name, meta: imageCode(image.id), data: image }));
    const remove = this.images.remove.bind(this.images, ids);
    return this.askAssets(IMAGE_KEYS, ids, items, remove, { thumb: LibraryImageConfirmThumb, itemLimit: IMAGE_LIMIT });
  }

  deleteSounds(ids: number[]): Promise<boolean> {
    const picked = new Set(ids);
    const kind = this.i18n.translate("library.kind.sound");
    const rows = this.sounds.items().filter((sound) => picked.has(sound.id));
    const items = rows.map((sound): DialogItem => ({ name: sound.name, meta: `${kind} · ${formatBytes(sound.size)}`, icon: "music" }));
    return this.askAssets(SOUND_KEYS, ids, items, this.sounds.remove.bind(this.sounds, ids), {});
  }

  deleteVideos(ids: number[]): Promise<boolean> {
    const picked = new Set(ids);
    const kind = this.i18n.translate("library.kind.video");
    const rows = this.videos.items().filter((video) => picked.has(video.id));
    const items = rows.map((video): DialogItem => ({ name: video.name, meta: `${kind} · ${formatBytes(video.size)}`, icon: "film" }));
    return this.askAssets(VIDEO_KEYS, ids, items, this.videos.remove.bind(this.videos, ids), {});
  }

  deletePrompts(ids: number[]): Promise<boolean> {
    const picked = new Set(ids);
    const kind = this.i18n.translate("library.prompt.title");
    const rows = this.prompts.items().filter((prompt) => picked.has(prompt.id));
    const items = rows.map((prompt): DialogItem => ({ name: prompt.name, meta: `${kind} · ${prompt.size}`, icon: "prompt" }));
    return this.askAssets(PROMPT_KEYS, ids, items, this.prompts.remove.bind(this.prompts, ids), {});
  }

  confirmTag(kind: "merge" | "delete", tag: string, target: string): Promise<boolean> {
    const merge = kind === "merge";
    const row = this.library.tags().find((entry) => entry.tag === tag);
    const count = row ? sumCounts(row.counts) : 0;
    return this.dialogs.ask({
      title: this.i18n.translate(merge ? "library.tag.mergeTitle" : "library.tag.deleteTitle"),
      eyebrow: this.i18n.translate("library.cap"),
      closeLabel: this.i18n.translate("library.tag.confirmClose"),
      message: this.i18n.translate(merge ? "library.tag.mergeQuestion" : "library.tag.deleteQuestion", { tag, target }),
      warning: this.i18n.translate(merge ? "library.tag.mergeWarning" : "library.tag.deleteWarning", { count, tag, target }),
      confirmLabel: this.i18n.translate(merge ? "library.tag.merge" : "library.tag.delete"),
      confirmIcon: merge ? undefined : "trash",
      tone: merge ? "primary" : "danger",
      onConfirm: this.applyTag.bind(this, kind, tag, target),
    });
  }

  private askAssets(keys: AssetKeys, ids: number[], items: DialogItem[], remove: () => Promise<number>, extra: { thumb?: Type<unknown>; itemLimit?: number }): Promise<boolean> {
    if (ids.length === 0) {
      return Promise.resolve(false);
    }
    const single = ids.length === 1 ? 0 : 1;
    const hidden = extra.itemLimit === undefined ? 0 : Math.max(0, items.length - extra.itemLimit);
    return this.dialogs.ask({
      title: this.i18n.translate(keys.title[single], { count: ids.length }),
      eyebrow: this.i18n.translate("library.cap"),
      closeLabel: this.i18n.translate(keys.close),
      items,
      thumb: extra.thumb,
      itemLimit: extra.itemLimit,
      moreLabel: hidden > 0 ? this.i18n.translate("library.imageDelete.more", { count: hidden }) : undefined,
      warning: this.i18n.translate(keys.warning),
      confirmLabel: this.i18n.translate(keys.confirm[single], { count: ids.length }),
      confirmIcon: "trash",
      onConfirm: this.removeAssets.bind(this, keys, items, remove),
    });
  }

  private async removeAssets(keys: AssetKeys, items: DialogItem[], remove: () => Promise<number>): Promise<void> {
    let count = 0;
    try {
      count = await remove();
    } catch (cause) {
      throw this.failure(cause);
    }
    const name = items[0]?.name ?? "";
    this.toasts.show(this.i18n.translate(keys.toast[count === 1 ? 0 : 1], { name, count }));
  }

  private async removeCollection(id: number): Promise<void> {
    try {
      await this.library.deleteCollection(id);
    } catch (cause) {
      throw this.failure(cause);
    }
    this.tabs.closeCollection(id);
  }

  private async applyTag(kind: "merge" | "delete", tag: string, target: string): Promise<void> {
    try {
      if (kind === "merge") {
        await this.library.mergeTag(tag, target);
      } else {
        await this.library.deleteTag(tag);
      }
    } catch (cause) {
      throw this.failure(cause);
    }
  }

  private failure(cause: unknown): Error {
    return new Error(this.i18n.translate(libraryErrorKey(cause) as I18nKey));
  }
}
