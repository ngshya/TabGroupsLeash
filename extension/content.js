(function () {
  function findAnchor(el) {
    while (el && el !== document) {
      if (el.tagName === 'A' && el.hasAttribute('href')) return el;
      el = el.parentElement;
    }
    return null;
  }

  function shouldIgnore(anchor) {
    if (!anchor) return true;
    const href = anchor.getAttribute('href');
    if (!href) return true;
    if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return true;
    if (anchor.hasAttribute('download')) return true;
    return false;
  }

  function sendClick(anchor, modifiers) {
    chrome.runtime.sendMessage({ type: 'LINK_CLICK', href: anchor.href, modifiers });
  }

  // Left click
  document.addEventListener('click', function (e) {
    if (e.button !== 0) return;
    const anchor = findAnchor(e.target);
    if (shouldIgnore(anchor)) return;
    e.preventDefault();
    e.stopPropagation();
    sendClick(anchor, {
      newTab: e.ctrlKey || e.metaKey || e.shiftKey || anchor.target === '_blank',
      background: e.ctrlKey || e.metaKey
    });
  }, true);

  // Middle click (wheel)
  document.addEventListener('auxclick', function (e) {
    if (e.button !== 1) return;
    const anchor = findAnchor(e.target);
    if (shouldIgnore(anchor)) return;
    e.preventDefault();
    e.stopPropagation();
    sendClick(anchor, { newTab: true, background: true });
  }, true);
})();
