import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { WorkspaceService } from './workspace.service';

export const homeGuard: CanActivateFn = async () => {
  const workspace = inject(WorkspaceService);
  const router = inject(Router);
  return (await hasCurrentWorkspace(workspace)) || router.createUrlTree(['/']);
};

async function hasCurrentWorkspace(workspace: WorkspaceService): Promise<boolean> {
  if (workspace.current() !== null) {
    return true;
  }
  try {
    return (await workspace.restoreCurrent()) !== null;
  } catch {
    return false;
  }
}
