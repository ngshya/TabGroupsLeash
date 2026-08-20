const groupsContainer = document.getElementById('groupsContainer');
const emptyState = document.getElementById('emptyState');
const groupTemplate = document.getElementById('groupTemplate');
const ruleTemplate = document.getElementById('ruleTemplate');
const quickAddTemplate = document.getElementById('quickAddTemplate');
const enabledToggle = document.getElementById('enabledToggle');

const GROUP_COLORS = {
  grey: '#8f9bb3', blue: '#4a90e2', red: '#e25c5c', yellow: '#e2c94a',
  green: '#4ae28c', pink: '#e24aa8', purple: '#a04ae2', cyan: '#4ae2e2', orange: '#e28c4a'
};

async function init() {
  enabledToggle.checked = await getEnabled();
  enabledToggle.addEventListener('change', () => setEnabled(enabledToggle.checked));
  await renderGroups();
}

async function renderGroups() {
  const win = await chrome.windows.getCurrent();
  const groups = await chrome.tabGroups.query({ windowId: win.id });

  groupsContainer.innerHTML = '';
  if (groups.length === 0) {
    groupsContainer.appendChild(emptyState);
    return;
  }

  for (const group of groups) {
    const tabs = await chrome.tabs.query({ groupId: group.id });
    const node = renderGroup(group, tabs);
    groupsContainer.appendChild(node);
  }
}

function renderGroup(group, tabs) {
  const node = groupTemplate.content.cloneNode(true);
  const section = node.querySelector('.group');
  node.querySelector('.dot').style.background = GROUP_COLORS[group.color] || '#999';
  node.querySelector('.group-title').textContent = group.title || '(untitled)';

  const isSynced = !!group.title;
  if (!isSynced) node.querySelector('.untitled-warning').hidden = false;

  const groupPatternInput = node.querySelector('.group-pattern');
  const ruleList = node.querySelector('.rule-list');
  const deleteGroupBtn = node.querySelector('.delete-group');
  const addRuleBtn = node.querySelector('.add-rule');
  const quickAddBox = node.querySelector('.quick-add');
  const quickAddList = node.querySelector('.quick-add-list');

  const groupDefault = defaultPatternForUrl(tabs[0]?.url || '');
  deleteGroupBtn.hidden = !isSynced;

  // --- Load settings (sync for titled groups, local for untitled ones) ---
  (async () => {
    let settings;
    if (isSynced) {
      settings = await getGroupSettings(group.title);
    } else {
      const local = await getLocalFallback();
      const entry = local.untitledGroups[group.id];
      settings = { pattern: entry?.pattern || null, rules: [] };
    }

    groupPatternInput.value = settings.pattern || groupDefault;

    for (const rule of settings.rules || []) {
      ruleList.appendChild(buildRuleRow(group, isSynced, rule, () => saveGroup(group, isSynced, groupPatternInput, ruleList)));
    }

    // Quick suggestions: open tabs in the group that don't have a rule yet
    if (isSynced) {
      const existingMatches = new Set((settings.rules || []).map((r) => r.match));
      for (const tab of tabs) {
        const suggestedMatch = defaultMatchForUrl(tab.url);
        if (existingMatches.has(suggestedMatch)) continue;
        const qa = quickAddTemplate.content.cloneNode(true);
        qa.querySelector('.quick-add-title').textContent = tab.title || tab.url;
        qa.querySelector('.quick-add-btn').addEventListener('click', () => {
          const row = buildRuleRow(group, isSynced, { match: suggestedMatch, pattern: suggestedMatch }, () => saveGroup(group, isSynced, groupPatternInput, ruleList));
          ruleList.appendChild(row);
          saveGroup(group, isSynced, groupPatternInput, ruleList);
        });
        quickAddList.appendChild(qa);
      }
      if (quickAddList.children.length > 0) quickAddBox.hidden = false;
    }
  })();

  groupPatternInput.addEventListener('change', () => saveGroup(group, isSynced, groupPatternInput, ruleList));

  addRuleBtn.addEventListener('click', () => {
    const row = buildRuleRow(group, isSynced, { match: '', pattern: '' }, () => saveGroup(group, isSynced, groupPatternInput, ruleList));
    ruleList.appendChild(row);
  });

  deleteGroupBtn.addEventListener('click', async () => {
    await deleteGroupSettings(group.title);
    groupPatternInput.value = groupDefault;
    ruleList.innerHTML = '';
  });

  return node;
}

function buildRuleRow(group, isSynced, rule, onChange) {
  const node = ruleTemplate.content.cloneNode(true);
  const li = node.querySelector('.rule-row');
  const matchInput = node.querySelector('.rule-match');
  const patternInput = node.querySelector('.rule-pattern');
  const deleteBtn = node.querySelector('.delete-rule');

  matchInput.value = rule.match || '';
  patternInput.value = rule.pattern || '';

  matchInput.addEventListener('change', onChange);
  patternInput.addEventListener('change', onChange);
  deleteBtn.addEventListener('click', () => {
    li.remove();
    onChange();
  });

  return node;
}

async function saveGroup(group, isSynced, groupPatternInput, ruleList) {
  const pattern = groupPatternInput.value.trim();
  const rules = Array.from(ruleList.querySelectorAll('.rule-row'))
    .map((row) => ({
      match: row.querySelector('.rule-match').value.trim(),
      pattern: row.querySelector('.rule-pattern').value.trim()
    }))
    .filter((r) => r.match && r.pattern);

  if (isSynced) {
    try {
      await setGroupSettings(group.title, { pattern, rules });
    } catch (e) {
      alert('Save failed (likely a storage.sync quota limit): ' + e.message);
    }
  } else {
    const local = await getLocalFallback();
    local.untitledGroups[group.id] = { pattern };
    await setLocalFallback({ untitledGroups: local.untitledGroups });
  }
}

// Redraw if another device changes settings while the popup is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') renderGroups();
});

init();
