// prettier-ignore
import { closeSettings, expect, IpcSpy, NAV_LABELS, OPEN_FAILED, openGeneralTab, openSettings, openWorkspace, patchGeneral, readSettingsJson, relaunch, SWITCH_THEME_EN, test,TITLE_EN, TITLE_VI } from '../scripts/settings.ts';

const OPEN_COMMAND = 'settings_folder_open';

test.describe('CAP-12 Configuration', () => {
  test.describe('FEAT-41 General Settings', () => {
    test('US-0112 changes the language and theme and lists the settings sections', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      await patchGeneral(sandbox, { language: 'vi', theme: 'dark' });
      const folder = await openWorkspace(ui, picker, sandbox);
      await expect(ui.main.settings.html).toHaveAttribute('lang', 'vi');

      await test.step('lists the General, LLM providers, Local backend and Cloud providers sections', async () => {
        await openSettings(ui);
        await expect(ui.main.settings.dialog.title).toHaveText(TITLE_VI);
        await expect(ui.main.settings.dialog.navItems).toHaveText(NAV_LABELS);
      });

      await test.step('switches the whole app to the chosen language at once and keeps it after reopening the app', async () => {
        await ui.main.settings.general.languageOptions.nth(1).click();
        await expect(ui.main.settings.general.languageOptions.nth(1)).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(ui.main.settings.dialog.title).toHaveText(TITLE_EN);
        await expect(ui.main.settings.html).toHaveAttribute('lang', 'en');
        await closeSettings(ui);
        await ui.main.settings.titlebar.viewButton.click();
        await expect(ui.main.settings.titlebar.languageName).toHaveText('English');
        await expect(ui.main.settings.titlebar.switchTheme).toContainText(SWITCH_THEME_EN);
        await app.page.keyboard.press('Escape');
        await expect
          .poll(async () => (await readSettingsJson(sandbox)).general?.language)
          .toBe('en');
        await relaunch(ui, app, picker, folder);
        await expect(ui.main.settings.html).toHaveAttribute('lang', 'en');
        await openSettings(ui);
        await expect(ui.main.settings.dialog.title).toHaveText(TITLE_EN);
        await closeSettings(ui);
      });

      await test.step('switches the theme at once, matches the title bar theme button and keeps it after reopening the app', async () => {
        await openGeneralTab(ui, 'interface');
        await expect(ui.main.settings.html).toHaveAttribute('data-theme', 'dark');
        await ui.main.settings.general.themeOptions.nth(1).click();
        await expect(ui.main.settings.general.themeOptions.nth(1)).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(ui.main.settings.html).toHaveAttribute('data-theme', 'light');
        await closeSettings(ui);
        await ui.main.settings.titlebar.viewButton.click();
        await expect(ui.main.settings.titlebar.themeIcon).toHaveAttribute('href', /#i-moon$/);
        await app.page.keyboard.press('Escape');
        await expect
          .poll(async () => (await readSettingsJson(sandbox)).general?.theme)
          .toBe('light');
        await relaunch(ui, app, picker, folder);
        await expect(ui.main.settings.html).toHaveAttribute('data-theme', 'light');
        await ui.main.settings.titlebar.viewButton.click();
        await expect(ui.main.settings.titlebar.themeIcon).toHaveAttribute('href', /#i-moon$/);
        await app.page.keyboard.press('Escape');
      });

      await test.step('shows the Local backend and Cloud providers panes', async () => {
        await openSettings(ui, 'backend');
        await expect(ui.main.settings.dialog.pane('backend')).toBeVisible();
        await ui.main.settings.dialog.nav('cloud').click();
        await expect(ui.main.settings.dialog.pane('cloud')).toBeVisible();
      });
    });

    test('US-0113 opens the workspace and application data folders and reports when it cannot', async ({
      ui,
      app,
      picker,
      sandbox,
    }) => {
      const folder = await openWorkspace(ui, picker, sandbox);
      const settings = ui.main.settings;
      const spy = new IpcSpy(() => app.page);
      await spy.install();
      await spy.mode(OPEN_COMMAND, 'ok');
      await openGeneralTab(ui, 'storage');

      await test.step('opens the workspace folder that is shown on the Storage tab', async () => {
        await expect(settings.general.workspacePath).toHaveText(folder);
        await settings.general.workspaceOpen.click();
        await expect.poll(() => spy.calls(OPEN_COMMAND)).toEqual([{ target: 'workspace' }]);
      });

      await test.step('opens the application data folder that is shown on the Storage tab', async () => {
        await expect(settings.general.dataPath).toHaveText(sandbox.dataDir);
        await settings.general.dataOpen.click();
        await expect
          .poll(() => spy.calls(OPEN_COMMAND))
          .toEqual([{ target: 'workspace' }, { target: 'appData' }]);
      });

      await test.step('reports that the folder cannot be opened when the system refuses to open it', async () => {
        await spy.mode(OPEN_COMMAND, 'fail');
        await settings.general.workspaceOpen.click();
        await expect(ui.main.toast(OPEN_FAILED)).toBeVisible();
      });
    });
  });
});
