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
// Shape: { rules: [{ match, pattern }, ...] }
//
// There is no group-wide default pattern: every tab is leashed individually,
// by matching its current URL against each rule's "match" field. A tab whose
// URL doesn't match any rule is left alone (normal browser behavior) until a
// rule is added for it — see resolvePatternForTab below.

function getGroupSettings(title) {
  const key = groupKey(title);
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [key]: { rules: [] } }, (data) => resolve(data[key]));
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
// Same per-tab-rules shape as synced group settings, just keyed by the
// browser-local numeric groupId instead of a title.

const LOCAL_DEFAULTS = { untitledGroups: {} }; // { [groupId]: { rules: [{ match, pattern }, ...] } }

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

// Suggested "match"/starting pattern for a specific page: domain + full path,
// deliberately keeping every path segment ("levels") but dropping the query
// string and fragment — new URL(...).pathname never includes "?..." or "#...".
// This is what "Use this page" seeds both the rule's match and its pattern with.
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
// current URL and its group's (synced, or local-fallback) settings. Returns
// null when no rule covers this tab yet — callers should treat that as
// "unleashed" rather than "blocks everything".
function resolvePatternForTab(groupSettings, tabUrl) {
  const rule = findRuleForTabUrl(groupSettings, tabUrl);
  return rule ? rule.pattern : null;
}
