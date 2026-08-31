import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ProjectDialogsService {
  readonly createOpen = signal(false);

  openCreate(): void {
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }
}
