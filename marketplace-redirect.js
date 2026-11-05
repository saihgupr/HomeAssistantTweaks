/*
 * marketplace-redirect.js - native sidebar entry for the Marketplace.
 * Used with a panel_custom: block (see README). The panel immediately
 * redirects to its target, so the sidebar item behaves like a normal entry
 * (visible in the sidebar and Edit sidebar, synced across devices).
 */
(function () {
  function resolveTarget(panel) {
    try {
      var cfg = (panel && panel.config) || {};
      var custom = cfg._panel_custom || {};
      var nested = custom.config || {};
      var t = custom.target || nested.target || cfg.target || '/marketplace';
      t = String(t || '/marketplace');
      return t.charAt(0) === '/' ? t : '/' + t;
    } catch (e) {
      return '/marketplace';
    }
  }
  function go(el) {
    if (!el || el._redirectDone) return;
    el._redirectDone = true;
    var target = resolveTarget(el._panel);
    try {
      history.replaceState(null, '', target);
      window.dispatchEvent(
        new CustomEvent('location-changed', { bubbles: true, composed: true })
      );
    } catch (e) {
      window.location.assign(target);
    }
  }
  class MarketplaceRedirect extends HTMLElement {
    set panel(p) {
      this._panel = p;
      if (this.isConnected) go(this);
    }
    set hass(_hass) {}
    set narrow(_narrow) {}
    set route(_route) {}
    connectedCallback() {
      go(this);
    }
  }
  try {
    customElements.define('marketplace-redirect', MarketplaceRedirect);
  } catch (e) {
    // already defined on reload
  }
})();
