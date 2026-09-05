// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { NovelSummary } from '@features/novel/novel.models';
import { NovelService } from '@features/novel/novel.service';
import { targetsOf, translatedCount } from '@features/novel/novel.translation.rules';
import { NovelTranslationService } from '@features/novel/novel.translation.service';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldChecked, fieldValue } from '@shared/utils/dom';

import { ProjectDialogsService } from '../project.dialogs.service';
import { ProjectInput, ProjectTemplateId, ProjectTextVersion } from '../project.models';
// prettier-ignore
import { PROJECT_TEMPLATES, toProjectError, validateProjectName, validateRange } from '../project.rules';
import { ProjectService } from '../project.service';

interface CreateForm {
  name: string;
  template: ProjectTemplateId;
  novelId: number | null;
  version: ProjectTextVersion;
  allChapters: boolean;
  rangeFrom: number | null;
  rangeTo: number | null;
}

const EMPTY_FORM: CreateForm = {
  name: '',
  template: 'audiobook',
  novelId: null,
  version: 'original',
  allChapters: true,
  rangeFrom: 1,
  rangeTo: 1,
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-create-dialog',
  imports: [Button, Icon, CoreModule],
  templateUrl: './create.dialog.html',
  host: { 'data-testid': 'project-create-dialog' },
})
export class ProjectCreateDialog {
  private readonly projects = inject(ProjectService);
  readonly novels = inject(NovelService);
  private readonly translations = inject(NovelTranslationService);
  private readonly dialogs = inject(ProjectDialogsService);
  private readonly tabs = inject(TabsService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly open = this.dialogs.createOpen;
  readonly form = signal<CreateForm>({ ...EMPTY_FORM });
  readonly busy = signal(false);
  readonly nameError = signal<LanguageKey | null>(null);
  readonly rangeError = signal<LanguageKey | null>(null);
  readonly formError = signal('');
  readonly templates = PROJECT_TEMPLATES;
  readonly selectedNovel = computed(this.buildSelectedNovel.bind(this));
  readonly versions = computed(this.buildVersions.bind(this));

  constructor() {
    effect(this.syncOpen.bind(this));
    effect(this.focusName.bind(this));
    effect(this.loadNovels.bind(this));
    effect(this.loadTranslations.bind(this));
  }

  versionLabel(version: ProjectTextVersion): string {
    if (version === 'original') {
      return this.languageService.translate('project.source.original');
    }
    return `${this.languageService.translate('project.source.translation')} ${version}`;
  }

  onVersion(event: Event): void {
    const version = fieldValue(event) as ProjectTextVersion;
    this.form.set({ ...this.form(), version });
  }

  close(): void {
    this.dialogs.closeCreate();
  }

  onName(event: Event): void {
    const name = fieldValue(event);
    this.form.set({ ...this.form(), name });
    this.validateName();
    this.formError.set('');
  }

  onTemplate(template: ProjectTemplateId): void {
    this.form.set({ ...this.form(), template });
  }

  onNovel(event: Event): void {
    const raw = fieldValue(event);
    const novelId = raw ? Number(raw) : null;
    const novel = novelId === null ? undefined : this.novels.novelById(novelId);
    this.form.set({
      ...this.form(),
      novelId,
      version: 'original',
      allChapters: true,
      rangeFrom: 1,
      rangeTo: novel?.chapterCount ?? 1,
    });
    this.rangeError.set(null);
    this.formError.set('');
  }

  onAllChapters(event: Event): void {
    const allChapters = fieldChecked(event);
    const count = this.selectedNovel()?.chapterCount ?? 1;
    this.form.set({ ...this.form(), allChapters, rangeFrom: 1, rangeTo: count });
    this.rangeError.set(null);
  }

  onRange(field: 'rangeFrom' | 'rangeTo', event: Event): void {
    const raw = fieldValue(event);
    const value = raw === '' ? null : Number(raw);
    this.form.set({ ...this.form(), [field]: value });
    this.rangeError.set(null);
  }

  async submit(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const value = this.form();
    const validName = this.validateName();
    const novel = this.selectedNovel();
    const validRange =
      !novel ||
      value.allChapters ||
      (validateRange(value.rangeFrom, value.rangeTo) &&
        value.rangeTo !== null &&
        value.rangeTo <= novel.chapterCount);
    if (!validRange) {
      this.rangeError.set('project.create.rangeInvalid');
    }
    if (!validName || !validRange) {
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    try {
      const input = this.toInput(value);
      const created = await this.projects.create(input);
      this.tabs.openProjects();
      this.projects.selectOnly(created.id);
      this.close();
      this.toasts.show(
        this.languageService.translate('project.create.toast', { name: created.name }),
      );
    } catch (cause) {
      this.applyBackendError(cause);
    } finally {
      this.busy.set(false);
    }
  }

  private validateName(): boolean {
    const error = validateProjectName(this.form().name);
    this.nameError.set(error ? 'project.error.empty' : null);
    return error === null;
  }

  private toInput(form: CreateForm): ProjectInput {
    const novel = form.novelId === null ? undefined : this.novels.novelById(form.novelId);
    return {
      name: form.name.trim(),
      template: form.template,
      description: '',
      novelId: novel?.id ?? null,
      srcKind: novel ? (form.version === 'original' ? 'original' : 'translation') : null,
      srcLang: novel && form.version !== 'original' ? form.version : null,
      rangeFrom: novel && !form.allChapters ? form.rangeFrom : null,
      rangeTo: novel && !form.allChapters ? form.rangeTo : null,
    };
  }

  private buildVersions(): ProjectTextVersion[] {
    const novel = this.selectedNovel();
    if (!novel) {
      return [];
    }
    const translated = targetsOf(novel.lang).filter(
      (target) => translatedCount(this.translations.of(novel.id, target)) > 0,
    );
    return ['original', ...translated];
  }

  private loadTranslations(): void {
    const novel = this.selectedNovel();
    if (novel) {
      untracked(this.ensureTranslations.bind(this, novel));
    }
  }

  private ensureTranslations(novel: NovelSummary): void {
    for (const target of targetsOf(novel.lang)) {
      void this.translations.ensure(novel.id, target).catch(this.ignore);
    }
  }

  private ignore(): void {
    return;
  }

  private buildSelectedNovel() {
    const id = this.form().novelId;
    return id === null ? undefined : this.novels.novelById(id);
  }

  private applyBackendError(cause: unknown): void {
    const code = toProjectError(cause).code;
    if (code === 'range_invalid') {
      this.rangeError.set('project.create.rangeInvalid');
      return;
    }
    if (code === 'novel_not_found') {
      this.formError.set(this.languageService.translate('project.create.novelMissing'));
      return;
    }
    const error = toProjectError(cause);
    this.formError.set(
      this.languageService.translate('project.error.generic', { detail: error.detail }),
    );
  }

  private syncOpen(): void {
    if (this.open()) {
      untracked(this.resetForm.bind(this));
    }
  }

  private resetForm(): void {
    this.form.set({ ...EMPTY_FORM });
    this.nameError.set(null);
    this.rangeError.set(null);
    this.formError.set('');
    this.busy.set(false);
  }

  private focusName(): void {
    const input = this.nameInput();
    if (input && this.open()) {
      setTimeout(this.focusElement.bind(this, input.nativeElement));
    }
  }

  private focusElement(element: HTMLElement): void {
    element.focus();
  }

  private loadNovels(): void {
    if (this.open()) {
      void this.novels.ensureLoaded();
    }
  }
}
