import { Component, DestroyRef, computed, effect, inject, signal, untracked } from "@angular/core";
import { Button } from "../../../../components/button";
import { Dialog } from "../../../../components/dialog";
import { Icon } from "../../../../components/icon";
import { DesktopDragDropEvent } from "../../../core/desktop/desktop-ipc.service";
import { DesktopIpcService } from "../../../core/desktop/desktop-ipc.service";
import { DesktopUnlisten } from "../../../core/desktop/desktop-ipc.service";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { ImageCheck } from "../library.images.models";
import { ImageRights } from "../library.images.models";
import { ImageUploadInput } from "../library.images.models";
import { IMAGE_RIGHTS } from "../library.images.models";
import { fileNameOf } from "../library.images.rules";
import { formatBytes } from "../library.images.rules";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryImageService } from "../library.images.service";
import { LibrarySoundService } from "../library.sounds.service";
import { normalizeTag } from "../library.rules";
import { libraryErrorKey } from "../library.rules";
import { LibraryService } from "../library.service";

type UploadRunState = "" | "waiting" | "uploading" | "done" | "error";

interface UploadItem {
  path: string;
  name: string;
  size: number;
  check: ImageCheck | null;
  run: UploadRunState;
  error: string;
}

function noop(): void {
  return;
}

function hasPath(path: string, item: UploadItem): boolean {
  return item.path === path;
}

function parseTags(value: string): string[] {
  const tags: string[] = [];
  for (const part of value.split(",")) {
    const tag = normalizeTag(part);
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags.slice(0, 12);
}

@Component({
  selector: "app-library-upload-dialog",
  standalone: true,
  imports: [Button, Dialog, Icon, I18nPipe],
  templateUrl: "./upload.dialog.html",
  host: { "data-testid": "library-upload-dialog" },
})
export class LibraryUploadDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  readonly images = inject(LibraryImageService);
  readonly sounds = inject(LibrarySoundService);
  readonly library = inject(LibraryService);
  private readonly ipc = inject(DesktopIpcService);
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  private unlisten: DesktopUnlisten = noop;
  private listenToken = 0;
  private token = 0;

  readonly open = this.dialogs.uploadOpen;
  readonly kind = this.dialogs.uploadKind;
  readonly paths = this.dialogs.uploadPaths;
  readonly items = signal<UploadItem[]>([]);
  readonly collectionId = signal<number | null>(null);
  readonly newCollection = signal("");
  readonly tags = signal("");
  readonly rights = signal<ImageRights | "">("");
  readonly over = signal(false);
  readonly uploading = signal(false);
  readonly rightOptions = IMAGE_RIGHTS;
  readonly validCount = computed(this.countValid.bind(this));
  readonly canSubmit = computed(this.buildCanSubmit.bind(this));

  constructor() {
    effect(this.syncOpen.bind(this));
    inject(DestroyRef).onDestroy(this.stopListening.bind(this));
  }

  formatSize(value: number): string {
    return formatBytes(value);
  }

  statusKey(item: UploadItem): I18nKey {
    if (item.run) {
      return `library.upload.status.${item.run}` as I18nKey;
    }
    if (item.check?.status === "warn") {
      return "library.upload.status.rename";
    }
    return item.check?.status === "error" ? "library.upload.status.invalid" : "library.upload.status.valid";
  }

  statusClass(item: UploadItem): string {
    if (item.run === "uploading") {
      return "badge-running";
    }
    if (item.run === "done" || (!item.run && item.check?.status === "ok")) {
      return "badge-success";
    }
    return item.run === "error" || item.check?.status === "error" ? "badge-danger" : item.check?.status === "warn" ? "badge-warning" : "";
  }

  rightKey(right: ImageRights): I18nKey {
    return `library.rights.${right}` as I18nKey;
  }

  message(item: UploadItem): string {
    if (item.error) {
      return item.error;
    }
    const code = item.check?.code;
    return code ? this.i18n.translate(`library.upload.check.${code}` as I18nKey, { ext: this.extension(item.name) }) : "";
  }

  close(): void {
    if (!this.uploading()) {
      this.dialogs.closeUpload();
    }
  }

  async pick(): Promise<void> {
    try {
      this.addPaths(await (this.kind() === "sound" ? this.sounds.pick() : this.images.pick()));
    } catch {
      return;
    }
  }

  remove(path: string): void {
    if (!this.uploading()) {
      this.items.set(this.items().filter((item) => item.path !== path));
    }
  }

  setCollection(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.collectionId.set(value ? Number(value) : null);
  }

  setNewCollection(event: Event): void {
    this.newCollection.set((event.target as HTMLInputElement).value);
  }

  setTags(event: Event): void {
    this.tags.set((event.target as HTMLInputElement).value);
  }

  setRights(event: Event): void {
    this.rights.set((event.target as HTMLSelectElement).value as ImageRights | "");
  }

  async submit(): Promise<void> {
    if (!this.canSubmit() || this.uploading()) {
      return;
    }
    const rights = this.rights();
    if (!rights) {
      return;
    }
    this.uploading.set(true);
    const targets = this.validItems();
    this.setWaiting(targets);
    let collectionId: number | undefined;
    try {
      collectionId = await this.resolveCollection();
    } catch (cause) {
      this.uploading.set(false);
      this.toasts.show(this.i18n.translate(libraryErrorKey(cause) as I18nKey), "danger");
      return;
    }
    const input: ImageUploadInput = { tags: parseTags(this.tags()), rights };
    if (collectionId !== undefined) {
      input.collectionId = collectionId;
    }
    let completed = 0;
    for (const target of targets) {
      this.setRun(target.path, "uploading");
      try {
        if (this.kind() === "sound") await this.sounds.upload(target.path, input); else await this.images.upload(target.path, input);
        this.setRun(target.path, "done");
        completed += 1;
      } catch (cause) {
        this.setFailure(target.path, this.i18n.translate(libraryErrorKey(cause) as I18nKey));
      }
    }
    this.uploading.set(false);
    const failed = targets.length - completed;
    if (!failed) {
      this.dialogs.closeUpload();
      this.toasts.show(this.i18n.translate("library.upload.toast.success", { count: completed }));
    } else {
      this.toasts.show(this.i18n.translate("library.upload.toast.partial", { success: completed, total: targets.length, failed }), "warning");
    }
  }

  private syncOpen(): void {
    untracked(this.applyOpen.bind(this, this.open()));
  }

  private applyOpen(open: boolean): void {
    if (open) {
      this.reset();
      this.addPaths(this.paths());
      void this.listen();
    } else {
      this.stopListening();
      this.token += 1;
    }
  }

  private reset(): void {
    this.token += 1;
    this.items.set([]);
    this.collectionId.set(this.dialogs.uploadCollectionId());
    this.newCollection.set("");
    this.tags.set("");
    this.rights.set("");
    this.over.set(false);
    this.uploading.set(false);
  }

  private addPaths(paths: string[]): void {
    const fresh = paths.filter((path) => !this.items().some(hasPath.bind(null, path)));
    if (fresh.length !== paths.length) {
      this.toasts.show(this.i18n.translate("library.upload.toast.skipped", { count: paths.length - fresh.length }), "warning");
    }
    if (!fresh.length) {
      return;
    }
    const additions = fresh.map(this.toItem);
    this.items.set([...this.items(), ...additions]);
    void this.inspect(additions.map((item) => item.path));
  }

  private toItem(path: string): UploadItem {
    return { path, name: fileNameOf(path), size: 0, check: null, run: "", error: "" };
  }

  private async inspect(paths: string[]): Promise<void> {
    const token = this.token;
    try {
      const checks = await (this.kind() === "sound" ? this.sounds.inspect(paths) : this.images.inspect(paths));
      if (token === this.token) {
        this.applyChecks(checks);
      }
    } catch (cause) {
      if (token === this.token) {
        const error = this.i18n.translate(libraryErrorKey(cause) as I18nKey);
        this.items.update((items) => items.map((item) => paths.includes(item.path) ? { ...item, run: "error", error } : item));
      }
    }
  }

  private applyChecks(checks: ImageCheck[]): void {
    this.items.update((items) => items.map(this.applyCheck.bind(this, checks)));
  }

  private applyCheck(checks: ImageCheck[], item: UploadItem): UploadItem {
    const check = checks.find((candidate) => candidate.path === item.path);
    return check ? { ...item, name: check.name, size: check.size, check } : item;
  }

  private async listen(): Promise<void> {
    this.stopListening();
    const token = this.listenToken;
    const unlisten = await this.ipc.onDragDrop(this.onDragDrop.bind(this));
    if (token === this.listenToken) {
      this.unlisten = unlisten;
    } else {
      unlisten();
    }
  }

  private stopListening(): void {
    this.listenToken += 1;
    this.unlisten();
    this.unlisten = noop;
  }

  private onDragDrop(event: DesktopDragDropEvent): void {
    if (!this.open() || this.uploading()) {
      this.over.set(false);
      return;
    }
    if (event.type === "enter" || event.type === "over") {
      this.over.set(true);
    } else if (event.type === "leave") {
      this.over.set(false);
    } else {
      this.over.set(false);
      this.addPaths(event.paths);
    }
  }

  private validItems(): UploadItem[] {
    return this.items().filter(this.isValid);
  }

  private isValid(item: UploadItem): boolean {
    return item.check !== null && item.check.status !== "error" && item.run !== "done";
  }

  private countValid(): number {
    return this.validItems().length;
  }

  private buildCanSubmit(): boolean {
    return !this.uploading() && !!this.rights() && this.validCount() > 0;
  }

  private setWaiting(items: UploadItem[]): void {
    const paths = new Set(items.map((item) => item.path));
    this.items.update((current) => current.map((item) => paths.has(item.path) ? { ...item, run: "waiting", error: "" } : item));
  }

  private setRun(path: string, run: UploadRunState): void {
    this.items.update((items) => items.map((item) => item.path === path ? { ...item, run } : item));
  }

  private setFailure(path: string, error: string): void {
    this.items.update((items) => items.map((item) => item.path === path ? { ...item, run: "error", error } : item));
  }

  private async resolveCollection(): Promise<number | undefined> {
    const name = this.newCollection().trim();
    if (!name) {
      return this.collectionId() ?? undefined;
    }
    const existing = this.library.collections().find((collection) => collection.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    return existing ? existing.id : (await this.library.createCollection({ name })).id;
  }

  private extension(name: string): string {
    const index = name.lastIndexOf(".");
    return index >= 0 ? name.slice(index + 1).toLowerCase() : "?";
  }
}
