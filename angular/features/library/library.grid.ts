import { signal, WritableSignal } from '@angular/core';

import { readGridRatio, readGridSize, writeStored } from './library.grid.prefs';

const DEFAULT_GRID_SIZE = 176;
const DEFAULT_GRID_RATIO = '16/9';

export class LibraryGrid {
  readonly size: WritableSignal<number>;
  readonly ratio: WritableSignal<string>;

  constructor(
    private readonly sizeKey: string,
    private readonly ratioKey: string,
  ) {
    this.size = signal(readGridSize(sizeKey, DEFAULT_GRID_SIZE));
    this.ratio = signal(readGridRatio(ratioKey, DEFAULT_GRID_RATIO));
  }

  setSize(value: number): void {
    this.size.set(value);
    writeStored(this.sizeKey, String(value));
  }

  setRatio(value: string): void {
    this.ratio.set(value);
    writeStored(this.ratioKey, value);
  }
}
