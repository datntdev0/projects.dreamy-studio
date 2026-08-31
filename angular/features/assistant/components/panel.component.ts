import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';

import { AssistantService } from '../assistant.service';
import { AssistantChat } from './chat.component';
import { AssistantSessions } from './sessions.component';
import { AssistantStart } from './start.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assistant-panel',
  imports: [AssistantChat, AssistantSessions, AssistantStart],
  templateUrl: './panel.component.html',
})
export class AssistantPanel implements OnInit {
  readonly assistant = inject(AssistantService);

  ngOnInit(): void {
    void this.prepare();
  }

  private async prepare(): Promise<void> {
    const fresh = !this.assistant.loaded();
    await this.assistant.ensureLoaded();
    if (fresh && this.assistant.view() === 'start' && this.assistant.active() === null) {
      this.assistant.chooseScope(this.assistant.contextScope());
    }
  }
}
