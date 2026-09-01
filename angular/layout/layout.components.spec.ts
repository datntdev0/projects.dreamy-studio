import { TestBed } from '@angular/core/testing';
import { LibraryVoiceService } from '@features/library/library.voices.service';
import { MainPage } from '@pages/main/main.page';
import { SplashPage } from '@pages/splash/splash.page';
import { ComponentCase, describeComponents } from '@testing/exercise';
import { setupWorld, warmWorld } from '@testing/world';

import { AppComponent } from '../root.component';
import { Bottom } from './bottom/bottom';
import { Editor } from './editor/editor';
import { Explorer } from './explorer/explorer';
import { Inspector } from './inspector/inspector';
import { Railbar } from './railbar/railbar';
import { Statusbar } from './statusbar/statusbar';
import { TabsService } from './tabs.service';
import { Titlebar } from './titlebar/titlebar';

async function warm(): Promise<void> {
  await warmWorld();
}

async function warmVoices(selected: boolean): Promise<void> {
  await warmWorld();
  TestBed.inject(TabsService).openVoices();
  if (selected) TestBed.inject(LibraryVoiceService).select(1);
}

async function warmModule(): Promise<void> {
  await warmWorld();
  TestBed.inject(TabsService).openModule(1, 'Audiobook One', 'scripting');
}

async function warmAudiobook(): Promise<void> {
  await warmWorld();
  TestBed.inject(TabsService).openModule(1, 'Audiobook One', 'audiobook');
}

const cases: ComponentCase[] = [
  { name: 'Titlebar', type: Titlebar, before: warm },
  { name: 'Railbar', type: Railbar, before: warm },
  { name: 'Statusbar', type: Statusbar, before: warm },
  { name: 'Explorer', type: Explorer, before: warm },
  { name: 'Editor', type: Editor, before: warm },
  { name: 'Inspector', type: Inspector, before: warm },
  { name: 'Editor (voices)', type: Editor, before: warmVoices.bind(null, false) },
  { name: 'Inspector (voices)', type: Inspector, before: warmVoices.bind(null, true) },
  { name: 'Inspector (voices, empty)', type: Inspector, before: warmVoices.bind(null, false) },
  { name: 'Editor (project module)', type: Editor, before: warmModule },
  { name: 'Inspector (project module)', type: Inspector, before: warmModule },
  { name: 'Inspector (audiobook module)', type: Inspector, before: warmAudiobook },
  { name: 'Bottom', type: Bottom, before: warm },
  { name: 'MainPage', type: MainPage, before: warm },
  { name: 'SplashPage', type: SplashPage, before: warm },
  { name: 'AppComponent', type: AppComponent, before: warm },
];

describeComponents('layout and pages', cases, () => {
  setupWorld();
});
