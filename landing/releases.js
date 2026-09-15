const LATEST_RELEASE_URL =
  'https://api.github.com/repos/datntdev0/projects.dreamy-studio/releases/latest';
const BYTES_PER_MB = 1024 * 1024;

function formatSize(bytes) {
  return `${Math.round(bytes / BYTES_PER_MB)} MB`;
}

function findAsset(assets, suffix) {
  return assets.find((asset) => asset.name.endsWith(suffix));
}

function applyAssetLink(link, assets) {
  const asset = findAsset(assets, link.dataset.releaseAsset);
  if (asset) link.href = asset.browser_download_url;
}

function applyAssetSize(label, assets) {
  const asset = findAsset(assets, label.dataset.releaseSize);
  if (asset) label.textContent = formatSize(asset.size);
}

async function fetchLatestAssets() {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) return [];
  const release = await response.json();
  return release.assets ?? [];
}

async function bindReleaseAssets() {
  const assets = await fetchLatestAssets().catch(() => []);
  for (const link of document.querySelectorAll('[data-release-asset]')) {
    applyAssetLink(link, assets);
  }
  for (const label of document.querySelectorAll('[data-release-size]')) {
    applyAssetSize(label, assets);
  }
}

bindReleaseAssets();
