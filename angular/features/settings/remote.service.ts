import { computed, Injectable, signal } from '@angular/core';

import { RemoteView } from './backend.models';
import { BackendCommands, BackendStore, toView } from './backend.store';

const REMOTE_COMMANDS: BackendCommands = {
  status: 'backend_remote_status',
  models: 'backend_remote_model_list',
  modelDownload: 'backend_remote_model_download',
  modelCancel: 'backend_remote_model_cancel',
  modelRemove: 'backend_remote_model_remove',
};

function toRemoteView(raw: Partial<RemoteView> | null | undefined): RemoteView {
  return {
    ...toView(raw),
    url: raw?.url ?? '',
    keyHint: raw?.keyHint ?? '',
    active: raw?.active === true,
  };
}

@Injectable({ providedIn: 'root' })
export class RemoteBackendService extends BackendStore<RemoteView> {
  protected readonly commands = REMOTE_COMMANDS;

  readonly url = signal('');
  readonly keyHint = signal('');
  readonly active = signal(false);
  readonly connected = computed(this.isConnected.bind(this));

  async connect(url: string, apiKey: string): Promise<boolean> {
    this.server.update((server) => ({ ...server, status: 'starting', error: '' }));
    let succeeded = true;
    try {
      const view = await this.ipc.invoke<Partial<RemoteView>>('backend_remote_connect', {
        url,
        apiKey,
      });
      this.applyView(toRemoteView(view));
    } catch (error) {
      succeeded = false;
      this.fail(error, 'settings.remote.msg.failed');
    }
    await this.refresh();
    return succeeded;
  }

  async disconnect(): Promise<void> {
    await this.run('backend_remote_disconnect');
  }

  async setActive(active: boolean): Promise<void> {
    if (active && !this.connected()) {
      return;
    }
    this.active.set(active);
    await this.run('backend_remote_active_set', { active });
  }

  protected toView(raw: Partial<RemoteView> | null | undefined): RemoteView {
    return toRemoteView(raw);
  }

  protected override applyView(view: RemoteView): void {
    super.applyView(view);
    this.url.set(view.url);
    this.keyHint.set(view.keyHint);
    this.active.set(view.active);
  }

  private isConnected(): boolean {
    return this.server().status === 'running';
  }
}
