import { existsSync } from 'node:fs';

import { expect, test } from '../scripts/backend.ts';
// prettier-ignore
import { openVoices, readVoices, type SeedVoice, UNDONE_VOICE_WARNING, voiceDir } from '../scripts/voices.ts';

const VOICES: readonly SeedVoice[] = [
  { name: 'Narrator An', preset: 'Mai Anh', createdAt: '2026-03-01T08:00:00Z' },
  {
    name: 'Grandma',
    source: 'clone',
    referenceKind: 'file',
    referenceName: 'take.wav',
    createdAt: '2026-02-01T08:00:00Z',
  },
];

test.describe('CAP-05 Asset Library Management', () => {
  test.describe('FEAT-52 Voice Deletion', () => {
    test.use({ backendOptions: { models: ['vieneu-turbo'] } });

    test('US-0141 deletes a voice from the panel or the Delete key after a confirmation that warns it cannot be undone', async ({
      ui,
      picker,
      sandbox,
      app,
    }) => {
      const { folder, voices } = await openVoices(ui, picker, sandbox, VOICES);
      const list = ui.main.library.voices;
      const panel = ui.main.library.voicePanel;
      const confirm = ui.main.confirm;

      await test.step('names the voice and its engine and warns that the profile cannot be restored', async () => {
        await list.row('Narrator An').name.click();
        await panel.remove.click();
        await expect(confirm.panel).toBeVisible();
        await expect(confirm.names).toHaveText(['Narrator An']);
        await expect(confirm.metas).toContainText(['VieNeu-TTS v3 Turbo']);
        await expect(confirm.warning).toHaveText(UNDONE_VOICE_WARNING);
      });

      await test.step('keeps the voice when the confirmation is cancelled', async () => {
        await confirm.cancel.click();
        await expect(confirm.panel).toBeHidden();
        await expect(list.names).toHaveText(['Narrator An', 'Grandma']);
        expect(readVoices(folder)).toHaveLength(2);
      });

      await test.step('removes the voice, stops its sample and confirms the deletion', async () => {
        await panel.play.click();
        await panel.remove.click();
        await confirm.accept.click();
        await expect(ui.main.toast('Deleted “Narrator An”.')).toBeVisible();
        await expect(list.names).toHaveText(['Grandma']);
        expect(readVoices(folder).map((voice) => voice.name)).toEqual(['Grandma']);
      });

      await test.step('ignores the Delete key while typing in a field or while another dialog is open', async () => {
        await list.row('Grandma').name.click();
        await panel.sampleText.click();
        await app.page.keyboard.press('Delete');
        await expect(confirm.panel).toBeHidden();
        await list.create.click();
        await ui.main.library.voiceDialog.name.click();
        await app.page.keyboard.press('Delete');
        await expect(confirm.panel).toBeHidden();
        await ui.main.library.voiceDialog.cancel.click();
        expect(readVoices(folder)).toHaveLength(1);
      });

      await test.step('opens the confirmation with the Delete key for the selected voice and removes its files', async () => {
        await list.row('Grandma').name.click();
        await app.page.keyboard.press('Delete');
        await expect(confirm.names).toHaveText(['Grandma']);
        await confirm.accept.click();
        await expect(list.empty).toBeVisible();
        expect(readVoices(folder)).toEqual([]);
        expect(existsSync(voiceDir(folder, voices['Grandma']))).toBe(false);
      });
    });
  });
});
