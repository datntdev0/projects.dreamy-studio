// prettier-ignore
import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, viewChild } from '@angular/core';
import { Icon } from '@components/icon';

import { ScriptingMenuItem, ScriptingMenuService } from './scripting.menu.service';

const VIEWPORT_MARGIN = 8;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-menu',
  imports: [Icon],
  templateUrl: './menu.component.html',
})
export class ScriptingMenu {
  protected readonly menus = inject(ScriptingMenuService);
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  constructor() {
    afterRenderEffect(this.fit.bind(this));
  }

  choose(item: ScriptingMenuItem): void {
    this.menus.close();
    item.run();
  }

  @HostListener('document:click', ['$event'])
  closeOnOutside(event: Event): void {
    const state = this.menus.state();
    const target = event.target;
    const inside = target instanceof Node && (this.menu()?.nativeElement.contains(target) ?? false);
    const onAnchor = target instanceof Node && !!state?.anchor.contains(target);
    if (state && !inside && !onAnchor) {
      this.menus.close();
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.menus.close();
  }

  private fit(): void {
    const state = this.menus.state();
    const element = this.menu()?.nativeElement;
    if (state && element) {
      const left = Math.min(state.left, window.innerWidth - element.offsetWidth - VIEWPORT_MARGIN);
      element.style.left = `${left}px`;
    }
  }
}
