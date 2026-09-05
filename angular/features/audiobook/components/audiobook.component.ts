import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  untracked,
} from '@angular/core';
import { Icon } from '@components/icon';
import { ProjectSummary } from '@features/project/project.models';
import { projectModule } from '@features/project/project.rules';
import { ProjectService } from '@features/project/project.service';
import { CoreModule } from '@shared/core.module';

import { AudiobookDialogsService } from '../audiobook.dialogs.service';
import { AudiobookContext, AudiobookMode } from '../audiobook.models';
import { AudiobookService } from '../audiobook.service';
import { AudiobookNavigation } from './audiobook.navigation';
import { AudiobookBanners } from './banners.component';
import { AudiobookList } from './list.component';
import { AudiobookPlayer } from './player.component';
import { AudiobookRail } from './rail.component';
import { AudiobookSubbar } from './subbar.component';
import { AudiobookVoices } from './voices.component';

interface ViewOption {
  mode: AudiobookMode;
  icon: string;
  labelKey: 'audiobook.editor.view.prod' | 'audiobook.editor.view.voices';
}

const VIEWS: ViewOption[] = [
  { mode: 'prod', icon: 'mic', labelKey: 'audiobook.editor.view.prod' },
  { mode: 'voices', icon: 'voice', labelKey: 'audiobook.editor.view.voices' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook',
  imports: [
    Icon,
    CoreModule,
    AudiobookRail,
    AudiobookSubbar,
    AudiobookBanners,
    AudiobookList,
    AudiobookPlayer,
    AudiobookVoices,
  ],
  templateUrl: './audiobook.component.html',
})
export class Audiobook {
  protected readonly navigation = inject(AudiobookNavigation);
  private readonly audiobook = inject(AudiobookService);
  private readonly dialogs = inject(AudiobookDialogsService);
  private readonly projects = inject(ProjectService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly projectId = input.required<number>();
  readonly ctx = computed(this.buildContext.bind(this));
  readonly project = computed(this.findProject.bind(this));
  readonly moduleLabel = projectModule('audiobook').labelKey;
  readonly views = VIEWS;

  constructor() {
    effect(this.ensureData.bind(this));
    effect(this.watchGoto.bind(this));
  }

  setMode(mode: AudiobookMode): void {
    this.audiobook.setMode(this.projectId(), mode);
  }

  generateAll(): void {
    this.dialogs.openGenerate(this.projectId());
  }

  private buildContext(): AudiobookContext | null {
    return this.audiobook.contextOf(this.projectId());
  }

  private findProject(): ProjectSummary | undefined {
    return this.projects.projectById(this.projectId());
  }

  private ensureData(): void {
    const projectId = this.projectId();
    untracked(() => {
      void this.projects.ensureLoaded();
      void this.audiobook.ensureLoaded(projectId);
    });
  }

  private watchGoto(): void {
    const goto = this.ctx()?.view.goto;
    if (goto) {
      untracked(this.scheduleGoto.bind(this));
    }
  }

  private scheduleGoto(): void {
    const id = this.audiobook.consumeGoto(this.projectId());
    if (id) {
      afterNextRender(this.scrollToSegment.bind(this, id), { injector: this.injector });
    }
  }

  private scrollToSegment(id: string): void {
    this.host.nativeElement
      .querySelector(`.ab-seg[data-id="${id}"]`)
      ?.scrollIntoView({ block: 'center' });
  }
}
