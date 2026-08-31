import { inject, Injectable } from '@angular/core';
import { TabsService } from '@layout/tabs.service';
import { DialogItem } from '@shared/dialog/dialog.models';
import { DialogService } from '@shared/dialog/dialog.service';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { Identified, pickByIds } from '@shared/utils/collection';

import { LibraryImage } from './library.images.models';
import { imageCode } from './library.images.rules';
import { LibraryImageService } from './library.images.service';
import { LibraryPromptService } from './library.prompts.service';
import { formatBytes, libraryErrorKey, sumCounts } from './library.rules';
import { LibraryService } from './library.service';
import { LibrarySoundService } from './library.sounds.service';
import { LibraryVideoService } from './library.videos.service';

const IMAGE_LIMIT = 8;

interface NamedAsset extends Identified {
  name: string;
  size: number;
}

function byteSizeLabel(asset: NamedAsset): string {
  return formatBytes(asset.size);
}

function plainSizeLabel(asset: NamedAsset): string {
  return String(asset.size);
}

interface AssetKeys {
  title: [LanguageKey, LanguageKey];
  confirm: [LanguageKey, LanguageKey];
  toast: [LanguageKey, LanguageKey];
  close: LanguageKey;
  warning: LanguageKey;
}

const IMAGE_KEYS: AssetKeys = {
  title: ['library.imageDelete.title.one', 'library.imageDelete.title.other'],
  confirm: ['library.imageDelete.confirm.one', 'library.imageDelete.confirm.other'],
  toast: ['library.image.toast.deleted.one', 'library.image.toast.deleted.other'],
  close: 'library.imageDelete.close',
  warning: 'library.imageDelete.warning',
};

const SOUND_KEYS: AssetKeys = {
  title: ['library.soundDelete.title.one', 'library.soundDelete.title.other'],
  confirm: ['library.soundDelete.confirm.one', 'library.soundDelete.confirm.other'],
  toast: ['library.sound.toast.deleted.one', 'library.sound.toast.deleted.other'],
  close: 'library.soundDelete.close',
  warning: 'library.soundDelete.warning',
};

const VIDEO_KEYS: AssetKeys = {
  title: ['library.videoDelete.title.one', 'library.videoDelete.title.other'],
  confirm: ['library.videoDelete.confirm.one', 'library.videoDelete.confirm.other'],
  toast: ['library.video.toast.deleted.one', 'library.video.toast.deleted.other'],
  close: 'library.videoDelete.close',
  warning: 'library.videoDelete.warning',
};

const PROMPT_KEYS: AssetKeys = {
  title: ['library.promptDelete.title.one', 'library.promptDelete.title.other'],
  confirm: ['library.promptDelete.confirm.one', 'library.promptDelete.confirm.other'],
  toast: ['library.prompt.toast.deleted.one', 'library.prompt.toast.deleted.other'],
  close: 'library.promptDelete.close',
  warning: 'library.promptDelete.warning',
};

@Injectable({ providedIn: 'root' })
export class LibraryConfirmService {
  private readonly dialogs = inject(DialogService);
  private readonly languageService = inject(LanguageService);
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
      title: this.languageService.translate('library.delete.title'),
      eyebrow: this.languageService.translate('library.cap'),
      closeLabel: this.languageService.translate('library.delete.close'),
      message: this.languageService.translate('library.delete.question', { name: collection.name }),
      warning: this.languageService.translate(
        total ? 'library.delete.warning' : 'library.delete.empty',
        { count: total },
      ),
      confirmLabel: this.languageService.translate('library.delete.confirm'),
      confirmIcon: 'trash',
      onConfirm: this.removeCollection.bind(this, id),
    });
  }

  deleteImages(ids: number[]): Promise<boolean> {
    const rows = pickByIds(this.images.items(), ids);
    const items = rows.map(this.imageDialogItem.bind(this));
    const remove = this.images.remove.bind(this.images, ids);
    return this.askAssets(IMAGE_KEYS, ids, items, remove, { itemLimit: IMAGE_LIMIT });
  }

  deleteSounds(ids: number[]): Promise<boolean> {
    const rows = pickByIds(this.sounds.items(), ids);
    const toItem = this.mediaDialogItem.bind(this, 'library.kind.sound', 'music', byteSizeLabel);
    const remove = this.sounds.remove.bind(this.sounds, ids);
    return this.askAssets(SOUND_KEYS, ids, rows.map(toItem), remove, {});
  }

  deleteVideos(ids: number[]): Promise<boolean> {
    const rows = pickByIds(this.videos.items(), ids);
    const toItem = this.mediaDialogItem.bind(this, 'library.kind.video', 'film', byteSizeLabel);
    const remove = this.videos.remove.bind(this.videos, ids);
    return this.askAssets(VIDEO_KEYS, ids, rows.map(toItem), remove, {});
  }

  deletePrompts(ids: number[]): Promise<boolean> {
    const rows = pickByIds(this.prompts.items(), ids);
    const toItem = this.mediaDialogItem.bind(
      this,
      'library.prompt.title',
      'prompt',
      plainSizeLabel,
    );
    const remove = this.prompts.remove.bind(this.prompts, ids);
    return this.askAssets(PROMPT_KEYS, ids, rows.map(toItem), remove, {});
  }

  confirmTag(kind: 'merge' | 'delete', tag: string, target: string): Promise<boolean> {
    const merge = kind === 'merge';
    const row = this.library.tags().find((entry) => entry.tag === tag);
    const count = row ? sumCounts(row.counts) : 0;
    return this.dialogs.ask({
      title: this.languageService.translate(
        merge ? 'library.tag.mergeTitle' : 'library.tag.deleteTitle',
      ),
      eyebrow: this.languageService.translate('library.cap'),
      closeLabel: this.languageService.translate('library.tag.confirmClose'),
      message: this.languageService.translate(
        merge ? 'library.tag.mergeQuestion' : 'library.tag.deleteQuestion',
        { tag, target },
      ),
      warning: this.languageService.translate(
        merge ? 'library.tag.mergeWarning' : 'library.tag.deleteWarning',
        { count, tag, target },
      ),
      confirmLabel: this.languageService.translate(
        merge ? 'library.tag.merge' : 'library.tag.delete',
      ),
      confirmIcon: merge ? undefined : 'trash',
      tone: merge ? 'primary' : 'danger',
      onConfirm: this.applyTag.bind(this, kind, tag, target),
    });
  }

  private imageDialogItem(image: LibraryImage): DialogItem {
    return {
      name: image.name,
      meta: imageCode(image.id),
      image: this.images.thumb.bind(this.images, image.id),
    };
  }

  private mediaDialogItem<T extends NamedAsset>(
    kindKey: LanguageKey,
    icon: string,
    detail: (row: T) => string,
    row: T,
  ): DialogItem {
    const kind = this.languageService.translate(kindKey);
    return { name: row.name, meta: `${kind} · ${detail(row)}`, icon };
  }

  private askAssets(
    keys: AssetKeys,
    ids: number[],
    items: DialogItem[],
    remove: () => Promise<number>,
    extra: { itemLimit?: number },
  ): Promise<boolean> {
    if (ids.length === 0) {
      return Promise.resolve(false);
    }
    const single = ids.length === 1 ? 0 : 1;
    const hidden = extra.itemLimit === undefined ? 0 : Math.max(0, items.length - extra.itemLimit);
    return this.dialogs.ask({
      title: this.languageService.translate(keys.title[single], { count: ids.length }),
      eyebrow: this.languageService.translate('library.cap'),
      closeLabel: this.languageService.translate(keys.close),
      items,
      itemLimit: extra.itemLimit,
      moreLabel:
        hidden > 0
          ? this.languageService.translate('library.imageDelete.more', { count: hidden })
          : undefined,
      warning: this.languageService.translate(keys.warning),
      confirmLabel: this.languageService.translate(keys.confirm[single], { count: ids.length }),
      confirmIcon: 'trash',
      onConfirm: this.removeAssets.bind(this, keys, items, remove),
    });
  }

  private async removeAssets(
    keys: AssetKeys,
    items: DialogItem[],
    remove: () => Promise<number>,
  ): Promise<void> {
    let count = 0;
    try {
      count = await remove();
    } catch (cause) {
      throw this.failure(cause);
    }
    const name = items[0]?.name ?? '';
    this.toasts.show(
      this.languageService.translate(keys.toast[count === 1 ? 0 : 1], { name, count }),
    );
  }

  private async removeCollection(id: number): Promise<void> {
    try {
      await this.library.deleteCollection(id);
    } catch (cause) {
      throw this.failure(cause);
    }
    this.tabs.closeCollection(id);
  }

  private async applyTag(kind: 'merge' | 'delete', tag: string, target: string): Promise<void> {
    try {
      if (kind === 'merge') {
        await this.library.mergeTag(tag, target);
      } else {
        await this.library.deleteTag(tag);
      }
    } catch (cause) {
      throw this.failure(cause);
    }
  }

  private failure(cause: unknown): Error {
    return new Error(this.languageService.translate(libraryErrorKey(cause) as LanguageKey));
  }
}
