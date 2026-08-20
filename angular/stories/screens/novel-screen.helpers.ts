const POLL_MS = 25;
const POLL_LIMIT = 200;

export async function waitFor<T extends Element>(root: HTMLElement, selector: string): Promise<T> {
  for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
    const element = root.querySelector<T>(selector);
    if (element) {
      return element;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Element not found: ${selector}`);
}

export async function click(root: HTMLElement, selector: string): Promise<void> {
  (await waitFor<HTMLElement>(root, selector)).click();
}

export async function choose(root: HTMLElement, selector: string, value: string): Promise<void> {
  const select = await waitFor<HTMLSelectElement>(root, selector);
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
