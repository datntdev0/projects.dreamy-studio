import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AudiobookDialogsService } from './audiobook.dialogs.service';

describe('AudiobookDialogsService', () => {
  it('opens and closes the generate and flag requests', () => {
    const dialogs = TestBed.inject(AudiobookDialogsService);
    expect(dialogs.request()).toBeNull();
    dialogs.openGenerate(3);
    expect(dialogs.request()).toEqual({ kind: 'generate', projectId: 3 });
    expect(dialogs.projectIdOf('generate')).toBe(3);
    expect(dialogs.projectIdOf('flag')).toBeNull();
    expect(dialogs.flagTarget()).toBeNull();
    dialogs.openFlag(3, 'B7');
    expect(dialogs.request()).toEqual({ kind: 'flag', projectId: 3, blockId: 'B7' });
    expect(dialogs.flagTarget()).toEqual({ kind: 'flag', projectId: 3, blockId: 'B7' });
    expect(dialogs.projectIdOf('generate')).toBeNull();
    dialogs.close();
    expect(dialogs.request()).toBeNull();
  });
});
