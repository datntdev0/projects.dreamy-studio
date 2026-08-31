import { inject, Injectable } from '@angular/core';
import { TabsService } from '@layout/tabs.service';
import { DialogItem } from '@shared/dialog/dialog.models';
import { DialogService } from '@shared/dialog/dialog.service';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { pickByIds } from '@shared/utils/collection';

import { ProjectLabels } from './project.labels';
import { ProjectSummary } from './project.models';
import { toProjectError } from './project.rules';
import { ProjectService } from './project.service';

const ITEM_LIMIT = 8;

@Injectable({ providedIn: 'root' })
export class ProjectConfirmService {
  private readonly dialogs = inject(DialogService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly tabs = inject(TabsService);
  private readonly projects = inject(ProjectService);
  private readonly labels = inject(ProjectLabels);

  deleteProjects(ids: number[]): Promise<boolean> {
    const rows = pickByIds(this.projects.projects(), ids);
    if (rows.length === 0) {
      return Promise.resolve(false);
    }
    const one = rows.length === 1;
    const hidden = Math.max(0, rows.length - ITEM_LIMIT);
    return this.dialogs.ask({
      title: this.languageService.translate(
        one ? 'project.delete.title.one' : 'project.delete.title.other',
        { count: rows.length },
      ),
      eyebrow: this.languageService.translate('project.cap'),
      closeLabel: this.languageService.translate('project.delete.close'),
      items: rows.map(this.toItem.bind(this)),
      itemLimit: ITEM_LIMIT,
      moreLabel:
        hidden > 0
          ? this.languageService.translate('project.delete.more', { count: hidden })
          : undefined,
      warning: this.languageService.translate('project.delete.warning'),
      note: this.languageService.translate('project.delete.note'),
      acknowledge: this.languageService.translate(
        one ? 'project.delete.confirmNote.one' : 'project.delete.confirmNote.other',
        { count: rows.length },
      ),
      confirmLabel:
        this.languageService.translate('project.action.delete') + (one ? '' : ` ${rows.length}`),
      confirmIcon: 'trash',
      onConfirm: this.removeProjects.bind(this, rows),
    });
  }

  private toItem(project: ProjectSummary): DialogItem {
    const template = this.languageService.translate(`project.template.${project.template}`);
    this.projects.ensureCover(project.id);
    return {
      name: project.name,
      meta: `${template} · ${this.labels.pathOf(project)}`,
      image: this.projects.coverUrl.bind(this.projects, project.id),
    };
  }

  private async removeProjects(rows: ProjectSummary[]): Promise<void> {
    const ids = rows.map((project) => project.id);
    try {
      await this.projects.remove(ids);
      this.tabs.closeProjects(ids);
    } catch (cause) {
      throw new Error(
        this.languageService.translate('project.error.generic', {
          detail: toProjectError(cause).detail,
        }),
      );
    }
    const key = rows.length === 1 ? 'project.delete.toast.one' : 'project.delete.toast.other';
    this.toasts.show(
      this.languageService.translate(key, { name: rows[0].name, count: rows.length }),
    );
  }
}
