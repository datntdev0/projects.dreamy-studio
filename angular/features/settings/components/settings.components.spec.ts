import { TestBed } from '@angular/core/testing';
import { ComponentCase, describeComponents } from '@testing/exercise';
import { setupWorld, warmWorld } from '@testing/world';

import { SettingsService } from '../settings.service';
import { SettingsBackend } from './backend.component';
import { SettingsGeneral } from './general.component';
import { SettingsLlm } from './llm.component';
import { SettingsDialog } from './settings.dialog';

async function warm(): Promise<void> {
  await warmWorld();
}

const cases: ComponentCase[] = [
  { name: 'SettingsGeneral', type: SettingsGeneral, before: warm },
  { name: 'SettingsLlm', type: SettingsLlm, before: warm },
  { name: 'SettingsBackend', type: SettingsBackend, before: warm },
  {
    name: 'SettingsDialog (general)',
    type: SettingsDialog,
    before: async () => {
      await warm();
      TestBed.inject(SettingsService).openDialog('general');
    },
  },
  {
    name: 'SettingsDialog (llm)',
    type: SettingsDialog,
    before: async () => {
      await warm();
      TestBed.inject(SettingsService).openDialog('llm');
    },
  },
  {
    name: 'SettingsDialog (backend)',
    type: SettingsDialog,
    before: async () => {
      await warm();
      TestBed.inject(SettingsService).openDialog('backend');
    },
  },
  {
    name: 'SettingsDialog (cloud)',
    type: SettingsDialog,
    before: async () => {
      await warm();
      TestBed.inject(SettingsService).openDialog('cloud');
    },
  },
];

describeComponents('settings components', cases, () => {
  setupWorld();
});
