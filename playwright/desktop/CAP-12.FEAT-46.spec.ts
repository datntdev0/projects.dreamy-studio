// prettier-ignore
import { chooseDevice, CPU_WARNING, CUDA_HINT, CUDA_INSTALLED, CUDA_NEED_GPU, DEVICE_CPU, DEVICE_GPU, DEVICE_NEED_CUDA, DEVICE_READY, expect, GPU_DETECTED, GPU_NONE, GPU_NOT_FOUND, openBackendTab, PROGRESS_TEXT, selectBackendTab, STUB_GPU, STUB_GPU_HINT, test, UPDATED_GPU, UPDATED_GPU_HINT, waitForRunning } from '../scripts/backend.ts';
import { wheelName } from '../scripts/backend-remote.ts';
import { IpcSpy, openWorkspace, relaunch } from '../scripts/settings.ts';

const SCAN_COMMAND = 'backend_gpu_scan';
const CUBLAS_WHEEL = wheelName('nvidia-cublas-cu12', '12.4.5.8');
const CUDNN_WHEEL = wheelName('nvidia-cudnn-cu12', '9.1.0.70');

test.describe('CAP-12 Configuration', () => {
  test.describe('FEAT-46 Hardware Acceleration', () => {
    test.describe('with an NVIDIA GPU', () => {
      test.use({ backendOptions: { gpu: STUB_GPU } });

      test('US-0122 detects the NVIDIA GPU and rescans it on demand', async ({
        ui,
        app,
        picker,
        sandbox,
        backend,
      }) => {
        const folder = await openWorkspace(ui, picker, sandbox);
        let card = ui.main.settings.backend;
        await openBackendTab(ui, 'general');

        await test.step('shows the detected GPU with its name, VRAM in GB and driver version', async () => {
          await expect(card.gpuBadge).toHaveText(GPU_DETECTED);
          await expect(card.gpuHint).toHaveText(STUB_GPU_HINT);
        });

        await test.step('reports that no NVIDIA GPU was found on this machine', async () => {
          await relaunch(ui, app, picker, folder, () => backend.setGpu(null));
          card = ui.main.settings.backend;
          await openBackendTab(ui, 'general');
          await expect(card.gpuBadge).toHaveText(GPU_NOT_FOUND);
          await expect(card.gpuHint).toHaveText(GPU_NONE);
        });

        await test.step('updates the GPU on Rescan and locks the button while scanning', async () => {
          await backend.setGpu(UPDATED_GPU);
          const spy = new IpcSpy(() => app.page);
          await spy.install();
          await spy.mode(SCAN_COMMAND, 'hold');
          await card.gpuRescan.click();
          await expect(card.gpuRescan).toBeDisabled();
          await expect.poll(async () => (await spy.calls(SCAN_COMMAND)).length).toBe(1);
          await spy.release(SCAN_COMMAND);
          await expect(card.gpuBadge).toHaveText(GPU_DETECTED);
          await expect(card.gpuHint).toHaveText(UPDATED_GPU_HINT);
          await expect(card.gpuRescan).toBeEnabled();
        });
      });

      test('US-0123 downloads, removes and retries the CUDA runtime in the app', async ({
        ui,
        app,
        picker,
        sandbox,
        backend,
      }) => {
        await openWorkspace(ui, picker, sandbox);
        const card = ui.main.settings.backend;
        await openBackendTab(ui, 'general');
        await expect(card.gpuBadge).toHaveText(GPU_DETECTED);

        await test.step('locks the download and says an NVIDIA GPU is needed when there is none', async () => {
          await backend.setGpu(null);
          await card.gpuRescan.click();
          await expect(card.gpuBadge).toHaveText(GPU_NOT_FOUND);
          await expect(card.cudaRow).toHaveAttribute('aria-disabled', 'true');
          await expect(card.cudaRow).toHaveClass(/is-disabled/);
          await expect(card.cudaNeedGpu).toHaveText(CUDA_NEED_GPU);
          await expect(card.cudaDownload).toBeDisabled();
        });

        await test.step('shows the CUDA version, its estimated size and the download button when a GPU is present', async () => {
          await backend.setGpu(STUB_GPU);
          await card.gpuRescan.click();
          await expect(card.gpuBadge).toHaveText(GPU_DETECTED);
          await expect(card.cudaRow).toHaveAttribute('aria-disabled', 'false');
          await expect(card.cudaHint).toHaveText(CUDA_HINT);
          await expect(card.cudaNeedGpu).toBeHidden();
          await expect(card.cudaDownload).toBeEnabled();
        });

        await test.step('shows a progress bar, the downloaded and total size, the percentage and Cancel while CUDA downloads', async () => {
          backend.remote.hold(CUBLAS_WHEEL);
          await card.cudaDownload.click();
          await expect.poll(() => backend.remote.heldCount(CUBLAS_WHEEL)).toBe(1);
          await expect(card.cudaProgressBar).toBeVisible();
          await expect(card.cudaProgressText).toHaveText(PROGRESS_TEXT);
          await expect(card.cudaProgressBar).not.toHaveAttribute('aria-valuenow', '0');
          const percent = Number(await card.cudaProgressBar.getAttribute('aria-valuenow'));
          expect(percent).toBeLessThan(100);
          await expect(card.cudaProgressText).toContainText(`· ${percent}%`);
          await expect(card.cudaCancel).toBeVisible();
          backend.remote.release(CUBLAS_WHEEL);
          await expect(card.cudaBadge).toHaveText(CUDA_INSTALLED);
          expect(backend.hasCudaManifest()).toBe(true);
        });

        await test.step('removes the installed CUDA runtime and switches the compute device back to CPU', async () => {
          await chooseDevice(ui, new IpcSpy(() => app.page), DEVICE_GPU);
          await expect(card.device(DEVICE_GPU)).toHaveAttribute('aria-pressed', 'true');
          expect(await backend.savedDevice()).toBe('cuda');
          await waitForRunning(ui);
          await card.cudaRemove.click();
          await expect(card.cudaDownload).toBeEnabled();
          await expect(card.cudaBadge).toBeHidden();
          await expect(card.device(DEVICE_CPU)).toHaveAttribute('aria-pressed', 'true');
          await expect(card.device(DEVICE_GPU)).toBeDisabled();
          await expect.poll(() => backend.savedDevice()).toBe('cpu');
          await expect.poll(() => backend.hasCudaManifest()).toBe(false);
        });

        await test.step('reports a failed CUDA download with the reason and offers Retry', async () => {
          await waitForRunning(ui);
          backend.remote.fail(CUDNN_WHEEL);
          await card.cudaDownload.click();
          await expect(card.cudaError).toContainText('403');
          await expect(card.cudaRetry).toBeVisible();
          backend.remote.recover(CUDNN_WHEEL);
          await card.cudaRetry.click();
          await expect(card.cudaBadge).toHaveText(CUDA_INSTALLED);
        });
      });

      test('US-0124 chooses between the CPU and the GPU to run the models', async ({
        ui,
        app,
        picker,
        sandbox,
        backend,
      }) => {
        const folder = await openWorkspace(ui, picker, sandbox);
        let card = ui.main.settings.backend;
        await openBackendTab(ui, 'general');
        await expect(card.gpuBadge).toHaveText(GPU_DETECTED);

        await test.step('saves the GPU as the compute device when a GPU and CUDA are installed', async () => {
          await relaunch(ui, app, picker, folder, () => backend.seedCuda());
          card = ui.main.settings.backend;
          await openBackendTab(ui, 'general');
          await expect(card.cudaBadge).toHaveText(CUDA_INSTALLED);
          await expect(card.deviceHint).toHaveText(DEVICE_READY);
          await expect(card.device(DEVICE_CPU)).toHaveAttribute('aria-pressed', 'true');
          await chooseDevice(ui, new IpcSpy(() => app.page), DEVICE_GPU);
          await expect(card.device(DEVICE_GPU)).toHaveAttribute('aria-pressed', 'true');
          expect(await backend.savedDevice()).toBe('cuda');
          await relaunch(ui, app, picker, folder);
          card = ui.main.settings.backend;
          await openBackendTab(ui, 'general');
          await expect(card.device(DEVICE_GPU)).toHaveAttribute('aria-pressed', 'true');
          await selectBackendTab(ui, 'models');
          await expect(card.model('omnivoice').root).toBeVisible();
          await expect(card.model('omnivoice').cpuWarning).toBeHidden();
          await selectBackendTab(ui, 'general');
        });

        await test.step('locks the GPU choice with a hint when CUDA is missing or there is no GPU', async () => {
          await card.cudaRemove.click();
          await expect(card.cudaDownload).toBeEnabled();
          await expect(card.device(DEVICE_GPU)).toBeDisabled();
          await expect(card.deviceHint).toHaveText(DEVICE_NEED_CUDA);
          await waitForRunning(ui);
          await backend.setGpu(null);
          await card.gpuRescan.click();
          await expect(card.gpuBadge).toHaveText(GPU_NOT_FOUND);
          await expect(card.device(DEVICE_GPU)).toBeDisabled();
          await expect(card.deviceHint).toHaveText(GPU_NONE);
        });

        await test.step('warns that a GPU-recommended model will run slowly on the CPU', async () => {
          await expect(card.device(DEVICE_CPU)).toHaveAttribute('aria-pressed', 'true');
          await selectBackendTab(ui, 'models');
          await expect(card.model('omnivoice').cpuWarning).toHaveText(CPU_WARNING);
          await expect(card.model('vieneu-turbo').cpuWarning).toBeHidden();
          await expect(card.model('vieneu-nano').cpuWarning).toBeHidden();
        });
      });
    });
  });
});
