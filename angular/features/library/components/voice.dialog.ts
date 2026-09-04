// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { SegmentOption, Segments } from '@components/segments';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldChecked, fieldValue } from '@shared/utils/dom';

import { LibraryDialogsService } from '../library.dialogs.service';
import { durationText, formatBytes } from '../library.rules';
import { LibrarySound } from '../library.sounds.models';
import { LibrarySoundService } from '../library.sounds.service';
// prettier-ignore
import { VOICE_LANGUAGES, VOICE_REFERENCE_MODES, VOICE_SOURCES, VoiceEngine, VoiceEngineGroup, VoiceGender, VoicePreset, VoiceReference, VoiceReferenceFile, VoiceReferenceMode, VoiceSource } from '../library.voices.models';
import { VOICE_RECORDING_MAX_MS, VoiceRecorder } from '../library.voices.recorder';
// prettier-ignore
import { buildVoiceReference, engineGroupKey, engineOptionText, engineSupportsSource, findEngine, firstReadyEngine, groupVoiceEngines, hasReadyEngine, isVoiceDraftValid, presetOptionText, soundOptionText, supportedPreset, supportedVoiceSource, toVoiceInput, VoiceDraft, voiceGenderOptions, voiceLanguageText, voiceSourceKey } from '../library.voices.rules';
import { LibraryVoiceService } from '../library.voices.service';
import { LibraryVoiceNotice } from './voice-notice.component';

const DEFAULT_LANGUAGE = VOICE_LANGUAGES[0];
const DEFAULT_GENDER: VoiceGender = 'female';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-voice-dialog',
  imports: [Button, Icon, Segments, CoreModule, LibraryVoiceNotice],
  templateUrl: './voice.dialog.html',
  host: { 'data-testid': 'library-voice-dialog' },
})
export class LibraryVoiceDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly voices = inject(LibraryVoiceService);
  private readonly sounds = inject(LibrarySoundService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly translate = this.languageService.translate.bind(this.languageService);
  readonly open = this.dialogs.createVoiceOpen;
  readonly name = signal('');
  readonly engineId = signal('');
  readonly requestedSource = signal<VoiceSource>('preset');
  readonly referenceMode = signal<VoiceReferenceMode>('library');
  readonly requestedPreset = signal('');
  readonly referenceSoundId = signal<number | null>(null);
  readonly recorder = new VoiceRecorder();
  readonly consent = signal(false);
  readonly prompt = signal('');
  readonly language = signal<string>(DEFAULT_LANGUAGE);
  readonly requestedGender = signal<VoiceGender | null>(null);
  readonly description = signal('');
  readonly referenceFile = signal<VoiceReferenceFile | null>(null);
  readonly busy = signal(false);
  readonly presets = computed(this.buildPresets.bind(this));
  readonly selectedPreset = computed(this.buildSelectedPreset.bind(this));
  readonly preset = computed(this.buildPresetId.bind(this));
  readonly gender = computed(this.buildGender.bind(this));
  readonly languages = VOICE_LANGUAGES;
  readonly recordingLimit = durationText(VOICE_RECORDING_MAX_MS);
  readonly engineGroups = computed(this.buildEngineGroups.bind(this));
  readonly anyReady = computed(this.buildAnyReady.bind(this));
  readonly engine = computed(this.buildEngine.bind(this));
  readonly source = computed(this.buildSource.bind(this));
  readonly reference = computed(this.buildReference.bind(this));
  readonly referenceOptions = computed(this.buildReferenceOptions.bind(this));
  readonly canSubmit = computed(this.buildCanSubmit.bind(this));
  readonly sourceOptions = computed(this.buildSourceOptions.bind(this));
  readonly genderOptions = computed(this.buildGenderOptions.bind(this));
  readonly soundItems = this.sounds.items;

  constructor() {
    effect(this.syncOpen.bind(this));
    inject(DestroyRef).onDestroy(this.recorder.discard.bind(this.recorder));
  }

  groupKey(group: VoiceEngineGroup): LanguageKey {
    return engineGroupKey(group.kind);
  }

  engineText(engine: VoiceEngine): string {
    return engineOptionText(engine, this.translate);
  }

  languageText(code: string): string {
    return voiceLanguageText(code, this.translate);
  }

  presetText(preset: VoicePreset): string {
    return presetOptionText(preset, this.translate);
  }

  soundText(sound: LibrarySound): string {
    return soundOptionText(sound);
  }

  sizeText(size: number): string {
    return formatBytes(size);
  }

  elapsedText(): string {
    return durationText(this.recorder.elapsedMs());
  }

  onName(event: Event): void {
    this.name.set(fieldValue(event));
  }

  onDescription(event: Event): void {
    this.description.set(fieldValue(event));
  }

  onEngine(event: Event): void {
    this.engineId.set(fieldValue(event));
    this.releaseRecorder();
  }

  onSource(value: string): void {
    this.requestedSource.set(value as VoiceSource);
    this.releaseRecorder();
  }

  onReferenceMode(value: string): void {
    this.referenceMode.set(value as VoiceReferenceMode);
    this.releaseRecorder();
  }

  async pickFile(): Promise<void> {
    const file = await this.voices.pickReferenceFile();
    if (file) this.referenceFile.set(file);
  }

  removeFile(): void {
    this.referenceFile.set(null);
  }

  startRecording(): void {
    void this.recorder.start();
  }

  stopRecording(): void {
    this.recorder.stop();
  }

  togglePlayback(): void {
    void this.recorder.togglePlayback();
  }

  discardRecording(): void {
    this.recorder.discard();
  }

  onPreset(event: Event): void {
    this.requestedPreset.set(fieldValue(event));
    this.requestedGender.set(null);
  }

  onSound(event: Event): void {
    const value = fieldValue(event);
    this.referenceSoundId.set(value ? Number(value) : null);
  }

  onConsent(event: Event): void {
    this.consent.set(fieldChecked(event));
  }

  onPrompt(event: Event): void {
    this.prompt.set(fieldValue(event));
  }

  onLanguage(event: Event): void {
    this.language.set(fieldValue(event));
  }

  onGender(value: string): void {
    this.requestedGender.set(value as VoiceGender);
  }

  close(): void {
    this.recorder.discard();
    this.dialogs.closeCreateVoice();
  }

  async submit(): Promise<void> {
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true);
    try {
      const input = toVoiceInput(this.draft(), {
        language: this.language(),
        gender: this.gender(),
      });
      const voice = await this.voices.create(input);
      this.voices.select(voice.id);
      this.close();
    } catch {
      this.toasts.show(this.translate('library.voice.toast.failed'), 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private draft(): VoiceDraft {
    return {
      name: this.name(),
      engine: this.engine(),
      source: this.source(),
      preset: this.preset(),
      reference: this.reference(),
      consent: this.consent(),
      prompt: this.prompt(),
      description: this.description(),
    };
  }

  private buildEngineGroups(): VoiceEngineGroup[] {
    return groupVoiceEngines(this.voices.engines());
  }

  private buildAnyReady(): boolean {
    return hasReadyEngine(this.voices.engines());
  }

  private buildEngine(): VoiceEngine | null {
    const engines = this.voices.engines();
    return findEngine(engines, this.engineId()) ?? firstReadyEngine(engines);
  }

  private buildSource(): VoiceSource {
    return supportedVoiceSource(this.engine(), this.requestedSource());
  }

  private buildPresets(): VoicePreset[] {
    return this.engine()?.presets ?? [];
  }

  private buildSelectedPreset(): VoicePreset | null {
    return supportedPreset(this.engine(), this.requestedPreset());
  }

  private buildPresetId(): string {
    return this.selectedPreset()?.id ?? '';
  }

  private buildGender(): VoiceGender {
    const requested = this.requestedGender();
    if (requested) return requested;
    const preset = this.source() === 'preset' ? this.selectedPreset() : null;
    return preset?.gender ?? DEFAULT_GENDER;
  }

  private buildReference(): VoiceReference | null {
    return buildVoiceReference({
      mode: this.referenceMode(),
      soundId: this.referenceSoundId(),
      file: this.referenceFile(),
      recording: this.recorder.recording(),
    });
  }

  private buildReferenceOptions(): SegmentOption[] {
    return VOICE_REFERENCE_MODES.map(this.toReferenceOption.bind(this));
  }

  private toReferenceOption(mode: VoiceReferenceMode): SegmentOption {
    return { value: mode, label: this.translate(`library.voice.dialog.reference.${mode}`) };
  }

  private releaseRecorder(): void {
    if (this.source() !== 'clone' || this.referenceMode() !== 'record') this.recorder.discard();
  }

  private buildCanSubmit(): boolean {
    return isVoiceDraftValid(this.draft());
  }

  private buildSourceOptions(): SegmentOption[] {
    return VOICE_SOURCES.map(this.toSourceOption.bind(this, this.engine()));
  }

  private buildGenderOptions(): SegmentOption[] {
    return voiceGenderOptions(this.translate);
  }

  private toSourceOption(engine: VoiceEngine | null, source: VoiceSource): SegmentOption {
    return {
      value: source,
      label: this.translate(voiceSourceKey(source)),
      disabled: !engineSupportsSource(engine, source),
    };
  }

  private syncOpen(): void {
    untracked(this.applyOpen.bind(this, this.open()));
  }

  private applyOpen(open: boolean): void {
    this.recorder.discard();
    if (!open) return;
    this.reset();
    void this.sounds.ensureLoaded();
  }

  private reset(): void {
    this.name.set('');
    this.engineId.set('');
    this.requestedSource.set('preset');
    this.referenceMode.set('library');
    this.referenceFile.set(null);
    this.description.set('');
    this.requestedPreset.set('');
    this.referenceSoundId.set(null);
    this.consent.set(false);
    this.prompt.set('');
    this.language.set(DEFAULT_LANGUAGE);
    this.requestedGender.set(null);
    this.busy.set(false);
  }
}
