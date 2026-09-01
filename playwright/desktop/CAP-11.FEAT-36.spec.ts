// prettier-ignore
import { ASSISTANT_PROVIDER, AZURE, behaviorOf, chaptersShort, DELETE_TOAST, DELETE_WARNING, deleteMeta, EMBER, HARBOR, HISTORY_EMPTY_DESCRIPTION, HISTORY_EMPTY_TITLE, HISTORY_NO_MATCH, HISTORY_TITLE_OLDER, HISTORY_TITLE_TODAY, HISTORY_TITLE_WEEK, HISTORY_TITLE_YESTERDAY, messageCount, openAssistant, SCOPE_CHAPTERS_OF, SCOPE_META, SCOPE_NO_MATCH, SCOPE_WORKSPACE, SCOPE_WORKSPACE_COUNT, scopeSeed, sendMessage, sessionsSeed, showAssistant } from '../scripts/assistant.ts';
import { openFromSplash } from '../scripts/flows.ts';
import { expect, test } from '../scripts/provider.ts';
import { seedWorkspace } from '../scripts/workspaces.ts';

test.describe('CAP-11 Assistant', () => {
  test.describe('FEAT-36 Assistant Sessions', () => {
    test.use({ providerOptions: ASSISTANT_PROVIDER });

    test('US-0101 opens a new chat and picks the scope the assistant works on', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openAssistant(ui, picker, sandbox, scopeSeed());
      await showAssistant(ui);
      const { start, chat } = ui.main.assistant;
      await expect(start.root).toBeVisible();

      await test.step('lists the whole workspace with its novel count and every novel with its chapter, translated and analyzed counts', async () => {
        await start.scopeToggle.click();
        await expect(start.scopePanel).toBeVisible();
        await expect(start.workspaceOption).toBeVisible();
        await expect(start.optionMeta(start.workspaceOption)).toHaveText(SCOPE_WORKSPACE_COUNT);
        await expect(start.novelOptions).toHaveCount(3);
        for (const novel of [AZURE, HARBOR, EMBER]) {
          await expect(start.optionMeta(start.novelOption(novel))).toHaveText(
            chaptersShort(SCOPE_CHAPTERS_OF[novel] ?? 0),
          );
          await start.novelOption(novel).click();
          await expect(start.scopeCurrent).toHaveText(novel);
          await expect(start.scopeMeta).toHaveText(SCOPE_META[novel] ?? '');
          await start.scopeToggle.click();
        }
      });

      await test.step('shows only the novels that match the searched name and says no novel matches otherwise', async () => {
        await start.scopeSearch.fill('ember');
        await expect(start.novelOptions).toHaveCount(1);
        await expect(start.novelOption(EMBER)).toBeVisible();
        await start.scopeSearch.fill('zzz');
        await expect(start.novelOptions).toHaveCount(0);
        await expect(start.scopeEmpty).toHaveText(SCOPE_NO_MATCH);
        await start.scopeSearch.fill('');
        await expect(start.novelOptions).toHaveCount(3);
      });

      await test.step('creates the chat on the first message, shows its scope and lets the scope be changed with the change button first', async () => {
        await expect(start.scopeToggle).toContainText('Change scope');
        await start.novelOption(HARBOR).click();
        await expect(start.scopeCurrent).toHaveText(HARBOR);
        await start.scopeToggle.click();
        await start.novelOption(EMBER).click();
        await expect(start.scopeCurrent).toHaveText(EMBER);
        await expect(start.scopeNow).toContainText(EMBER);
        await sendMessage(ui, 'Xin chào');
        await expect(chat.root).toBeVisible();
        await expect(chat.scopeChip).toHaveText(EMBER);
        await expect(chat.count).toHaveText(messageCount(2));
        await expect(chat.scopeChip).not.toHaveText(SCOPE_WORKSPACE);
      });
    });

    test('US-0102 reviews and continues the old chats', async ({
      ui,
      app,
      picker,
      sandbox,
      provider,
    }) => {
      await openAssistant(ui, picker, sandbox, scopeSeed(), { sessions: sessionsSeed() });
      await provider.setBehavior(
        behaviorOf({ ask: 'tiếp tục', text: 'Tiếp tục: Master Chen vẫn là thủ lĩnh.' }),
      );
      await showAssistant(ui);
      const { start, history, chat } = ui.main.assistant;
      await start.history.click();
      await expect(history.root).toBeVisible();

      await test.step('groups the chats by today, yesterday, previous 7 days and older with their scope and message count', async () => {
        await expect(history.groups).toHaveCount(4);
        await expect(history.groupLabel('today')).toHaveText(HISTORY_TITLE_TODAY);
        await expect(history.groupLabel('yesterday')).toHaveText(HISTORY_TITLE_YESTERDAY);
        await expect(history.groupLabel('week')).toHaveText(HISTORY_TITLE_WEEK);
        await expect(history.groupLabel('older')).toHaveText(HISTORY_TITLE_OLDER);
        const expected = [
          ['today', 'Today workspace chat', SCOPE_WORKSPACE, '2'],
          ['yesterday', 'Yesterday azure chat', AZURE, '4'],
          ['week', 'Week harbor notes', HARBOR, '2'],
          ['older', 'Older ember plan', EMBER, '6'],
        ] as const;
        for (const [key, title, scope, count] of expected) {
          const session = history.group(key).locator(history.session(title));
          await expect(session).toHaveCount(1);
          await expect(history.scope(session)).toHaveText(scope);
          await expect(history.messages(session)).toHaveText(count);
        }
      });

      await test.step('shows only the chats that match the searched content or the chosen scope and offers to clear the filters', async () => {
        await history.search.fill('leads the sky sword sect');
        await expect(history.sessions).toHaveCount(1);
        await expect(history.session('Yesterday azure chat')).toBeVisible();
        await history.search.fill('');
        await history.filter.selectOption({ label: HARBOR });
        await expect(history.sessions).toHaveCount(1);
        await expect(history.session('Week harbor notes')).toBeVisible();
        await history.search.fill('zzzz');
        await expect(history.sessions).toHaveCount(0);
        await expect(history.noMatch).toContainText(HISTORY_NO_MATCH);
        await history.clear.click();
        await expect(history.sessions).toHaveCount(4);
        await expect(history.search).toHaveValue('');
        await expect(history.filter).toHaveValue('all');
      });

      await test.step('opens a chat with all its earlier messages and keeps the conversation going', async () => {
        await history.open(history.session('Yesterday azure chat')).click();
        await expect(chat.root).toBeVisible();
        await expect(chat.userTexts).toHaveText(['Yesterday azure chat', 'Who leads the sect?']);
        await expect(chat.replyTexts).toHaveText([
          'Azure Chronicle has three chapters.',
          'Master Chen leads the Sky Sword Sect.',
        ]);
        await expect(chat.scopeChip).toHaveText(AZURE);
        await sendMessage(ui, 'Tiếp tục nào');
        await expect(chat.replies).toHaveCount(3);
        await expect(chat.replyTexts.last()).toHaveText('Tiếp tục: Master Chen vẫn là thủ lĩnh.');
        await expect(chat.count).toHaveText(messageCount(6));
        const [run] = await provider.waitForRuns(1, 'assistant');
        expect(run?.prompt).toContain('Master Chen leads the Sky Sword Sect.');
      });

      await test.step('explains that chats will be saved there when no chat exists yet', async () => {
        const folder = sandbox.workspace('fresh');
        await seedWorkspace(folder, { novels: [] });
        await app.restart();
        await expect(ui.splash.root).toBeVisible();
        await openFromSplash(ui, picker, folder);
        await showAssistant(ui);
        const fresh = ui.main.assistant;
        await fresh.start.history.click();
        await expect(fresh.history.empty).toBeVisible();
        await expect(fresh.history.emptyTitle).toHaveText(HISTORY_EMPTY_TITLE);
        await expect(fresh.history.emptyDescription).toHaveText(HISTORY_EMPTY_DESCRIPTION);
      });
    });

    test('US-0103 deletes a chat that is no longer needed after confirming', async ({
      ui,
      picker,
      sandbox,
    }) => {
      await openAssistant(ui, picker, sandbox, scopeSeed(), {
        sessions: sessionsSeed().slice(0, 2),
      });
      await showAssistant(ui);
      const { start, history } = ui.main.assistant;
      const { confirm } = ui.main;
      await start.history.click();
      await expect(history.sessions).toHaveCount(2);
      const target = history.session('Yesterday azure chat');

      await test.step('names the scope and message count in the confirm dialog and warns the messages are deleted permanently while applied edits stay', async () => {
        await history.remove(target).click();
        await expect(confirm.panel).toBeVisible();
        await expect(confirm.names).toHaveText('Yesterday azure chat');
        await expect(confirm.metas).toHaveText(deleteMeta(AZURE, 4));
        await expect(confirm.warning).toHaveText(DELETE_WARNING);
      });

      await test.step('keeps the chat when the dialog is cancelled', async () => {
        await confirm.cancel.click();
        await expect(confirm.panel).toBeHidden();
        await expect(history.sessions).toHaveCount(2);
        await expect(target).toBeVisible();
      });

      await test.step('removes the chat from the history and announces it is deleted when confirmed', async () => {
        await history.remove(target).click();
        await expect(confirm.panel).toBeVisible();
        await confirm.accept.click();
        await expect(confirm.panel).toBeHidden();
        await expect(ui.main.toast(DELETE_TOAST)).toBeVisible();
        await expect(history.sessions).toHaveCount(1);
        await expect(target).toHaveCount(0);
      });
    });
  });
});
