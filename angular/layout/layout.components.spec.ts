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
import { Titlebar } from './titlebar/titlebar';

async function warm(): Promise<void> {
  await warmWorld();
}

const cases: ComponentCase[] = [
  { name: 'Titlebar', type: Titlebar, before: warm },
  { name: 'Railbar', type: Railbar, before: warm },
  { name: 'Statusbar', type: Statusbar, before: warm },
  { name: 'Explorer', type: Explorer, before: warm },
  { name: 'Editor', type: Editor, before: warm },
  { name: 'Inspector', type: Inspector, before: warm },
  { name: 'Bottom', type: Bottom, before: warm },
  { name: 'MainPage', type: MainPage, before: warm },
  { name: 'SplashPage', type: SplashPage, before: warm },
  { name: 'AppComponent', type: AppComponent, before: warm },
];

describeComponents('layout and pages', cases, () => {
  setupWorld();
});
