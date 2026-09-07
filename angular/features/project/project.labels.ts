import { inject, Injectable } from '@angular/core';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { displayName, formatMonthDay, formatStamp } from '../novel/novel.rules';
import { NovelService } from '../novel/novel.service';
import { ProjectSummary, ProjectTemplateId } from './project.models';
import { templateIcon } from './project.rules';

@Injectable({ providedIn: 'root' })
export class ProjectLabels {
  private readonly languageService = inject(LanguageService);
  private readonly novels = inject(NovelService);

  novelNameOf(project: ProjectSummary): string {
    if (project.novelId === null) {
      return this.languageService.translate('project.source.none');
    }
    const novel = this.novels.novelById(project.novelId);
    return project.novelMissing || !novel
      ? this.languageService.translate('project.source.missing')
      : displayName(novel);
  }

  versionOf(project: ProjectSummary): string {
    const novel = project.novelId === null ? undefined : this.novels.novelById(project.novelId);
    if (project.novelMissing || !novel) {
      return '—';
    }
    const kind = this.languageService.translate(
      project.srcKind === 'translation' ? 'project.source.translation' : 'project.source.original',
    );
    return `${kind} ${project.srcLang ?? novel.lang}`;
  }

  sourceOf(project: ProjectSummary): string {
    const version = this.versionOf(project);
    return version === '—'
      ? this.novelNameOf(project)
      : `${this.novelNameOf(project)} · ${version}`;
  }

  rangeOf(project: ProjectSummary): string {
    if (project.novelId === null || project.rangeFrom === null || project.rangeTo === null) {
      return '';
    }
    return this.languageService.translate('project.range', {
      from: project.rangeFrom,
      to: project.rangeTo,
    });
  }

  sourceLine(project: ProjectSummary): string {
    const range = this.rangeOf(project);
    return range ? `${this.sourceOf(project)} · ${range}` : this.sourceOf(project);
  }

  pathOf(project: ProjectSummary): string {
    return `${project.folder.replace(/\//g, '\\')}\\`;
  }

  stampOf(value: string): string {
    return formatStamp(value);
  }

  dayOf(value: string): string {
    return formatMonthDay(value);
  }

  dateOf(value: string): string {
    return formatStamp(value).slice(0, 10);
  }

  iconOf(template: ProjectTemplateId): string {
    return templateIcon(template);
  }

  templateKey(template: ProjectTemplateId): LanguageKey {
    return `project.template.${template}`;
  }
}
