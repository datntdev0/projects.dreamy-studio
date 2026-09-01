import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ScriptContext } from '../scripting.models';
import { ScriptingEmpty } from './empty.component';
import { ScriptingPage } from './page.component';
import { ScriptingSourcePage } from './source-page.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-body',
  imports: [ScriptingEmpty, ScriptingPage, ScriptingSourcePage],
  templateUrl: './body.component.html',
})
export class ScriptingBody {
  readonly ctx = input.required<ScriptContext>();
}
