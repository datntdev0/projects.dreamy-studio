import { Component, DestroyRef, computed, effect, inject, signal, untracked } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { Segments, SegmentOption } from "@components/segments";
import { DesktopDragDropEvent } from "@app/core/desktop/desktop-ipc.service";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { DesktopUnlisten } from "@app/core/desktop/desktop-ipc.service";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { ImageCheck } from "../library.images.models";
import { ImageRights } from "../library.images.models";
import { ImageUploadInput } from "../library.images.models";
import { IMAGE_RIGHTS } from "../library.images.models";
import { fileNameOf } from "../library.images.rules";
import { formatBytes } from "../library.images.rules";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryImageService } from "../library.images.service";
import { LibrarySoundService } from "../library.sounds.service";
import { LibraryVideoService } from "../library.videos.service";
import { VIDEO_MAX_BYTES } from "../library.videos.models";
import { LibraryPromptService } from "../library.prompts.service";
import { PROMPT_KINDS, PROMPT_MAX_BYTES, PROMPT_NAME_MAX, PromptCreateInput, PromptKind } from "../library.prompts.models";
import { promptNameTooLong, promptTextTooLarge, promptVariables } from "../library.prompts.rules";
import { normalizeTag } from "../library.rules";
import { libraryErrorKey } from "../library.rules";
import { LibraryService } from "../library.service";

type UploadRunState = "" | "waiting" | "uploading" | "done" | "error";
type UploadKind = "image" | "sound" | "video" | "prompt";

interface UploadConfig {
  icon: "image" | "music" | "film" | "prompt";
  nounKey: LanguageKey;
  hintKey: LanguageKey;
  dropzoneKey: LanguageKey;
  dropTitleKey: LanguageKey;
  limit: number;
}

const UPLOAD_CONFIG: Record<UploadKind, UploadConfig> = {
  image: { icon: "image", nounKey: "library.noun.image", hintKey: "library.upload.hint.image", dropzoneKey: "library.upload.dropzone", dropTitleKey: "library.upload.dropTitle", limit: 25 * 1024 * 1024 },
  sound: { icon: "music", nounKey: "library.noun.sound", hintKey: "library.upload.hint.sound", dropzoneKey: "library.upload.dropzone.sound", dropTitleKey: "library.upload.dropTitle.sound", limit: 200 * 1024 * 1024 },
  video: { icon: "film", nounKey: "library.noun.video", hintKey: "library.upload.hint.video", dropzoneKey: "library.upload.dropzone.video", dropTitleKey: "library.upload.dropTitle.video", limit: VIDEO_MAX_BYTES },
  prompt: { icon: "prompt", nounKey: "library.noun.prompt", hintKey: "library.upload.hint.prompt", dropzoneKey: "library.upload.dropzone.prompt", dropTitleKey: "library.upload.dropTitle.prompt", limit: PROMPT_MAX_BYTES },
};

const SCOPED_CHECK_CODES = ["unsupported", "too_large", "duplicate_name"];

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
  imports: [Button, Icon, CoreModule, Segments],
  templateUrl: "./upload.dialog.html",
  host: { "data-testid": "library-upload-dialog" },
})
export class LibraryUploadDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  readonly images = inject(LibraryImageService);
  readonly sounds = inject(LibrarySoundService);
  readonly videos = inject(LibraryVideoService);
  readonly prompts = inject(LibraryPromptService);
  readonly library = inject(LibraryService);
  private readonly ipc = inject(DesktopIpcService);
  private readonly languageService = inject(LanguageService);
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
  readonly mode = this.dialogs.uploadMode;
  readonly writeName = signal("");
  readonly writeKind = signal<PromptKind>("general");
  readonly writeText = signal("");
  readonly writeTried = signal(false);
  readonly nameMax = PROMPT_NAME_MAX;
  readonly promptKinds = PROMPT_KINDS;
  readonly isWrite = computed(this.buildIsWrite.bind(this));
  readonly writeVariables = computed(this.buildWriteVariables.bind(this));
  readonly tabOptions = computed(this.buildTabOptions.bind(this));
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

  config(): UploadConfig {
    return UPLOAD_CONFIG[this.kind()];
  }

  statusKey(item: UploadItem): LanguageKey {
    if (item.run) {
      return `library.upload.status.${item.run}` as LanguageKey;
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

  kindKey(kind: PromptKind): LanguageKey {
    return `library.prompt.kind.${kind}` as LanguageKey;
  }

  setMode(value: string): void {
    if (!this.uploading()) {
      this.dialogs.uploadMode.set(value === "write" ? "write" : "files");
      this.writeTried.set(false);
    }
  }

  setWriteName(event: Event): void {
    this.writeName.set((event.target as HTMLInputElement).value);
  }

  setWriteKind(event: Event): void {
    this.writeKind.set((event.target as HTMLSelectElement).value as PromptKind);
  }

  setWriteText(event: Event): void {
    this.writeText.set((event.target as HTMLTextAreaElement).value);
  }

  nameInvalid(): boolean {
    return this.writeTried() && this.nameErrorKey() !== null;
  }

  textInvalid(): boolean {
    return this.writeTried() && this.textErrorKey() !== null;
  }

  nameErrorKey(): LanguageKey | null {
    if (!this.writeName().trim()) {
      return "library.promptWrite.nameRequired";
    }
    return promptNameTooLong(this.writeName()) ? "library.promptWrite.nameTooLong" : null;
  }

  textErrorKey(): LanguageKey | null {
    if (!this.writeText().trim()) {
      return "library.promptWrite.textRequired";
    }
    return promptTextTooLarge(this.writeText().trim()) ? "library.promptWrite.textTooLarge" : null;
  }

  rightKey(right: ImageRights): LanguageKey {
    return `library.rights.${right}` as LanguageKey;
  }

  message(item: UploadItem): string {
    if (item.error) {
      return item.error;
    }
    const code = item.check?.code;
    return code ? this.languageService.translate(this.checkKey(code), { ext: this.extension(item.name) }) : "";
  }

  checkKey(code: string): LanguageKey {
    const kind = this.kind();
    if (kind !== "image" && SCOPED_CHECK_CODES.includes(code)) {
      return `library.upload.check.${kind}.${code}` as LanguageKey;
    }
    return `library.upload.check.${code}` as LanguageKey;
  }

  close(): void {
    if (!this.uploading()) {
      this.dialogs.closeUpload();
    }
  }

  async pick(): Promise<void> {
    try {
      this.addPaths(await this.pickPaths());
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
    if (this.isWrite()) {
      await this.submitWrite(rights);
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
      this.toasts.show(this.languageService.translate(libraryErrorKey(cause) as LanguageKey), "danger");
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
        await this.uploadPath(target.path, input);
        this.setRun(target.path, "done");
        completed += 1;
      } catch (cause) {
        this.setFailure(target.path, this.languageService.translate(libraryErrorKey(cause) as LanguageKey));
      }
    }
    this.uploading.set(false);
    const failed = targets.length - completed;
    const noun = this.nounText();
    if (!failed) {
      this.dialogs.closeUpload();
      this.toasts.show(this.languageService.translate("library.upload.toast.success", { count: completed, noun }));
    } else {
      this.toasts.show(this.languageService.translate("library.upload.toast.partial", { success: completed, total: targets.length, failed, noun }), "warning");
    }
  }

  private async submitWrite(rights: ImageRights): Promise<void> {
    const name = this.writeName().trim();
    const text = this.writeText().trim();
    this.writeTried.set(true);
    if (this.nameErrorKey() || this.textErrorKey()) {
      return;
    }
    this.uploading.set(true);
    try {
      const collectionId = await this.resolveCollection();
      const input: PromptCreateInput = { name, kind: this.writeKind(), text, tags: parseTags(this.tags()), rights };
      if (collectionId !== undefined) {
        input.collectionId = collectionId;
      }
      const prompt = await this.prompts.create(input);
      this.uploading.set(false);
      this.dialogs.closeUpload();
      this.toasts.show(this.languageService.translate("library.promptWrite.toast", { name: prompt.name }));
    } catch (cause) {
      this.uploading.set(false);
      this.toasts.show(this.languageService.translate(libraryErrorKey(cause) as LanguageKey), "danger");
    }
  }

  private nounText(): string {
    return this.languageService.translate(this.config().nounKey);
  }

  private buildIsWrite(): boolean {
    return this.kind() === "prompt" && this.mode() === "write";
  }

  private buildWriteVariables(): string {
    return promptVariables(this.writeText()).join(", ");
  }

  private buildTabOptions(): SegmentOption[] {
    return [
      { value: "files", label: this.languageService.translate("library.upload.tab.files") },
      { value: "write", label: this.languageService.translate("library.upload.tab.write") },
    ];
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
    this.writeName.set("");
    this.writeKind.set("general");
    this.writeText.set("");
    this.writeTried.set(false);
    this.over.set(false);
    this.uploading.set(false);
  }

  private addPaths(paths: string[]): void {
    const fresh = paths.filter((path) => !this.items().some(hasPath.bind(null, path)));
    if (fresh.length !== paths.length) {
      this.toasts.show(this.languageService.translate("library.upload.toast.skipped", { count: paths.length - fresh.length }), "warning");
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
      const checks = await this.inspectPaths(paths);
      if (token === this.token) {
        this.applyChecks(checks);
      }
    } catch (cause) {
      if (token === this.token) {
        const error = this.languageService.translate(libraryErrorKey(cause) as LanguageKey);
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
    if (!this.open() || this.uploading() || this.isWrite()) {
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
    if (this.isWrite()) {
      return !this.uploading() && !!this.rights();
    }
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

  private pickPaths(): Promise<string[]> {
    if (this.kind() === "sound") return this.sounds.pick();
    if (this.kind() === "video") return this.videos.pick();
    if (this.kind() === "prompt") return this.prompts.pick();
    return this.images.pick();
  }

  private inspectPaths(paths: string[]): Promise<ImageCheck[]> {
    if (this.kind() === "sound") return this.sounds.inspect(paths);
    if (this.kind() === "video") return this.videos.inspect(paths);
    if (this.kind() === "prompt") return this.prompts.inspect(paths);
    return this.images.inspect(paths);
  }

  private uploadPath(path: string, input: ImageUploadInput): Promise<unknown> {
    if (this.kind() === "sound") return this.sounds.upload(path, input);
    if (this.kind() === "video") return this.videos.upload(path, input);
    if (this.kind() === "prompt") return this.prompts.upload(path, input);
    return this.images.upload(path, input);
  }
}
