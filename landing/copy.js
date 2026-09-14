const COPIED_LABEL = 'Đã sao chép';
const RESET_DELAY_MS = 2000;

function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  fallbackCopy(text);
}

function resetButton(button) {
  button.textContent = button.dataset.label;
  button.classList.remove('is-copied');
}

async function handleCopy(event) {
  const button = event.currentTarget;
  const target = document.getElementById(button.dataset.copyTarget);
  if (!target) return;
  button.dataset.label ??= button.textContent.trim();
  await writeClipboard(target.textContent.trim().replace(/\s+/g, ' '));
  button.textContent = COPIED_LABEL;
  button.classList.add('is-copied');
  setTimeout(resetButton, RESET_DELAY_MS, button);
}

function bindCopyButtons() {
  for (const button of document.querySelectorAll('[data-copy-target]')) {
    button.addEventListener('click', handleCopy);
  }
}

bindCopyButtons();
