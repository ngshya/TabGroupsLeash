const enabledToggle = document.getElementById('enabledToggle');
const themeBtn = document.getElementById('themeBtn');
const groupsList = document.getElementById('groupsList');
const emptyState = document.getElementById('emptyState');
const openOptionsBtn = document.getElementById('openOptionsBtn');
const versionLabel = document.getElementById('versionLabel');
const groupRowTemplate = document.getElementById('groupRowTemplate');

const GROUP_COLORS = {
  grey: '#8f9bb3', blue: '#4a90e2', red: '#e25c5c', yellow: '#e2c94a',
  green: '#4ae28c', pink: '#e24aa8', purple: '#a04ae2', cyan: '#4ae2e2', orange: '#e28c4a'
};

const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_ICONS = { system: '🖥️', light: '☀️', dark: '🌙' };
const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

async function init() {
  enabledToggle.checked = await getEnabled();
  enabledToggle.addEventListener('change', () => setEnabled(enabledToggle.checked));

  const theme = await getThemePreference();
  applyTheme(theme);
  paintThemeBtn(theme);
  themeBtn.addEventListener('click', async () => {
    const current = await getThemePreference();
    const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
    await setThemePreference(next);
    applyTheme(next);
    paintThemeBtn(next);
  });

  versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;

  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  await renderGroupsList();
}

function paintThemeBtn(theme) {
  themeBtn.textContent = THEME_ICONS[theme] || THEME_ICONS.system;
  themeBtn.title = `Theme: ${THEME_LABELS[theme] || 'System'} (click to change)`;
}

// A quick overview: every group with saved rules, plus every group open in
// this window even if it has none yet — each showing its rule count. Click
// one to jump straight into editing it on the manage page.
async function renderGroupsList() {
  const win = await chrome.windows.getCurrent();
  const groups = await chrome.tabGroups.query({ windowId: win.id });
  const local = await getLocalFallback();

  const openEntries = await Promise.all(groups.map(async (group) => {
    const isSynced = !!group.title;
    const settings = isSynced
      ? await getGroupSettings(group.title)
      : local.untitledGroups[group.id] || { rules: [] };
    return {
      title: group.title || '(untitled)',
      color: group.color,
      isOpen: true,
      ruleCount: (settings.rules || []).length
    };
  }));

  const openTitles = new Set(groups.filter((g) => g.title).map((g) => g.title));
  const allTitles = await getAllGroupTitles();
  const elsewhereEntries = await Promise.all(
    allTitles
      .filter((title) => !openTitles.has(title))
      .sort((a, b) => a.localeCompare(b))
      .map(async (title) => ({
        title,
        color: null,
        isOpen: false,
        ruleCount: (await getGroupSettings(title)).rules.length
      }))
  );

  const entries = [...openEntries, ...elsewhereEntries];

  // Remove only previously rendered rows — emptyState is a permanent fixture
  // of groupsList and must stay in the DOM to be toggled below.
  groupsList.querySelectorAll('.group-row').forEach((el) => el.remove());

  if (entries.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  for (const entry of entries) {
    const node = groupRowTemplate.content.cloneNode(true);
    const row = node.querySelector('.group-row');
    const dot = node.querySelector('.dot');
    node.querySelector('.group-row-title').textContent = entry.title;
    node.querySelector('.group-row-count').textContent =
      entry.ruleCount === 1 ? '1 rule' : `${entry.ruleCount} rules`;

    if (entry.isOpen) {
      dot.style.background = GROUP_COLORS[entry.color] || '#999';
    } else {
      dot.classList.add('unknown');
      row.classList.add('not-open');
      row.title = `"${entry.title}" isn't open in this window right now`;
    }

    row.addEventListener('click', () => openManagePage(entry.title));
    groupsList.appendChild(node);
  }
}

// Opens (or focuses an already-open) manage page, deep-linked to this group.
async function openManagePage(title) {
  const url = chrome.runtime.getURL('options.html');
  const hash = title ? `#group=${encodeURIComponent(title)}` : '';
  const existing = await chrome.tabs.query({ url: `${url}*` });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true, url: url + hash });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: url + hash });
  }
  window.close();
}

init();
