import type { Locator } from '@playwright/test';

export class RecentList {
  constructor(private readonly root: Locator) {}

  get rows(): Locator {
    return this.root.getByTestId('recent-row');
  }

  rowAt(path: string): Locator {
    return this.rows.filter({
      has: this.root.page().getByTestId('recent-row-path').filter({ hasText: path }),
    });
  }

  openAt(path: string): Locator {
    return this.rowAt(path).getByTestId('recent-open');
  }

  deleteAt(path: string): Locator {
    return this.rowAt(path).getByTestId('recent-delete');
  }

  currentBadgeAt(path: string): Locator {
    return this.rowAt(path).getByTestId('recent-current');
  }

  notFoundBadgeAt(path: string): Locator {
    return this.rowAt(path).getByTestId('recent-not-found');
  }

  notFoundReasonAt(path: string): Locator {
    return this.rowAt(path).getByTestId('recent-not-found-reason');
  }
}
