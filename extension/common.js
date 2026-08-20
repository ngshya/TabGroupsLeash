// Shared utilities used by background.js and popup.js

const GROUP_KEY_PREFIX = 'grp::';
const ENABLED_KEY = 'enabled';

function groupKey(title) {
  return GROUP_KEY_PREFIX + title;
}

// --- Global on/off setting: synced (small, no quota concerns) ---

function getEnabled() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [ENABLED_KEY]: true }, (data) => resolve(data[ENABLED_KEY]));
  });
}

function setEnabled(value) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [ENABLED_KEY]: value }, resolve);
  });
}

// --- Per-group settings, indexed by TITLE (a stable cross-device key) ---
// Shape: { pattern: "*://example.com/*", rules: [{ match, pattern }, ...] }

function getGroupSettings(title) {
  const key = groupKey(title);
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [key]: { pattern: null, rules: [] } }, (data) => resolve(data[key]));
  });
}

function setGroupSettings(title, settings) {
  const key = groupKey(title);
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [key]: settings }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

function deleteGroupSettings(title) {
  const key = groupKey(title);
  return new Promise((resolve) => chrome.storage.sync.remove(key, resolve));
}

async function getAllGroupTitles() {
  const all = await new Promise((resolve) => chrome.storage.sync.get(null, resolve));
  return Object.keys(all)
    .filter((k) => k.startsWith(GROUP_KEY_PREFIX))
    .map((k) => k.slice(GROUP_KEY_PREFIX.length));
}

// --- Local-only fallback for untitled groups (not reliably syncable) ---

const LOCAL_DEFAULTS = { untitledGroups: {} }; // { [groupId]: { pattern } }

function getLocalFallback() {
  return new Promise((resolve) => chrome.storage.local.get(LOCAL_DEFAULTS, resolve));
}

function setLocalFallback(partial) {
  return new Promise((resolve) => chrome.storage.local.set(partial, resolve));
}

// --- Pattern matching ---

// Converts a "glob" pattern (with *) into a RegExp. "regex:" prefix for advanced patterns.
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$');
}

function matchesPattern(url, pattern) {
  if (!pattern) return false;
  try {
    if (pattern.startsWith('regex:')) {
      return new RegExp(pattern.slice(6)).test(url);
    }
    return globToRegExp(pattern).test(url);
  } catch (e) {
    return false;
  }
}

// Default pattern = the page's domain, e.g. *://example.com/*
function defaultPatternForUrl(url) {
  try {
    const u = new URL(url);
    return `*://${u.hostname}/*`;
  } catch (e) {
    return '*';
  }
}

// Default "match" for a per-page rule = domain + current path
function defaultMatchForUrl(url) {
  try {
    const u = new URL(url);
    return `*://${u.hostname}${u.pathname}*`;
  } catch (e) {
    return '*';
  }
}

// Finds the most specific rule (heuristic: longest match wins) among those
// whose "match" field matches the tab's current URL.
function findRuleForTabUrl(groupSettings, tabUrl) {
  if (!groupSettings || !Array.isArray(groupSettings.rules)) return null;
  let best = null;
  for (const rule of groupSettings.rules) {
    if (rule.match && matchesPattern(tabUrl, rule.match)) {
      if (!best || rule.match.length > best.match.length) best = rule;
    }
  }
  return best;
}

// Resolves the pattern to apply to links clicked in a tab, given the tab's
// current URL and its group's (synced) settings.
function resolvePatternForTab(groupSettings, tabUrl) {
  const rule = findRuleForTabUrl(groupSettings, tabUrl);
  if (rule) return rule.pattern;
  if (groupSettings && groupSettings.pattern) return groupSettings.pattern;
  return defaultPatternForUrl(tabUrl);
}
