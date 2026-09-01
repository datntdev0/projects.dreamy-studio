import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { ProjectService } from '@features/project/project.service';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue, setFieldValue } from '@shared/utils/dom';

import { ScriptingLabels } from '../../scripting/components/scripting.labels';
import { ScriptingService } from '../../scripting/scripting.service';
import { AudiobookContext, SpeakerRow } from '../audiobook.models';
import { AudiobookPlayerService } from '../audiobook.player.service';
import { clampSpeed, SPEED_MAX, SPEED_MIN } from '../audiobook.rules';
import { AudiobookService } from '../audiobook.service';
// prettier-ignore
import { speakerDeleteKey, speakerStatusKey, VoiceChoiceGroup,voiceChoiceGroups } from './voices-view';

const SPEED_STEP = 0.05;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-voices',
  imports: [Icon, CoreModule],
  templateUrl: './voices.component.html',
  host: { 'data-testid': 'audiobook-voices', style: 'display: contents' },
})
export class AudiobookVoices {
  private readonly audiobook = inject(AudiobookService);
  private readonly player = inject(AudiobookPlayerService);
  private readonly scripting = inject(ScriptingService);
  private readonly projects = inject(ProjectService);
  private readonly tabs = inject(TabsService);
  private readonly toasts = inject(ToastService);
  private readonly language = inject(LanguageService);
  protected readonly labels = inject(ScriptingLabels);
  protected readonly statusKey = speakerStatusKey;
  protected readonly deleteKey = speakerDeleteKey;
  protected readonly speedMin = SPEED_MIN;
  protected readonly speedMax = SPEED_MAX;
  protected readonly speedStep = SPEED_STEP;

  readonly projectId = input.required<number>();
  readonly ctx = computed(this.buildContext.bind(this));
  readonly groups = computed(this.buildGroups.bind(this));

  issueText(row: SpeakerRow): string {
    return row.issue ? this.audiobook.issueText(row.issue) : '';
  }

  setVoice(row: SpeakerRow, event: Event): void {
    const value = fieldValue(event);
    this.audiobook.setSpeakerVoice(
      this.projectId(),
      row.member.id,
      value === '' ? null : Number(value),
    );
  }

  setSpeed(row: SpeakerRow, event: Event): void {
    const speed = clampSpeed(parseFloat(fieldValue(event)));
    this.audiobook.setSpeakerSpeed(this.projectId(), row.member.id, speed);
    setFieldValue(event, String(speed));
  }

  rename(row: SpeakerRow, event: Event): void {
    const name = fieldValue(event).trim();
    if (!name) {
      setFieldValue(event, row.member.name);
      return;
    }
    this.audiobook.renameSpeaker(this.projectId(), row.member.id, name);
    setFieldValue(event, name);
  }

  remove(row: SpeakerRow): void {
    this.audiobook.removeSpeaker(this.projectId(), row.member.id);
  }

  add(field: HTMLInputElement): void {
    const name = field.value.trim();
    if (!name) {
      field.focus();
      return;
    }
    if (this.audiobook.addSpeaker(this.projectId(), name) === 'duplicate') {
      this.toasts.show(this.language.translate('audiobook.voices.duplicate'), 'warning');
      return;
    }
    field.value = '';
    field.focus();
  }

  async preview(row: SpeakerRow): Promise<void> {
    const result = await this.player.preview(this.projectId(), row.member.id);
    if (result === 'failed') {
      this.toasts.show(this.language.translate('audiobook.voices.previewFailed'), 'warning');
    } else if (result === 'started' && row.previewSendsText) {
      const engine = row.engineName ?? '';
      this.toasts.show(
        this.language.translate('audiobook.voices.previewCloud', { engine }),
        'warning',
      );
    }
  }

  openScripting(): void {
    const unit = this.ctx()?.unit;
    const project = this.projects.projectById(this.projectId());
    if (unit) {
      this.scripting.selectUnit(this.projectId(), unit.id);
    }
    if (project) {
      this.tabs.openModule(project.id, project.name, 'scripting');
    }
  }

  private buildContext(): AudiobookContext | null {
    return this.audiobook.contextOf(this.projectId());
  }

  private buildGroups(): VoiceChoiceGroup[] {
    const ctx = this.ctx();
    return ctx
      ? voiceChoiceGroups(ctx.voiceGroups, {
          translate: this.language.translate.bind(this.language),
          issue: this.audiobook.issueText.bind(this.audiobook),
        })
      : [];
  }
}
