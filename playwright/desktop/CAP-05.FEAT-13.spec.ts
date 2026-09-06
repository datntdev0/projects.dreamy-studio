import { expect, test } from '../scripts/fixtures.ts';
// prettier-ignore
import { fillPromptForm, openLibraryView, openWriteDialog, PROMPT_BYTES_LIMIT, PROMPT_NAME_REQUIRED, PROMPT_NAME_TOO_LONG, PROMPT_SAVED, PROMPT_TEXT_REQUIRED, PROMPT_TEXT_TOO_LARGE, readPrompt, snapshotPrompts } from '../scripts/library.ts';

const NAME_LIMIT = 120;
const SEED = {
  collections: [{ name: 'Scripts' }],
  prompts: [{ name: 'Existing prompt', text: 'Already stored' }],
};

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-13 Prompt Authoring', () => {
    test('US-0032 writes a prompt with name, kind, content, rights, tags and collection and lists its variables once each', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder, ids } = await openLibraryView(ui, picker, sandbox, SEED, 'prompts');
      const section = ui.main.library.prompts;
      const prompts = await openWriteDialog(ui);
      const content =
        'Wide shot of {{hero}} walking through {{city}} at night.\nKeep {{hero}} in focus.';

      await test.step('saves the prompt and shows it in the library with the chosen name, kind, content, tags, collection and rights', async () => {
        await fillPromptForm(prompts, {
          name: 'Noir opener',
          kind: 'video',
          text: content,
          collection: ids.collections['Scripts'],
          tags: 'Cinematic, Night Scene',
          rights: 'licensed',
        });
        await prompts.dialog.submit.click();

        await expect(ui.main.toast(PROMPT_SAVED)).toContainText('Noir opener');
        await expect(prompts.dialog.panel).toBeHidden();
        await expect(section.rows).toHaveCount(2);
        await expect(section.row('Noir opener')).toBeVisible();
        const stored = await readPrompt(folder, 'Noir opener');
        expect(stored.text).toBe(content);
        expect(stored.row).toMatchObject({
          kind: 'video',
          rights: 'licensed',
          collectionId: ids.collections['Scripts'],
          origin: 'app',
          tags: ['cinematic', 'night-scene'],
        });
        await section.row('Noir opener').click();
        await expect(prompts.inspector.name).toHaveValue('Noir opener');
        await expect(prompts.inspector.kind).toHaveValue('video');
        await expect(prompts.inspector.text).toHaveValue(content);
        await expect(prompts.inspector.collection).toHaveValue(String(ids.collections['Scripts']));
        await expect(prompts.inspector.rights).toHaveValue('licensed');
        await expect(prompts.inspector.tags).toHaveText(['cinematic', 'night-scene']);
      });

      await test.step('lists each recognised variable once while the content is typed', async () => {
        await prompts.write.click();
        await expect(prompts.dialog.panel).toBeVisible();
        await prompts.dialog.text.fill('Hello {{name}}, welcome to {{place}}. Bye {{name}}.');

        await expect(prompts.dialog.variables).toContainText('name, place');
        await expect(prompts.dialog.variables).not.toContainText('name, place, name');

        await prompts.dialog.text.fill(
          'Hello {{name}}, welcome to {{place}}. Bye {{name}}. Mood: {{mood}}.',
        );

        await expect(prompts.dialog.variables).toContainText('name, place, mood');
      });
    });

    test('US-0033 rejects an invalid name or content with an error at the field and creates no prompt', async ({
      ui,
      picker,
      sandbox,
    }) => {
      const { folder } = await openLibraryView(ui, picker, sandbox, SEED, 'prompts');
      const prompts = await openWriteDialog(ui);
      const before = await snapshotPrompts(folder);

      await test.step('refuses an empty name and a name longer than 120 characters with an error at the name field', async () => {
        await fillPromptForm(prompts, { text: 'Valid content', rights: 'own' });
        await prompts.dialog.submit.click();

        await expect(prompts.dialog.nameError).toBeVisible();
        await expect(prompts.dialog.nameError).toHaveText(PROMPT_NAME_REQUIRED);
        await expect(prompts.dialog.textError).toBeHidden();
        expect(await snapshotPrompts(folder)).toEqual(before);

        await prompts.setValue(prompts.dialog.name, 'N'.repeat(NAME_LIMIT + 1));
        await prompts.dialog.submit.click();

        await expect(prompts.dialog.nameError).toBeVisible();
        await expect(prompts.dialog.nameError).toHaveText(PROMPT_NAME_TOO_LONG);
        await expect(ui.main.toasts).toHaveCount(0);
        await expect(prompts.dialog.panel).toBeVisible();
        expect(await snapshotPrompts(folder)).toEqual(before);
      });

      await test.step('refuses empty content and content larger than 256 KB with an error at the content field', async () => {
        await prompts.dialog.name.fill('Valid name');
        await prompts.dialog.text.fill('');
        await prompts.dialog.submit.click();

        await expect(prompts.dialog.textError).toBeVisible();
        await expect(prompts.dialog.textError).toHaveText(PROMPT_TEXT_REQUIRED);
        await expect(prompts.dialog.nameError).toBeHidden();
        expect(await snapshotPrompts(folder)).toEqual(before);

        await prompts.setValue(prompts.dialog.text, 'x'.repeat(PROMPT_BYTES_LIMIT + 1));
        await prompts.dialog.submit.click();

        await expect(prompts.dialog.textError).toBeVisible();
        await expect(prompts.dialog.textError).toHaveText(PROMPT_TEXT_TOO_LARGE);
        await expect(ui.main.toasts).toHaveCount(0);
        await expect(prompts.dialog.panel).toBeVisible();
        expect(await snapshotPrompts(folder)).toEqual(before);
      });
    });
  });
});
