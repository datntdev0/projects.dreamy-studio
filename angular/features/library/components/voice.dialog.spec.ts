import { TestBed } from '@angular/core/testing';
import { mount, Mounted, settle } from '@testing/exercise';
import { FakeIpc } from '@testing/fake-ipc';
import { installFakeMedia, uninstallFakeMedia } from '@testing/media';
import { setupWorld, warmWorld } from '@testing/world';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LibraryDialogsService } from '../library.dialogs.service';
import { LibraryVoiceDialog } from './voice.dialog';

function byId(mounted: Mounted<LibraryVoiceDialog>, id: string): HTMLElement | null {
  return mounted.root.querySelector<HTMLElement>(`[data-testid='${id}']`);
}

async function click(mounted: Mounted<LibraryVoiceDialog>, id: string): Promise<void> {
  const target = byId(mounted, id);
  const control = target?.tagName === 'DS-BUTTON' ? target.querySelector('button') : target;
  control?.click();
  await settle(mounted.fixture, 2);
}

async function chooseClone(
  mounted: Mounted<LibraryVoiceDialog>,
  mode: 'library' | 'upload' | 'record',
): Promise<void> {
  mounted.instance.onSource('clone');
  mounted.instance.onReferenceMode(mode);
  await settle(mounted.fixture, 2);
}

async function open(): Promise<Mounted<LibraryVoiceDialog>> {
  return mount(LibraryVoiceDialog, {}, async () => {
    await warmWorld();
    TestBed.inject(LibraryDialogsService).openCreateVoice();
  });
}

describe('LibraryVoiceDialog', () => {
  let ipc: FakeIpc;

  beforeEach(() => {
    ipc = setupWorld();
    ipc.on('library_sound_pick', ['C:/in/ref.wav']);
    ipc.on('library_sound_inspect', [
      { path: 'C:/in/ref.wav', name: 'ref.wav', size: 2048, status: 'ok' },
    ]);
  });

  afterEach(() => {
    uninstallFakeMedia();
  });

  it('removes the description and speed and offers three reference ways', async () => {
    const mounted = await open();
    expect(byId(mounted, 'library-voice-dialog-speed')).toBeNull();
    expect(byId(mounted, 'library-voice-dialog-description')).not.toBeNull();
    await chooseClone(mounted, 'library');
    expect(byId(mounted, 'library-voice-dialog-reference')?.querySelectorAll('button').length).toBe(
      3,
    );
    expect(byId(mounted, 'library-voice-dialog-clone-help')).not.toBeNull();
  });

  it('uses a picked file as the clone reference and lets it be removed', async () => {
    const mounted = await open();
    mounted.instance.onName({ target: { value: 'Clone' } } as unknown as Event);
    mounted.instance.onConsent({ target: { checked: true } } as unknown as Event);
    await chooseClone(mounted, 'upload');
    expect(mounted.instance.canSubmit()).toBe(false);
    await click(mounted, 'library-voice-dialog-file-choose');
    expect(byId(mounted, 'library-voice-dialog-file-name')?.textContent?.trim()).toBe('ref.wav');
    expect(byId(mounted, 'library-voice-dialog-file-size')?.textContent?.trim()).toBe('2 KB');
    expect(mounted.instance.reference()).toEqual({
      kind: 'file',
      path: 'C:/in/ref.wav',
      name: 'ref.wav',
    });
    expect(mounted.instance.canSubmit()).toBe(true);
    await click(mounted, 'library-voice-dialog-file-remove');
    expect(mounted.instance.reference()).toBeNull();
    expect(byId(mounted, 'library-voice-dialog-file-choose')).not.toBeNull();
  });

  it('ignores a cancelled file pick', async () => {
    ipc.on('library_sound_pick', []);
    const mounted = await open();
    await chooseClone(mounted, 'upload');
    await click(mounted, 'library-voice-dialog-file-choose');
    expect(mounted.instance.referenceFile()).toBeNull();
  });

  it('records a clip, previews it and discards it', async () => {
    const media = installFakeMedia();
    const mounted = await open();
    await chooseClone(mounted, 'record');
    await click(mounted, 'library-voice-dialog-record-start');
    expect(byId(mounted, 'library-voice-dialog-record-live')).not.toBeNull();
    await click(mounted, 'library-voice-dialog-record-stop');
    await settle(mounted.fixture, 2);
    expect(byId(mounted, 'library-voice-dialog-record-duration')).not.toBeNull();
    expect(mounted.instance.reference()).toMatchObject({ kind: 'recording', mime: 'audio/webm' });
    await click(mounted, 'library-voice-dialog-record-play');
    expect(mounted.instance.recorder.playing()).toBe(true);
    await click(mounted, 'library-voice-dialog-record-discard');
    expect(mounted.instance.reference()).toBeNull();
    expect(byId(mounted, 'library-voice-dialog-record-start')).not.toBeNull();
    expect(media.stopTrack).toHaveBeenCalled();
    expect(media.revoke).toHaveBeenCalled();
  });

  it('shows an error when the microphone is unavailable', async () => {
    const media = installFakeMedia();
    media.getUserMedia.mockRejectedValue(new Error('denied'));
    const mounted = await open();
    await chooseClone(mounted, 'record');
    await click(mounted, 'library-voice-dialog-record-start');
    expect(byId(mounted, 'library-voice-dialog-record-error')).not.toBeNull();
  });

  it('stops the microphone when leaving the record way or closing', async () => {
    const media = installFakeMedia();
    const mounted = await open();
    await chooseClone(mounted, 'record');
    await click(mounted, 'library-voice-dialog-record-start');
    mounted.instance.onReferenceMode('library');
    expect(mounted.instance.recorder.state()).toBe('idle');
    expect(media.stopTrack).toHaveBeenCalled();
    mounted.instance.onReferenceMode('record');
    await click(mounted, 'library-voice-dialog-record-start');
    mounted.instance.close();
    expect(mounted.instance.recorder.state()).toBe('idle');
  });

  it('disables unsupported sources for a preset-only engine and falls back', async () => {
    const mounted = await open();
    mounted.instance.onSource('clone');
    mounted.instance.onEngine({ target: { value: 'edge-read-aloud' } } as unknown as Event);
    expect(mounted.instance.engine()?.id).toBe('edge-read-aloud');
    expect(mounted.instance.source()).toBe('preset');
    const options = mounted.instance.sourceOptions();
    expect(options.map((option) => option.disabled)).toEqual([false, true, true]);
    mounted.instance.onEngine({ target: { value: 'omnivoice' } } as unknown as Event);
    expect(mounted.instance.source()).toBe('clone');
  });
});
