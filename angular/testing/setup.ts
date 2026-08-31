const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

for (const name of ['showPopover', 'hidePopover']) {
  if (typeof proto[name] !== 'function') {
    proto[name] = function (): void {
      return;
    };
  }
}

if (typeof proto['togglePopover'] !== 'function') {
  proto['togglePopover'] = function (): boolean {
    return true;
  };
}

if (typeof proto['showPicker'] !== 'function') {
  proto['showPicker'] = function (): void {
    return;
  };
}

if (typeof proto['scrollIntoView'] !== 'function') {
  proto['scrollIntoView'] = function (): void {
    return;
  };
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {
      return;
    }
    unobserve(): void {
      return;
    }
    disconnect(): void {
      return;
    }
  };
}
