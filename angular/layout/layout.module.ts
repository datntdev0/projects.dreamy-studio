import { NgModule } from '@angular/core';
import { Bottom } from '@layout/bottom/bottom';
import { Editor } from '@layout/editor/editor';
import { Explorer } from '@layout/explorer/explorer';
import { Inspector } from '@layout/inspector/inspector';
import { Railbar } from '@layout/railbar/railbar';
import { Statusbar } from '@layout/statusbar/statusbar';
import { Titlebar } from '@layout/titlebar/titlebar';

const LAYOUT_COMPONENTS = [Titlebar, Railbar, Explorer, Editor, Bottom, Inspector, Statusbar];

@NgModule({
  imports: LAYOUT_COMPONENTS,
  exports: LAYOUT_COMPONENTS,
})
export class LayoutModule {}
