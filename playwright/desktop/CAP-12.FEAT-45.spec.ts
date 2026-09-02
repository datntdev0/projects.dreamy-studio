// prettier-ignore
import { ERROR_EXITED, ERROR_UNRESPONSIVE, expect, FACT_LABELS, GPU_NONE, GPU_NOT_FOUND, MISSING, MSG_HEALTH_OK, MSG_SERVER_FAILED, MSG_SERVER_STARTING, MSG_SERVER_STOPPED, NOTE_CPU, NOTE_RESTART, openBackendTab, selectBackendTab, serverPort, STATUS_ERROR, STATUS_RUNNING, STATUS_STARTING, STATUS_STOPPED, test, waitForRunning } from '../scripts/backend.ts';
import { openFromSplash } from '../scripts/flows.ts';
import { IpcSpy, OPEN_FAILED, openWorkspace } from '../scripts/settings.ts';

const LOGS_COMMAND = 'backend_logs_open';
const STATUS_COMMAND = 'backend_status';
const MODELS_COMMAND = 'backend_model_list';

test.describe('CAP-12 Configuration', () => {
  test.describe('FEAT-45 Local Backend', () => {
    test('US-0120 shows the backend status and logs and explains why it stopped', async ({
      ui,
      app,
      picker,
      sandbox,
      backend,
    }) => {
      const folder = await openWorkspace(ui, picker, sandbox);
      const spy = new IpcSpy(() => app.page);
      await spy.install();
      await openBackendTab(ui, 'general');
      let card = ui.main.settings.backend;

      await test.step('shows the status, address, version, Python version and uptime, with a dash for what is not known yet', async () => {
        await expect(card.serverBadge).toHaveText(STATUS_RUNNING);
        await expect(card.facts).toHaveText(FACT_LABELS);
        await expect(card.address).toHaveText(/^http:\/\/127\.0\.0\.1:\d+$/);
        await expect(card.version).toHaveText(/^\s*\d+\.\d+\.\d+\s*$/);
        await expect(card.python).toHaveText(/^\s*3\.\d+\.\d+\s*$/);
        await expect(card.uptime).toHaveText(/^\s*\d+m\s*$/);
        await backend.holdStart();
        await card.restart.click();
        await expect(card.serverBadge).toHaveText(STATUS_STARTING);
        for (const fact of [card.address, card.version, card.python, card.uptime]) {
          await expect(fact).toHaveText(MISSING);
        }
        await backend.releaseStart();
        await waitForRunning(ui);
      });

      await test.step('reports a successful health check with the response time and the time of the check', async () => {
        await card.check.click();
        await expect(card.status).toHaveText(MSG_HEALTH_OK);
      });

      await test.step('reports that the backend stopped with an error and shows the error', async () => {
        await backend.kill(await serverPort(ui));
        await card.check.click();
        await expect(card.serverBadge).toHaveText(STATUS_ERROR);
        await expect(card.status).toHaveText(MSG_SERVER_FAILED);
        await expect(card.serverError).toContainText(ERROR_UNRESPONSIVE);
      });

      await test.step('shows the backend as stopped without GPU, CUDA or models when its status cannot be read', async () => {
        await app.stop();
        await app.start();
        await expect(ui.splash.root).toBeVisible();
        await spy.install();
        await spy.mode(STATUS_COMMAND, 'fail');
        await spy.mode(MODELS_COMMAND, 'fail');
        await openFromSplash(ui, picker, folder);
        card = ui.main.settings.backend;
        await expect.poll(async () => (await spy.calls(STATUS_COMMAND)).length).toBeGreaterThan(0);
        await openBackendTab(ui, 'general');
        await expect(card.serverBadge).toHaveText(STATUS_STOPPED);
        await expect(card.status).toHaveText(MSG_SERVER_STOPPED);
        await expect(card.gpuBadge).toHaveText(GPU_NOT_FOUND);
        await expect(card.gpuHint).toHaveText(GPU_NONE);
        await expect(card.cudaRow).toHaveAttribute('aria-disabled', 'true');
        await expect(card.cudaDownload).toBeDisabled();
        await selectBackendTab(ui, 'models');
        await expect(card.modelCards).toHaveCount(0);
        await expect(card.modelsEmpty).toBeVisible();
      });

      await test.step('opens the backend log folder and reports when it cannot be opened', async () => {
        await selectBackendTab(ui, 'general');
        await spy.mode(LOGS_COMMAND, 'ok');
        await card.logs.click();
        await expect.poll(async () => (await spy.calls(LOGS_COMMAND)).length).toBe(1);
        await spy.mode(LOGS_COMMAND, 'fail');
        await card.logs.click();
        await expect(ui.main.toast(OPEN_FAILED)).toBeVisible();
      });
    });

    test('US-0121 checks and restarts the backend to recover from a failure', async ({
      ui,
      app,
      picker,
      sandbox,
      backend,
    }) => {
      await openWorkspace(ui, picker, sandbox);
      const spy = new IpcSpy(() => app.page);
      await spy.install();
      await openBackendTab(ui, 'general');
      const card = ui.main.settings.backend;
      await waitForRunning(ui);

      await test.step('refreshes the status on Check and locks the button while checking', async () => {
        await spy.mode(STATUS_COMMAND, 'hold');
        await card.check.click();
        await expect(card.check).toBeDisabled();
        await expect.poll(async () => (await spy.calls(STATUS_COMMAND)).length).toBe(1);
        await spy.release(STATUS_COMMAND);
        await expect(card.check).toBeEnabled();
        await expect(card.status).toHaveText(MSG_HEALTH_OK);
        await spy.mode(STATUS_COMMAND, 'pass');
      });

      await test.step('restarts a failed backend, clears the old error and follows the status until it runs', async () => {
        await backend.kill(await serverPort(ui));
        await card.check.click();
        await expect(card.serverBadge).toHaveText(STATUS_ERROR);
        await expect(card.serverError).toBeVisible();
        await backend.holdStart();
        await card.restart.click();
        await expect(card.serverBadge).toHaveText(STATUS_STARTING);
        await expect(card.status).toHaveText(MSG_SERVER_STARTING);
        await expect(card.serverError).toBeHidden();
      });

      await test.step('locks Check and Restart while the backend is starting', async () => {
        await expect(card.check).toBeDisabled();
        await expect(card.restart).toBeDisabled();
        await backend.releaseStart();
        await waitForRunning(ui);
        await expect(card.check).toBeEnabled();
        await expect(card.restart).toBeEnabled();
        await expect(card.serverError).toBeHidden();
      });

      await test.step('reports the reason when the restart fails and shows the latest backend status', async () => {
        await backend.failStart();
        await card.restart.click();
        await expect(card.serverBadge).toHaveText(STATUS_ERROR, { timeout: 45_000 });
        await expect(card.status).toHaveText(MSG_SERVER_FAILED);
        await expect(card.serverError).toContainText(ERROR_EXITED);
        await expect(card.address).toHaveText(MISSING);
        await backend.recoverStart();
      });

      await test.step('reminds that restarting interrupts speech tasks and that models run on the CPU without CUDA', async () => {
        await expect(card.note).toContainText(NOTE_RESTART);
        await expect(card.note).toContainText(NOTE_CPU);
      });
    });
  });
});
