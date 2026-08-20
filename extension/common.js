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

// --- Startup reconciliation delay (seconds), synced ---
// How long background.js waits after chrome.runtime.onStartup before
// checking every group for missing/duplicate tabs, so Chrome's own session
// restore has time to finish first. See background.js's onStartup listener.

const STARTUP_DELAY_KEY = 'startupDelaySeconds';
const DEFAULT_STARTUP_DELAY_SECONDS = 15;

function getStartupDelaySeconds() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [STARTUP_DELAY_KEY]: DEFAULT_STARTUP_DELAY_SECONDS }, (data) => resolve(data[STARTUP_DELAY_KEY]));
  });
}

function setStartupDelaySeconds(seconds) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STARTUP_DELAY_KEY]: seconds }, resolve);
  });
}

// --- Theme preference, synced ---
// 'system' (follow the browser/OS), 'light', or 'dark'. Applied via a
// data-theme attribute on <html> — see theme.css and each page's applyTheme().

const THEME_KEY = 'theme';
const DEFAULT_THEME = 'system';

function getThemePreference() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [THEME_KEY]: DEFAULT_THEME }, (data) => resolve(data[THEME_KEY]));
  });
}

function setThemePreference(theme) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [THEME_KEY]: theme }, resolve);
  });
}

// Applies the theme to the current page. 'system' clears the override and
// lets theme.css's prefers-color-scheme media query decide.
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

// --- Per-group settings, indexed by TITLE (a stable cross-device key) ---
// Shape: { rules: [{ match, pattern, openUrl }, ...] }
//
// There is no group-wide default pattern: every tab is leashed individually,
// by matching its current URL against each rule's "match" field. A tab whose
// URL doesn't match any rule (or matches one with no "pattern") is left alone
// (normal browser behavior) — see resolvePatternForTab below.
//
// "openUrl", if set, is the exact URL background.js reopens on browser
// startup when no open tab in the group matches "match" anymore (e.g. the
// tab was closed by accident, or a crash lost it) — see
// background.js#reconcileGroups. "match" is reused as the "is it still
// there" check, so a rule only needs "pattern" (link leashing), only
// "openUrl" (presence guarantee), or both.

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

const LOCAL_DEFAULTS = { untitledGroups: {} }; // { [groupId]: { rules: [{ match, pattern, openUrl }, ...] } }

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
// null when no rule covers this tab yet, or the matching rule has no
// "pattern" (an openUrl-only, presence-guarantee rule) — callers should
// treat that as "unleashed" rather than "blocks everything".
function resolvePatternForTab(groupSettings, tabUrl) {
  const rule = findRuleForTabUrl(groupSettings, tabUrl);
  return rule && rule.pattern ? rule.pattern : null;
}
