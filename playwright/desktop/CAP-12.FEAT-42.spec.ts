import { join } from 'node:path';

import type { CloudId } from '../pages/settings.ts';
import { providerExecutable } from '../scripts/provider.ts';
// prettier-ignore
import { authLog, BADGE_CHECKING, BADGE_ERROR, BADGE_FOUND, BADGE_NOT_CHECKED, BADGE_NOT_FOUND, BADGE_NOT_INSTALLED, BADGE_NOT_SIGNED_IN, BADGE_READY, BADGE_SIGNED_IN, BADGE_SOON, BADGE_WAITING, checkDurationMs, CLOUD_INTRO, copyCliStub, expect, finishLogin, INSTALL_GUIDE, INSTALL_NOT_IN_PATH, installCli, IpcSpy, MSG_CHECKING, MSG_FAILED, MSG_NEED_SIGNIN, MSG_NOT_INSTALLED, MSG_OK, MSG_UNCHECKED, MSG_WAITING, openLlmTab, openWorkspace, readSettingsJson, selectLlmTab, setProbe, SIGNIN_APP_PROFILE, SIGNIN_GUIDE, SIGNIN_LOCKED, test, useCliPath } from '../scripts/settings.ts';

const CLOUD_IDS: readonly CloudId[] = ['anthropic', 'openai', 'google', 'openrouter', 'custom'];
const SLOW_PROBE_MS = 1500;
const BROKEN_REASON = 'stub provider is broken';

test.describe('CAP-12 Configuration', () => {
  test.describe('FEAT-42 LLM CLI Providers', () => {
    test('US-0114 detects installed CLIs, guides missing ones and accepts a manual path', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await installCli(sandbox, 'codex');
      const agyPath = await copyCliStub(sandbox, 'agy');
      await openWorkspace(ui, picker, sandbox);
      await openLlmTab(ui, 'cli');
      const llm = ui.main.settings.llm;

      await test.step('shows every installed CLI as found with its path and status', async () => {
        for (const id of ['claude', 'codex'] as const) {
          const card = llm.cli(id);
          await expect(card.install.getByText(BADGE_FOUND, { exact: true })).toBeVisible();
          await expect(card.path).toHaveValue(providerExecutable(sandbox, id));
          await expect(card.badge).toHaveText(BADGE_READY);
        }
      });

      await test.step('tells that a missing CLI is not installed, how to install it and lets the path be typed by hand', async () => {
        const card = llm.cli('antigravity');
        await expect(card.badge).toHaveText(BADGE_NOT_INSTALLED);
        await expect(card.install.getByText(BADGE_NOT_FOUND, { exact: true })).toBeVisible();
        await expect(card.install).toContainText(INSTALL_NOT_IN_PATH);
        await expect(card.install).toContainText(INSTALL_GUIDE);
        await expect(card.status).toContainText(MSG_NOT_INSTALLED);
        await expect(card.manual).toBeVisible();
        await expect(card.usePath).toBeVisible();
      });

      await test.step('uses the typed path and updates the status of the CLI', async () => {
        const card = llm.cli('antigravity');
        await useCliPath(ui, 'antigravity', agyPath);
        await expect(card.badge).toHaveText(BADGE_READY);
        await expect(card.install.getByText(BADGE_FOUND, { exact: true })).toBeVisible();
        await expect(card.path).toHaveValue(agyPath);
        await expect
          .poll(async () => (await readSettingsJson(sandbox)).llm?.providers?.['antigravity']?.path)
          .toBe(agyPath);
      });

      await test.step('lists the cloud services as coming soon and not usable', async () => {
        await selectLlmTab(ui, 'cloud');
        await expect(llm.cloudSoon).toHaveText(BADGE_SOON);
        await expect(llm.cloudIntro).toHaveText(CLOUD_INTRO);
        await expect(llm.cloudCards).toHaveCount(CLOUD_IDS.length);
        for (const id of CLOUD_IDS) {
          await expect(llm.cloud(id)).toHaveAttribute('aria-disabled', 'true');
          await expect(llm.cloudKey(id)).toBeDisabled();
        }
      });
    });

    test("US-0115 signs in to the app's own CLI profile and signs out again", async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      await setProbe(sandbox, { probe: 'signed-out' });
      await openWorkspace(ui, picker, sandbox);
      const spy = new IpcSpy(() => app.page);
      await spy.install();
      await spy.mode('llm_profile_open', 'ok');
      await openLlmTab(ui, 'cli');
      const llm = ui.main.settings.llm;
      const claude = llm.cli('claude');
      const profile = join(sandbox.dataDir, 'llm', 'claude');

      await test.step('tells that the app profile is not signed in, explains how to sign in and opens the profile folder', async () => {
        await expect(claude.badge).toHaveText(BADGE_NOT_SIGNED_IN);
        await expect(claude.signinStep).toContainText(SIGNIN_APP_PROFILE);
        await expect(claude.signinStep).toContainText(SIGNIN_GUIDE);
        await expect(claude.signinStep).toContainText('claude auth login');
        await expect(claude.profile).toHaveValue(profile);
        await claude.profileOpen.click();
        await expect.poll(() => spy.calls('llm_profile_open')).toEqual([{ id: 'claude' }]);
      });

      await test.step('locks the sign-in of a CLI that is not installed and asks to install it first', async () => {
        const codex = llm.cli('codex');
        await expect(codex.badge).toHaveText(BADGE_NOT_INSTALLED);
        await expect(codex.signinStep).toContainText(SIGNIN_LOCKED);
        await expect(codex.signinStep).toHaveClass(/is-locked/);
        await expect(codex.signin).toHaveCount(0);
      });

      await test.step('opens a terminal in the app profile, shows waiting and updates by itself when sign-in is done', async () => {
        await claude.signin.click();
        await expect
          .poll(() => authLog(sandbox))
          .toEqual([expect.objectContaining({ action: 'login', profile })]);
        await expect(claude.signinStep.getByText(BADGE_WAITING, { exact: true })).toBeVisible();
        await expect(claude.status).toContainText(MSG_WAITING);
        await expect(claude.signin).toBeDisabled();
        await finishLogin(sandbox);
        await expect(claude.signinStep.getByText(BADGE_SIGNED_IN, { exact: true })).toBeVisible();
        await expect(claude.account).toHaveText('stub@dreamy.test');
        await expect(claude.badge).toHaveText(BADGE_READY);
      });

      await test.step('signs the app profile out and returns the status to not signed in', async () => {
        await claude.signout.click();
        await expect
          .poll(async () => (await authLog(sandbox)).map((entry) => entry.action))
          .toEqual(['login', 'logout']);
        expect((await authLog(sandbox))[1]?.profile).toBe(profile);
        await expect(claude.badge).toHaveText(BADGE_NOT_SIGNED_IN);
        await expect(
          claude.signinStep.getByText(BADGE_NOT_SIGNED_IN, { exact: true }),
        ).toBeVisible();
        await expect(claude.status).toContainText(MSG_NEED_SIGNIN);
        await expect(claude.signout).toHaveCount(0);
      });
    });

    test('US-0116 checks that a CLI runs and reports the result', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      const alternative = await copyCliStub(sandbox, 'claude-alternative');
      await openWorkspace(ui, picker, sandbox);
      const spy = new IpcSpy(() => app.page);
      await spy.install();
      await openLlmTab(ui, 'cli');
      const claude = ui.main.settings.llm.cli('claude');
      await expect(claude.badge).toHaveText(BADGE_READY);

      await test.step('shows that the command is running, then the success with the response time and the check time', async () => {
        await setProbe(sandbox, { probeDelayMs: SLOW_PROBE_MS });
        await claude.check.click();
        await expect(claude.badge).toHaveText(BADGE_CHECKING);
        await expect(claude.status).toContainText(MSG_CHECKING);
        await expect(claude.status).toContainText(MSG_OK);
        expect(checkDurationMs(await claude.status.innerText())).toBeGreaterThanOrEqual(
          SLOW_PROBE_MS,
        );
      });

      await test.step('reports the failed check with its reason and an error status', async () => {
        await setProbe(sandbox, { probe: 'broken', probeDelayMs: 0 });
        await claude.check.click();
        await expect(claude.badge).toHaveText(BADGE_ERROR);
        await expect(claude.error).toContainText(BROKEN_REASON);
        await expect(claude.status).toContainText(MSG_FAILED);
      });

      await test.step('tells that a CLI has not been checked yet and to click Check', async () => {
        await setProbe(sandbox, { probe: 'ok' });
        await spy.mode('llm_provider_save', 'hold');
        await claude.path.fill(alternative);
        await claude.path.blur();
        await expect(claude.badge).toHaveText(BADGE_NOT_CHECKED);
        await expect(claude.status).toContainText(MSG_UNCHECKED);
        await spy.release('llm_provider_save');
        await expect(claude.badge).toHaveText(BADGE_READY);
        await expect(claude.path).toHaveValue(alternative);
      });
    });
  });
});
