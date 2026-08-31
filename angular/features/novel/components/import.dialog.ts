// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { Button } from '@components/button';
import { Cover } from '@components/cover';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
// prettier-ignore
import { DesktopDragDropEvent, DesktopIpcService, DesktopUnlisten } from '@shared/desktop/desktop-ipc.service';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { noop } from '@shared/utils/noop';

import { NovelDialogsService } from '../novel.dialogs.service';
// prettier-ignore
import { InspectCheck, InspectEvent, InspectStep, NovelFormValue, NovelLang, PackageSummary } from '../novel.models';
// prettier-ignore
import { applyInspectEvent, fileNameOf, formatCount, inspectPercent, NOVEL_LANGS, toNovelError, toNovelInput } from '../novel.rules';
import { NovelService } from '../novel.service';

type ImportStep = 1 | 2 | 3;

type CheckState = 'idle' | 'running' | 'ok' | 'fail';

interface StepItem {
  n: ImportStep;
  key: LanguageKey;
}

interface LangOption {
  value: NovelLang;
  key: LanguageKey;
}

const STEP_ITEMS: StepItem[] = [
  { n: 1, key: 'novel.import.steps.file' },
  { n: 2, key: 'novel.import.steps.check' },
  { n: 3, key: 'novel.import.steps.preview' },
];

const CHECK_KEYS: Record<InspectStep, LanguageKey> = {
  format: 'novel.import.check.step.format',
  open: 'novel.import.check.step.open',
  manifest: 'novel.import.check.step.manifest',
  chapters: 'novel.import.check.step.chapters',
  list: 'novel.import.check.step.list',
  cover: 'novel.import.check.step.cover',
};

const LANG_KEYS: Record<NovelLang, LanguageKey> = {
  EN: 'novel.lang.EN',
  VI: 'novel.lang.VI',
  ZH: 'novel.lang.ZH',
  JA: 'novel.lang.JA',
  KO: 'novel.lang.KO',
};

const EMPTY_FORM: NovelFormValue = {
  title: '',
  name: '',
  author: '',
  lang: 'EN',
  description: '',
  tags: '',
};

function isWarn(check: InspectCheck): boolean {
  return check.status === 'warn';
}

function langOption(value: NovelLang): LangOption {
  return { value, key: LANG_KEYS[value] };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-import-dialog',
  imports: [Button, Icon, CoreModule, Cover],
  templateUrl: './import.dialog.html',
  host: { 'data-testid': 'novel-import-dialog' },
})
export class NovelImportDialog {
  private readonly dialogs = inject(NovelDialogsService);
  private readonly novels = inject(NovelService);
  private readonly ipc = inject(DesktopIpcService);
  private readonly languageService = inject(LanguageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly toasts = inject(ToastService);
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly displayInput = viewChild<ElementRef<HTMLInputElement>>('displayInput');
  private token = 0;
  private listenToken = 0;
  private unlisten: DesktopUnlisten = noop;
  private formSource: string | null = null;

  readonly open = this.dialogs.importOpen;
  readonly steps = STEP_ITEMS;
  readonly langOptions = NOVEL_LANGS.map(langOption);
  readonly step = signal<ImportStep>(1);
  readonly path = signal<string | null>(null);
  readonly over = signal(false);
  readonly state = signal<CheckState>('idle');
  readonly checks = signal<InspectCheck[]>([]);
  readonly error = signal('');
  readonly info = signal<PackageSummary | null>(null);
  readonly form = signal<NovelFormValue>(EMPTY_FORM);
  readonly titleInvalid = signal(false);
  readonly importing = signal(false);
  readonly importError = signal('');

  readonly fileName = computed(this.buildFileName.bind(this));
  readonly percent = computed(this.buildPercent.bind(this));
  readonly warnCount = computed(this.buildWarnCount.bind(this));
  readonly okDetail = computed(this.buildOkDetail.bind(this));
  readonly wordsText = computed(this.buildWordsText.bind(this));
  readonly duplicate = computed(this.buildDuplicate.bind(this));

  constructor() {
    effect(this.syncOpen.bind(this));
    effect(this.focusDefault.bind(this));
    inject(DestroyRef).onDestroy(this.teardown.bind(this));
  }

  checkKey(step: InspectStep): LanguageKey {
    return CHECK_KEYS[step];
  }

  stepClass(n: ImportStep): string {
    const current = this.step();
    if (n === current) {
      return 'is-active';
    }
    return n < current ? 'is-done' : '';
  }

  cancel(): void {
    if (this.importing()) {
      return;
    }
    this.invalidate();
    this.dialogs.closeImport();
  }

  async pick(): Promise<void> {
    let picked: string | null = null;
    try {
      picked = await this.novels.packagePick();
    } catch {
      picked = null;
    }
    if (picked && this.open() && this.step() === 1) {
      this.setFile(picked);
    }
  }

  clearFile(): void {
    this.path.set(null);
  }

  check(): void {
    const path = this.path();
    if (path) {
      void this.runCheck(path);
    }
  }

  backToFile(): void {
    this.token += 1;
    this.state.set('idle');
    this.step.set(1);
  }

  next(): void {
    if (this.state() === 'ok') {
      this.step.set(3);
    }
  }

  backToCheck(): void {
    this.importError.set('');
    this.step.set(2);
  }

  setField(field: keyof NovelFormValue, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    this.form.set({ ...this.form(), [field]: target.value });
    if (field === 'title' && target.value.trim()) {
      this.titleInvalid.set(false);
    }
  }

  async submit(): Promise<void> {
    const path = this.path();
    const info = this.info();
    if (!path || !info || this.importing()) {
      return;
    }
    const input = toNovelInput(this.form());
    if (!input.title) {
      this.titleInvalid.set(true);
      this.titleInput()?.nativeElement.focus();
      return;
    }
    this.importing.set(true);
    this.importError.set('');
    try {
      const created = await this.novels.packageImport(path, input);
      this.novels.select(created.id);
      this.invalidate();
      this.dialogs.closeImport();
      this.toasts.show(
        this.languageService.translate('novel.toast.imported', {
          title: created.title,
          count: info.chapterCount,
        }),
      );
    } catch (cause) {
      this.importError.set(
        this.languageService.translate('novel.import.error.failed', {
          detail: toNovelError(cause).detail,
        }),
      );
    } finally {
      this.importing.set(false);
    }
  }

  private focusDefault(): void {
    this.step();
    this.state();
    this.path();
    const input = this.displayInput();
    setTimeout(this.applyDefaultFocus.bind(this, input ? input.nativeElement : null));
  }

  private applyDefaultFocus(input: HTMLElement | null): void {
    const target = input ?? this.primaryButton();
    if (target && this.open()) {
      target.focus();
    }
  }

  private primaryButton(): HTMLButtonElement | null {
    const button = this.host.nativeElement.querySelector<HTMLButtonElement>(
      '.modal-foot .btn-primary',
    );
    return button && !button.disabled ? button : null;
  }

  private syncOpen(): void {
    const open = this.open();
    untracked(this.applyOpen.bind(this, open));
  }

  private applyOpen(open: boolean): void {
    if (open) {
      this.reset();
      void this.listen();
    } else {
      this.stopListening();
      this.invalidate();
    }
  }

  private reset(): void {
    this.token += 1;
    this.formSource = null;
    this.step.set(1);
    this.path.set(null);
    this.over.set(false);
    this.state.set('idle');
    this.checks.set([]);
    this.error.set('');
    this.info.set(null);
    this.form.set(EMPTY_FORM);
    this.titleInvalid.set(false);
    this.importing.set(false);
    this.importError.set('');
  }

  private invalidate(): void {
    this.token += 1;
    this.over.set(false);
  }

  private setFile(path: string): void {
    this.path.set(path);
    this.over.set(false);
  }

  private async listen(): Promise<void> {
    this.stopListening();
    const mine = this.listenToken;
    const off = await this.ipc.onDragDrop(this.onDragEvent.bind(this));
    if (mine === this.listenToken) {
      this.unlisten = off;
    } else {
      off();
    }
  }

  private stopListening(): void {
    this.listenToken += 1;
    this.unlisten();
    this.unlisten = noop;
  }

  private onDragEvent(event: DesktopDragDropEvent): void {
    if (this.step() !== 1 || !this.open()) {
      this.over.set(false);
      return;
    }
    if (event.type === 'enter' || event.type === 'over') {
      this.over.set(true);
    } else if (event.type === 'leave') {
      this.over.set(false);
    } else if (event.paths[0]) {
      this.setFile(event.paths[0]);
    }
  }

  private async runCheck(path: string): Promise<void> {
    this.token += 1;
    const mine = this.token;
    this.step.set(2);
    this.state.set('running');
    this.checks.set([]);
    this.error.set('');
    this.info.set(null);
    try {
      const summary = await this.novels.packageInspect(path, this.onInspectEvent.bind(this, mine));
      if (mine === this.token) {
        this.finishCheck(path, summary);
      }
    } catch (cause) {
      if (mine === this.token) {
        this.failCheck(path, cause);
      }
    }
  }

  private onInspectEvent(mine: number, event: InspectEvent): void {
    if (mine === this.token) {
      this.checks.set(applyInspectEvent(this.checks(), event));
    }
  }

  private finishCheck(path: string, summary: PackageSummary): void {
    this.info.set(summary);
    this.state.set('ok');
    if (this.formSource !== path) {
      this.formSource = path;
      this.form.set({
        title: summary.title,
        name: summary.name,
        author: summary.author,
        lang: summary.lang,
        description: '',
        tags: '',
      });
    }
  }

  private failCheck(path: string, cause: unknown): void {
    const error = toNovelError(cause);
    this.state.set('fail');
    if (error.code === 'package_format') {
      this.error.set(
        this.languageService.translate('novel.import.error.badFormat', { name: fileNameOf(path) }),
      );
    } else {
      this.error.set(error.detail);
    }
  }

  private teardown(): void {
    this.stopListening();
    this.invalidate();
  }

  private buildFileName(): string {
    const path = this.path();
    return path ? fileNameOf(path) : '';
  }

  private buildPercent(): number {
    return inspectPercent(this.checks());
  }

  private buildWarnCount(): number {
    return this.checks().filter(isWarn).length;
  }

  private buildOkDetail(): string {
    const info = this.info();
    if (!info) {
      return '';
    }
    const base = this.languageService.translate('novel.import.result.okDetail', {
      chapters: info.chapterCount,
      words: formatCount(info.wordCount),
      lang: this.languageService.translate(LANG_KEYS[info.lang]),
    });
    const warns = this.warnCount();
    if (!warns) {
      return base;
    }
    return (
      base + this.languageService.translate('novel.import.result.okWarnings', { count: warns })
    );
  }

  private buildWordsText(): string {
    const info = this.info();
    return info ? formatCount(info.wordCount) : '';
  }

  private buildDuplicate(): boolean {
    return this.novels.isDuplicateTitle(this.form().title);
  }
}
