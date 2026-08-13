import { Component, HostListener, computed, inject } from "@angular/core";
import { Button } from "../../../../components/button";
import { Dialog } from "../../../../components/dialog";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryService } from "../library.service";
import { LibrarySound } from "../library.sounds.models";
import { LibrarySoundPlayer } from "../library.sounds.player";
import { audioText, durationText, soundCode } from "../library.sounds.rules";
import { LibrarySoundService } from "../library.sounds.service";
import { formatBytes } from "../library.rules";
import { LibrarySoundPlay } from "./sound-play.component";
import { LibrarySoundTime } from "./sound-time.component";
import { LibrarySoundWave } from "./sound-wave.component";

function sameId(id: number, sound: LibrarySound): boolean { return sound.id === id; }

@Component({ selector: "app-library-sound-preview-dialog", standalone: true, imports: [Button, Dialog, I18nPipe, LibrarySoundPlay, LibrarySoundTime, LibrarySoundWave], templateUrl: "./sound-preview.dialog.html", host: { "data-testid": "library-sound-preview-dialog" } })
export class LibrarySoundPreviewDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly sounds = inject(LibrarySoundService);
  private readonly library = inject(LibraryService);
  private readonly player = inject(LibrarySoundPlayer);
  readonly sound = computed(this.findSound.bind(this));
  readonly position = computed(this.buildPosition.bind(this));
  close(): void { this.player.stop(); this.dialogs.closePreview(); }
  previous(): void { this.move(-1); }
  next(): void { this.move(1); }
  hasPrevious(): boolean { return this.position().index > 0; }
  hasNext(): boolean { const position = this.position(); return position.index >= 0 && position.index + 1 < position.total; }
  code(sound: LibrarySound): string { return soundCode(sound.id); }
  duration(sound: LibrarySound): string { return durationText(sound.durationMs); }
  audio(sound: LibrarySound): string { return audioText(sound); }
  size(sound: LibrarySound): string { return formatBytes(sound.size); }
  collection(sound: LibrarySound): string { return sound.collectionId === null ? "" : this.library.collectionById(sound.collectionId)?.name ?? "—"; }
  rightsKey(sound: LibrarySound): I18nKey { return `library.rights.${sound.rights}` as I18nKey; }
  @HostListener("document:keydown", ["$event"]) onKeydown(event: KeyboardEvent): void { if (!this.sound()) return; if (event.key === "Escape") { event.preventDefault(); this.close(); } else if (event.key === "ArrowLeft") { event.preventDefault(); this.previous(); } else if (event.key === "ArrowRight") { event.preventDefault(); this.next(); } }
  private findSound(): LibrarySound | null { const id = this.dialogs.previewSoundId(); return id === null ? null : this.sounds.items().find(sameId.bind(null, id)) ?? null; }
  private sequence() { return this.dialogs.previewSequence() ?? this.sounds.visible().map((sound) => ({ kind: "sound" as const, id: sound.id })); }
  private buildPosition(): { index: number; total: number } { const sound = this.sound(); const sequence = this.sequence(); return { index: sound ? sequence.findIndex((ref) => ref.kind === "sound" && ref.id === sound.id) : -1, total: sequence.length }; }
  private move(offset: number): void { const ref = this.sequence()[this.position().index + offset]; if (ref) this.dialogs.openPreviewRef(ref, this.sequence()); }
}
