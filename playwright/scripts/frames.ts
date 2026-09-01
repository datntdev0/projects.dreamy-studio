import type { Page } from '@playwright/test';

const DEFAULT_FRAMES = 20;

function countFrames(frames: number): Promise<void> {
  return new Promise((done) => {
    let remaining = frames;
    const tick = (): void => {
      remaining -= 1;
      if (remaining <= 0) {
        done();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export async function waitForFrames(page: Page, frames: number = DEFAULT_FRAMES): Promise<void> {
  await page.evaluate(countFrames, frames);
}
