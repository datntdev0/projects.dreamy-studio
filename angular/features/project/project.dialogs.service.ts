import { Injectable, signal } from '@angular/core';

import { ProjectTemplateId } from './project.models';

@Injectable({ providedIn: 'root' })
export class ProjectDialogsService {
  readonly createOpen = signal(false);
  readonly createTemplate = signal<ProjectTemplateId | null>(null);

  openCreate(template: ProjectTemplateId | null = null): void {
    this.createTemplate.set(template);
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }
}
