import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { WorkspaceLoadService } from "./workspace-load.service";

export const loadingGuard: CanActivateFn = () => {
  const loader = inject(WorkspaceLoadService);
  const router = inject(Router);
  return loader.state() !== null || router.createUrlTree(["/"]);
};
