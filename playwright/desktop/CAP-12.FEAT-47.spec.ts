import { join } from 'node:path';

import type { BackendModelId } from '../pages/settings.ts';
// prettier-ignore
import { expect, MODEL_DOWNLOADING, MODEL_ERROR, MODEL_INSTALLED, MODEL_MSG_FAILED, MODEL_MSG_NONE, MODEL_MSG_READY, MODEL_NONE, MODELS_HINT, openBackendTab, PROGRESS_TEXT, test } from '../scripts/backend.ts';
import { MODEL_REPOS } from '../scripts/backend-remote.ts';
import { IpcSpy, OPEN_FAILED, openWorkspace } from '../scripts/settings.ts';

const OPEN_COMMAND = 'backend_models_open';

interface ModelRow {
  readonly id: BackendModelId;
  readonly name: string;
  readonly note: string;
  readonly tags: readonly string[];
}

const MODELS: readonly ModelRow[] = [
  {
    id: 'vieneu-turbo',
    name: 'VieNeu-TTS v3 Turbo',
    note: 'Fast Vietnamese speech with voice cloning.',
    tags: ['vi', 'en', 'Voice cloning', '2.1 GB'],
  },
  {
    id: 'vieneu-nano',
    name: 'VieNeu-TTS v3 Nano',
    note: 'The smallest VieNeu model.',
    tags: ['vi', 'en', 'Voice cloning', '400.5 MB'],
  },
  {
    id: 'omnivoice',
    name: 'OmniVoice',
    note: 'Multilingual speech with voice cloning and voice design.',
    tags: ['Multilingual', 'Voice cloning', 'GPU recommended', 'Non-commercial', '4.6 GB'],
  },
];

function resolvePath(id: BackendModelId): string {
  return `${MODEL_REPOS[id]}/resolve/main/model.safetensors`;
}

function treePath(id: BackendModelId): string {
  return `/api/models/${MODEL_REPOS[id]}/tree/`;
}

test.describe('CAP-12 Configuration', () => {
  test.describe('FEAT-47 Local TTS Models', () => {
    test.describe('with an installed model', () => {
      test.use({ backendOptions: { models: ['vieneu-nano'] } });

      test('US-0125 lists the open-weight TTS models with their details and status', async ({
        ui,
        picker,
        sandbox,
      }) => {
        await openWorkspace(ui, picker, sandbox);
        const backend = ui.main.settings.backend;
        await openBackendTab(ui, 'models');

        await test.step('shows the name, source, description, languages, size, cloning and GPU tags and status of every model', async () => {
          await expect(backend.modelCards).toHaveCount(MODELS.length);
          for (const row of MODELS) {
            const card = backend.model(row.id);
            await expect(card.name).toHaveText(row.name);
            await expect(card.source).toHaveText(MODEL_REPOS[row.id]);
            await expect(card.note).toContainText(row.note);
            await expect(card.tags).toHaveText(row.tags);
            await expect(card.badge).toBeVisible();
            await expect(card.status).toBeVisible();
          }
        });

        await test.step('shows a model that is not downloaded as not installed with a download button', async () => {
          const card = backend.model('vieneu-turbo');
          await expect(card.badge).toHaveText(MODEL_NONE);
          await expect(card.status).toHaveText(MODEL_MSG_NONE);
          await expect(card.download).toBeEnabled();
        });

        await test.step('shows an installed model as ready to use', async () => {
          const card = backend.model('vieneu-nano');
          await expect(card.badge).toHaveText(MODEL_INSTALLED);
          await expect(card.status).toHaveText(MODEL_MSG_READY);
          await expect(card.remove).toBeVisible();
          await expect(card.download).toBeHidden();
        });
      });
    });

    test('US-0126 downloads and removes TTS models and shows where they are stored', async ({
      ui,
      app,
      picker,
      sandbox,
      backend,
    }) => {
      await openWorkspace(ui, picker, sandbox);
      const settings = ui.main.settings.backend;
      await openBackendTab(ui, 'models');
      const turbo = settings.model('vieneu-turbo');
      const nano = settings.model('vieneu-nano');
      const omni = settings.model('omnivoice');

      await test.step('downloads a model with a progress bar, the downloaded size, the percentage and Cancel until it is installed', async () => {
        backend.remote.hold(resolvePath('vieneu-turbo'));
        await turbo.download.click();
        await expect(turbo.badge).toHaveText(MODEL_DOWNLOADING);
        await expect.poll(() => backend.remote.heldCount(resolvePath('vieneu-turbo'))).toBe(1);
        await expect(turbo.progressBar).toBeVisible();
        await expect(turbo.progressText).toHaveText(PROGRESS_TEXT);
        await expect(turbo.progressBar).not.toHaveAttribute('aria-valuenow', '0');
        const percent = Number(await turbo.progressBar.getAttribute('aria-valuenow'));
        expect(percent).toBeLessThan(100);
        await expect(turbo.progressText).toContainText(`· ${percent}%`);
        await expect(turbo.cancel).toBeVisible();
        backend.remote.release(resolvePath('vieneu-turbo'));
        await expect(turbo.badge).toHaveText(MODEL_INSTALLED);
        await expect(turbo.status).toHaveText(MODEL_MSG_READY);
        await expect(turbo.progress).toBeHidden();
      });

      await test.step('stops a download on Cancel and returns the model to not installed', async () => {
        backend.remote.hold(resolvePath('vieneu-nano'));
        await nano.download.click();
        await expect.poll(() => backend.remote.heldCount(resolvePath('vieneu-nano'))).toBe(1);
        await expect(nano.cancel).toBeVisible();
        await nano.cancel.click();
        await expect(nano.badge).toHaveText(MODEL_NONE);
        await expect(nano.download).toBeVisible();
        backend.remote.release(resolvePath('vieneu-nano'));
        await expect.poll(() => backend.hasModel('vieneu-nano')).toBe(false);
        await expect(nano.badge).toHaveText(MODEL_NONE);
      });

      await test.step('reports a failed download with the reason and offers Retry', async () => {
        backend.remote.fail(treePath('omnivoice'));
        await omni.download.click();
        await expect(omni.badge).toHaveText(MODEL_ERROR);
        await expect(omni.status).toHaveText(MODEL_MSG_FAILED);
        await expect(omni.error).toContainText('403');
        await expect(omni.retry).toBeVisible();
        backend.remote.recover(treePath('omnivoice'));
        await omni.retry.click();
        await expect(omni.badge).toHaveText(MODEL_INSTALLED);
      });

      await test.step('removes an installed model and returns it to not installed', async () => {
        await turbo.remove.click();
        await expect(turbo.badge).toHaveText(MODEL_NONE);
        await expect(turbo.download).toBeVisible();
        expect(backend.hasModel('vieneu-turbo')).toBe(false);
      });

      await test.step('shows the read-only models folder and says models are stored on this machine only', async () => {
        await expect(settings.folderPath).toHaveText(join(sandbox.dataDir, 'models'));
        await expect(settings.folder.locator('input, textarea')).toHaveCount(0);
        await expect(settings.folderHint).toHaveText(MODELS_HINT);
      });

      await test.step('opens the models folder and reports when it cannot be opened', async () => {
        const spy = new IpcSpy(() => app.page);
        await spy.install();
        await spy.mode(OPEN_COMMAND, 'ok');
        await settings.folderOpen.click();
        await expect.poll(async () => (await spy.calls(OPEN_COMMAND)).length).toBe(1);
        await spy.mode(OPEN_COMMAND, 'fail');
        await settings.folderOpen.click();
        await expect(ui.main.toast(OPEN_FAILED)).toBeVisible();
      });
    });
  });
});
