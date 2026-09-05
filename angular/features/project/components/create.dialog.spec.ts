import { TestBed } from '@angular/core/testing';
import { mount, settle } from '@testing/exercise';
import { FakeIpc } from '@testing/fake-ipc';
import { setupWorld, warmWorld } from '@testing/world';
import { beforeEach, describe, expect, it } from 'vitest';

import { ProjectDialogsService } from '../project.dialogs.service';
import { ProjectCreateDialog } from './create.dialog';

function select(root: HTMLElement, testId: string): HTMLSelectElement {
  return root.querySelector(`[data-testid="${testId}"]`) as HTMLSelectElement;
}

function choose(field: HTMLSelectElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('change'));
}

async function openDialog(): Promise<void> {
  await warmWorld();
  TestBed.inject(ProjectDialogsService).openCreate();
}

function optionLabels(field: HTMLSelectElement): string[] {
  return Array.from(field.options).map((option) => option.textContent?.trim() ?? '');
}

describe('ProjectCreateDialog text version', () => {
  let ipc: FakeIpc;

  beforeEach(() => {
    ipc = setupWorld();
  });

  it('offers the translations of the novel and creates the project from one', async () => {
    const mounted = await mount(ProjectCreateDialog, {}, openDialog);
    const root = mounted.root;
    expect(optionLabels(select(root, 'project-create-version-select'))).toEqual(['—']);

    choose(select(root, 'project-create-novel-select'), '1');
    await settle(mounted.fixture);
    const version = select(root, 'project-create-version-select');
    expect(optionLabels(version)).toEqual(['Original', 'Translation VI']);

    choose(version, 'VI');
    const name = root.querySelector(
      '[data-testid="project-create-name-input"]',
    ) as HTMLInputElement;
    name.value = 'Vietnamese audiobook';
    name.dispatchEvent(new Event('input'));
    await mounted.instance.submit();

    expect(ipc.lastArgs('project_create')).toMatchObject({
      input: { novelId: 1, srcKind: 'translation', srcLang: 'VI' },
    });
  });

  it('keeps the original text when no chapter is translated', async () => {
    ipc.on('translation_get', { guidelines: '', dict: [], chapters: {}, warnings: [] });
    const mounted = await mount(ProjectCreateDialog, {}, openDialog);
    choose(select(mounted.root, 'project-create-novel-select'), '1');
    await settle(mounted.fixture);
    expect(optionLabels(select(mounted.root, 'project-create-version-select'))).toEqual([
      'Original',
    ]);
  });
});
