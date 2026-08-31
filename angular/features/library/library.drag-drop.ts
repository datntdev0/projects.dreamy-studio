import { WritableSignal } from '@angular/core';
// prettier-ignore
import { DesktopDragDropEvent, DesktopIpcService, DesktopUnlisten } from '@shared/desktop/desktop-ipc.service';

import { LibraryDialogsService } from './library.dialogs.service';
import { LibraryKind } from './library.models';

export function handleLibraryDragDrop(
  event: DesktopDragDropEvent,
  dragging: WritableSignal<boolean>,
  dialogs: LibraryDialogsService,
  kind: LibraryKind,
): void {
  if (dialogs.uploadOpen()) {
    dragging.set(false);
    return;
  }
  if (event.type === 'enter' || event.type === 'over') {
    dragging.set(true);
    return;
  }
  if (event.type === 'leave') {
    dragging.set(false);
    return;
  }
  if (event.type === 'drop') {
    dragging.set(false);
    dialogs.openUpload(event.paths, kind);
  }
}

export function listenForLibraryDrops(
  ipc: DesktopIpcService,
  dragging: WritableSignal<boolean>,
  dialogs: LibraryDialogsService,
  kind: LibraryKind,
): Promise<DesktopUnlisten> {
  return ipc.onDragDrop((event) => handleLibraryDragDrop(event, dragging, dialogs, kind));
}
