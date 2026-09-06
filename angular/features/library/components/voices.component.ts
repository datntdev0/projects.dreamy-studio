// prettier-ignore
import { ChangeDetectionStrategy, Component, HostListener, inject, OnInit } from '@angular/core';
// prettier-ignore
import { Datatable, DatatableCell, DatatableColumn, DatatableRowEvent } from '@components/datatable';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { fieldValue, isDeleteShortcut, isModalOpen } from '@shared/utils/dom';

import { LibraryConfirmService } from '../library.confirm.service';
import { LibraryDialogsService } from '../library.dialogs.service';
import { LibraryService } from '../library.service';
import { LibraryVoice } from '../library.voices.models';
// prettier-ignore
import { hasReadyEngine, voiceGenderKey, voiceLanguageText } from '../library.voices.rules';
import { LibraryVoiceService } from '../library.voices.service';
import { LibraryVoiceAvatar } from './voice-avatar.component';
import { LibraryVoiceEngine } from './voice-engine.component';
import { LibraryVoiceNotice } from './voice-notice.component';
import { LibraryVoicePlay } from './voice-play.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-voices',
  imports: [
    Datatable,
    DatatableCell,
    Icon,
    CoreModule,
    LibraryVoiceAvatar,
    LibraryVoiceEngine,
    LibraryVoiceNotice,
    LibraryVoicePlay,
  ],
  templateUrl: './voices.component.html',
})
export class LibraryVoices implements OnInit {
  readonly voices = inject(LibraryVoiceService);
  private readonly library = inject(LibraryService);
  private readonly languageService = inject(LanguageService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  private readonly translate = this.languageService.translate.bind(this.languageService);

  ngOnInit(): void {
    void this.voices.ensureLoaded();
  }

  onQuery(event: Event): void {
    this.voices.query.set(fieldValue(event));
  }

  select(voice: LibraryVoice): void {
    this.voices.select(voice.id);
  }

  play(voice: LibraryVoice): void {
    this.select(voice);
    void this.voices.togglePreview(voice.id);
  }

  openCreate(): void {
    this.dialogs.openCreateVoice();
  }

  clearAllFilters(): void {
    this.voices.query.set('');
    this.library.clearFilters();
  }

  hasActiveFilters(): boolean {
    return this.voices.query().trim().length > 0 || this.library.filtersActive();
  }

  noEngineReady(): boolean {
    return !hasReadyEngine(this.voices.engines());
  }

  isSelected(voice: LibraryVoice): boolean {
    return this.voices.selectedId() === voice.id;
  }

  languageText(voice: LibraryVoice): string {
    return voiceLanguageText(voice.language, this.translate);
  }

  genderText(voice: LibraryVoice): string {
    return this.translate(voiceGenderKey(voice.gender));
  }

  get notReadyHint(): string {
    return this.translate('library.voice.engine.notReady');
  }

  readonly tableRowClass = (row: object): Record<string, boolean> => ({
    'is-selected': this.isSelected(this.voiceOf(row)),
  });

  get tableColumns(): DatatableColumn[] {
    return [
      { key: 'name', label: this.translate('library.voice.column.name') },
      { key: 'engine', label: this.translate('library.voice.column.engine'), width: '190px' },
      { key: 'language', label: this.translate('library.voice.column.language'), width: '120px' },
      { key: 'gender', label: this.translate('library.voice.column.gender'), width: '90px' },
      { key: 'actions', label: '', width: '120px' },
    ];
  }

  voiceOf(row: object): LibraryVoice {
    return row as LibraryVoice;
  }

  onRowSelected(index: number): void {
    const item = this.voices.visible()[index];
    if (item) this.select(item);
  }

  onRowDblClick(event: DatatableRowEvent): void {
    this.play(this.voiceOf(event.row));
  }

  onRowEnter(event: DatatableRowEvent): void {
    this.play(this.voiceOf(event.row));
  }

  @HostListener('document:keydown', ['$event'])
  onDeleteKey(event: KeyboardEvent): void {
    const id = this.voices.selectedId();
    if (
      !isDeleteShortcut(event) ||
      id === null ||
      this.dialogs.createVoiceOpen() ||
      isModalOpen()
    ) {
      return;
    }
    this.confirms.deleteVoices([id]);
  }
}
