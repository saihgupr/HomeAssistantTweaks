/*
 * HA Tweaks v1.14.0 - frontend QoL tweaks for Home Assistant
 * Single-file, zero-dependency frontend plugin for Home Assistant.
 * Load via configuration.yaml:
 *   frontend:
 *     extra_module_url:
 *       - /local/ha-tweaks.js
 *
 * Tweaks:
 *   1. Automation + script context menu (right-click + touch long-press)
 *   2. Auto-collapse automation & script editor + Collapse/Expand All toolbar button
 *   3. Dashboard empty-space menu (right-click -> New Automation/Script)
 *   4. Right-click = long press on Lovelace cards, rows, tiles, and badges
 *   5. Editor row context menu (right-click a trigger/condition/action row)
 *   6. Chips: show after active for (Mushroom chips-card `for:` gating)
 *   7. Drag sidebar items to reorder them (mouse drag / touch hold)
 */

(() => {
  const HA_TWEAKS_VERSION = '1.14.0';
  const CONFIG_KEY = 'ha_tweaks_config';
  // Pre-1.9.0 keys: read once as fallback so existing users keep their toggles.
  const LEGACY_CONFIG_KEY = 'ha_mods_config';
  const LEGACY_DEBUG_KEY = 'ha_mods_debug';
  const LOG_TAG = `[HA Tweaks v${HA_TWEAKS_VERSION}]`;

  /* ---------- debug: gated logging for field diagnosis ---------- */
  // Disabled by default. Enable in the browser console with:
  //   localStorage.ha_tweaks_debug = '1'
  // then reproduce the issue. Disable with:
  //   delete localStorage.ha_tweaks_debug
  function debugLog() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      let flag = null;
      try {
        flag =
          typeof localStorage.getItem === 'function'
            ? localStorage.getItem('ha_tweaks_debug') || localStorage.getItem(LEGACY_DEBUG_KEY)
            : localStorage.ha_tweaks_debug;
      } catch (e) {
        return;
      }
      if (flag !== '1') return;
      const args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_TAG + ' [debug]');
      try {
        console.log.apply(console, args);
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // never break the tweaks for logging
    }
  }

  /* ---------- tunables: tweak these to taste (see README "Make it yours") ---------- */
  const LONG_PRESS_MS = 550;
  const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
  const LONG_PRESS_SUPPRESS_MS = 2000;
  // Clicks on the backdrop this soon after a long-press menu opens are the
  // lifting finger, not a dismissal tap. HA's own hold fires on release, so
  // without this the menu would close the instant it appears on touch.
  const LIFT_CLICK_IGNORE_MS = 600;

  /* ---------- tiny config store (synced per HA user, all browsers + app) ---------- */
  // localStorage = instant cache + offline fallback.
  // HA backend (frontend user_data WS) = source of truth, follows the user.
  let _memCfg = null;
  let _pushTimer = null;
  let _pulled = false;
  let _pendingPush = false;
  // Fresh-install detection (opt-in defaults): true once this browser ever
  // held stored toggles (new or legacy key).
  let _hadLocalCfg = false;
  // True once the HA account ever held stored toggles (new or legacy key).
  let _hadServerCfg = false;

  function readLocal() {
    try {
      let raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) {
        // Adopt pre-1.9.0 settings once, then persist under the new key.
        raw = localStorage.getItem(LEGACY_CONFIG_KEY);
        if (raw) localStorage.setItem(CONFIG_KEY, raw);
      }
      if (raw) _hadLocalCfg = true;
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeLocal(cfg) {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg || {}));
      // Anything persisted locally means this browser is no longer fresh.
      _hadLocalCfg = true;
    } catch (e) {
      // storage may be unavailable; toggles just won't persist locally
    }
  }

  function loadConfig() {
    if (!_memCfg) _memCfg = readLocal();
    return _memCfg;
  }

  function pullFromServer(hass) {
    if (!hass || typeof hass.callWS !== 'function') {
      console.warn(LOG_TAG, 'sync pull skipped: no callWS');
      _pulled = true;
      return Promise.resolve(null);
    }
    return hass
      .callWS({ type: 'frontend/get_user_data', key: CONFIG_KEY })
      .then((res) => {
        _pulled = true;
        const val = res && res.value !== undefined ? res.value : res;
        let hasServerCfg = false;
        try {
          hasServerCfg = !!(val && typeof val === 'object' && Object.keys(val).length > 0);
        } catch (e) {
          hasServerCfg = false;
        }
        if (hasServerCfg) {
          _hadServerCfg = true;
          _memCfg = val;
          writeLocal(val);
          console.log(LOG_TAG, 'sync pull: using server config', val);
          if (_pendingPush) {
            _pendingPush = false;
            schedulePush();
          }
          return val;
        }
        console.log(LOG_TAG, 'sync pull: no server config yet, checking legacy key');
        return hass
          .callWS({ type: 'frontend/get_user_data', key: LEGACY_CONFIG_KEY })
          .then((legacy) => {
            const val = legacy && legacy.value !== undefined ? legacy.value : legacy;
            let hasLegacyCfg = false;
            try {
              hasLegacyCfg = !!(val && typeof val === 'object' && Object.keys(val).length > 0);
            } catch (e) {
              hasLegacyCfg = false;
            }
            if (hasLegacyCfg) {
              _hadServerCfg = true;
              _memCfg = val;
              writeLocal(val);
              console.log(LOG_TAG, 'sync pull: migrated legacy server config', val);
              _pendingPush = false;
              schedulePush();
              return val;
            }
            console.log(LOG_TAG, 'sync pull: no server config yet, using local');
            return null;
          })
          .catch(() => {
            console.log(LOG_TAG, 'sync pull: no server config yet, using local');
            return null;
          })
          .then((val) => {
            if (_pendingPush) {
              _pendingPush = false;
              schedulePush();
            }
            return val;
          });
      })
      .catch((e) => {
        _pulled = true;
        console.warn(LOG_TAG, 'sync pull failed, using local:', e);
        if (_pendingPush) {
          _pendingPush = false;
          schedulePush();
        }
        return null;
      });
  }

  function pushToServer() {
    try {
      if (!_pulled) {
        // Initial pull hasn't finished; don't clobber server data with local-only.
        _pendingPush = true;
        return;
      }
      const hass = getHass();
      if (!hass || typeof hass.callWS !== 'function') {
        console.warn(LOG_TAG, 'sync push skipped: no callWS');
        return;
      }
      const snapshot = JSON.parse(JSON.stringify(_memCfg || {}));
      hass
        .callWS({ type: 'frontend/set_user_data', key: CONFIG_KEY, value: snapshot })
        .then(() => console.log(LOG_TAG, 'sync push ok', snapshot))
        .catch((e) => console.warn(LOG_TAG, 'sync push failed:', e));
    } catch (e) {
      // offline: local copy already saved
    }
  }

  function pushToServerDirect(hass) {
    _pulled = true;
    _pendingPush = false;
    pushToServer();
  }

  function schedulePush() {
    try {
      clearTimeout(_pushTimer);
    } catch (e) {
      // ignore
    }
    _pushTimer = setTimeout(pushToServer, 400);
  }

  // Fresh installs default everything to OFF (opt-in): a user with no
  // stored toggles anywhere (this browser or the HA account) sees all
  // tweaks and menu items disabled until they toggle them on. Existing
  // users keep their current state via the defaultEnabled fallback below.
  function isFreshInstall() {
    try {
      return !_hadLocalCfg && !_hadServerCfg;
    } catch (e) {
      return false;
    }
  }

  function isTweakEnabled(tweak) {
    try {
      const cfg = loadConfig();
      if (cfg && typeof cfg[tweak.id] === 'boolean') return cfg[tweak.id];
      // Default-fresh installs start opt-in (off); existing users fall
      // through to the tweak's defaultEnabled fallback.
      try {
        if (isFreshInstall()) return false;
      } catch (e) {
        // fall through to defaultEnabled
      }
      return tweak.defaultEnabled !== false;
    } catch (e) {
      try {
        return tweak && tweak.defaultEnabled !== false;
      } catch (err) {
        return false;
      }
    }
  }

  function saveConfig(cfg) {
    _memCfg = cfg || {};
    writeLocal(_memCfg);
    schedulePush();
  }

  function setTweakEnabled(modId, on) {
    const cfg = loadConfig();
    cfg[modId] = !!on;
    saveConfig(cfg);
  }

  function isItemEnabled(modId, itemId) {
    try {
      const cfg = loadConfig();
      const key = modId + '.' + itemId;
      if (cfg && typeof cfg[key] === 'boolean') return cfg[key];
      // Default-fresh installs start opt-in (off); existing users default on.
      try {
        if (isFreshInstall()) return false;
      } catch (e) {
        // fall through to default on
      }
      return true;
    } catch (e) {
      return true;
    }
  }

  function setItemEnabled(modId, itemId, on) {
    const cfg = loadConfig();
    cfg[modId + '.' + itemId] = !!on;
    saveConfig(cfg);
  }

  /* ---------- core: HA instance ---------- */
  function getHomeAssistant() {
    return document.querySelector('home-assistant');
  }

  function getHass() {
    const ha = getHomeAssistant();
    return ha && ha.hass ? ha.hass : null;
  }

  function waitForHass(timeoutMs) {
    const timeout = timeoutMs || 60000;
    const started = Date.now();
    return new Promise((resolve, reject) => {
      function tick() {
        const hass = getHass();
        if (hass) {
          resolve(hass);
          return;
        }
        if (Date.now() - started > timeout) {
          reject(new Error('timed out waiting for home-assistant .hass'));
          return;
        }
        setTimeout(tick, 250);
      }
      tick();
    });
  }

  /* ---------- core: deep shadow DOM traversal (for future tweaks) ---------- */
  function querySelectorDeep(selector, root) {
    const start = root || document;
    const stack = [start];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node.querySelector !== 'function') continue;
      // querySelector on a ShadowRoot/Document/Element is fine; guard errors
      try {
        const found = node.querySelector(selector);
        if (found) return found;
      } catch (e) {
        // ignore invalid selector for this root
      }
      // push shadow children + light children
      let children = [];
      try {
        children = node.querySelectorAll('*');
      } catch (e) {
        children = [];
      }
      for (let i = children.length - 1; i >= 0; i--) {
        const el = children[i];
        if (el && el.shadowRoot) stack.push(el.shadowRoot);
      }
      if (node.shadowRoot) stack.push(node.shadowRoot);
    }
    return null;
  }

  function querySelectorAllDeep(selector, root) {
    const start = root || document;
    const out = [];
    const seen = new Set();
    const stack = [start];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node.querySelectorAll !== 'function') continue;
      try {
        const list = node.querySelectorAll(selector);
        for (let i = 0; i < list.length; i++) {
          if (!seen.has(list[i])) {
            seen.add(list[i]);
            out.push(list[i]);
          }
        }
      } catch (e) {
        // ignore
      }
      let children = [];
      try {
        children = node.querySelectorAll('*');
      } catch (e) {
        children = [];
      }
      for (let i = children.length - 1; i >= 0; i--) {
        const el = children[i];
        if (el && el.shadowRoot) stack.push(el.shadowRoot);
      }
      if (node.shadowRoot) stack.push(node.shadowRoot);
    }
    return out;
  }

  // Deep collapse-control lookup (Tweak 2 + Tweak 5). Upstream rows render
  // their collapse UI at varying shadow depths: inline mode keeps the
  // ha-expansion-panel under ha-card in the row's own shadow root, sidebar
  // mode uses an inner ha-automation-row (no panel at all), and nested
  // building-block editors add further shadow levels below. A shallow
  // row.shadowRoot.querySelector() misses everything past the first level,
  // so every collapse read/write goes through these helpers rooted at the
  // row. querySelectorAllDeep already pierces row.shadowRoot and every
  // shadow root below it; the row's OWN header panel / inner row sorts
  // first in document order, so index 0 is the row's own control and later
  // entries belong to nested rows.
  function deepPanelsIn(root) {
    try {
      return querySelectorAllDeep('ha-expansion-panel', root) || [];
    } catch (e) {
      return [];
    }
  }

  function deepHaRowsIn(root) {
    try {
      return querySelectorAllDeep('ha-automation-row', root) || [];
    } catch (e) {
      return [];
    }
  }

  /* ---------- core: toast ---------- */
  function toast(message) {
    try {
      window.dispatchEvent(
        new CustomEvent('hass-notification', {
          detail: { message: message },
          bubbles: true,
          composed: true,
        })
      );
    } catch (e) {
      try {
        console.log(LOG_TAG, message);
      } catch (err) {
        // last resort: ignore
      }
    }
  }

  /* ---------- core: fault-tolerant tweak registry ---------- */
  const TweakRegistry = {
    tweaks: [],
    enabled: {},
    register: function (tweak) {
      this.tweaks.push(tweak);
    },
    initAll: function () {
      const self = this;
      this.tweaks.forEach((tweak) => {
        try {
          const enabled = isTweakEnabled(tweak);
          self.enabled[tweak.id] = enabled;
          if (enabled && typeof tweak.init === 'function') tweak.init();
        } catch (e) {
          console.warn(LOG_TAG, 'init failed for', tweak.id, e);
        }
      });
    },
    onNavigate: function (path) {
      this.tweaks.forEach((tweak) => {
        if (!this.enabled[tweak.id]) return;
        try {
          if (typeof tweak.onNavigate === 'function') tweak.onNavigate(path);
        } catch (e) {
          console.warn(LOG_TAG, 'onNavigate failed for', tweak.id, e);
        }
      });
    },
    destroyAll: function () {
      this.tweaks.forEach((tweak) => {
        try {
          if (typeof tweak.destroy === 'function') tweak.destroy();
        } catch (e) {
          // ignore
        }
      });
    },
    // Settings-page toggling: applies immediately, no reload. Destroy-then-
    // init on enable keeps listener registration exactly-once.
    setEnabled: function (tweak, on) {
      this.enabled[tweak.id] = !!on;
      try {
        if (typeof tweak.destroy === 'function') tweak.destroy();
        if (on && typeof tweak.init === 'function') tweak.init();
      } catch (e) {
        console.warn(LOG_TAG, 'toggle failed for', tweak.id, e);
      }
    },
  };

  /* ---------- core: route listener (debounced) ---------- */
  let routeTimer = null;
  function handleRouteChange() {
    if (routeTimer) clearTimeout(routeTimer);
    routeTimer = setTimeout(() => {
      try {
        TweakRegistry.onNavigate(window.location.pathname);
      } catch (e) {
        // ignore
      }
    }, 100);
  }

  /* ---------- shared: editor-row detection (Tweak 1 yield + Tweak 5) ---------- */
  // Exact row tags known from the automation/script editors.
  const EDITOR_ROW_TAGS = {
    'HA-AUTOMATION-TRIGGER-ROW': 'trigger',
    'HA-AUTOMATION-CONDITION-ROW': 'condition',
    'HA-AUTOMATION-ACTION-ROW': 'action',
    'HA-SCRIPT-ACTION': 'action',
  };

  // Robust route check: tolerates trailing slash, query string, hash, and
  // absolute URLs (pathname alone never carries those, callers sometimes do).
  function isEditorPath(p) {
    let s = p === undefined || p === null ? '' : String(p);
    try {
      const proto = s.indexOf('://');
      if (proto >= 0) {
        try {
          s = new URL(s).pathname;
        } catch (e) {
          s = s.slice(proto + 3);
          const slash = s.indexOf('/');
          s = slash >= 0 ? s.slice(slash) : '/';
        }
      } else {
        const q = s.indexOf('?');
        if (q >= 0) s = s.slice(0, q);
        const h = s.indexOf('#');
        if (h >= 0) s = s.slice(0, h);
      }
    } catch (e) {
      // fall through with raw string
    }
    return (
      /^\/config\/(automation|script)\/edit(\/|$)/.test(s) ||
      /^\/config\/blueprint\/edit(\/|$)/.test(s)
    );
  }

  // Kind from a tag name. Exact known tags first, then a generic net for
  // variant/shadow tag names (e.g. HA-SCRIPT-ACTION-ROW, HA-AUTOMATION-ROW):
  // any *-ROW carrying a kind token. List containers (HA-AUTOMATION-ACTION
  // with no ROW) never match.
  function editorRowKindFor(tag) {
    const t = ((tag || '') + '').toUpperCase();
    if (!t) return null;
    if (EDITOR_ROW_TAGS[t]) return EDITOR_ROW_TAGS[t];
    if (t.indexOf('ROW') < 0) return null;
    if (t.indexOf('TRIGGER') >= 0) return 'trigger';
    if (t.indexOf('CONDITION') >= 0) return 'condition';
    if (
      t.indexOf('ACTION') >= 0 ||
      t.indexOf('SEQUENCE') >= 0 ||
      t.indexOf('STEP') >= 0
    ) {
      return 'action';
    }
    return null;
  }

  function editorRowAttrKind(el) {
    try {
      if (!el || typeof el.getAttribute !== 'function') return null;
      const tag = ((el.tagName || '') + '').toUpperCase();
      // Only trust row-ish hosts so unrelated data-kind attrs can't match.
      if (
        tag.indexOf('ROW') < 0 &&
        tag.indexOf('AUTOMATION') < 0 &&
        tag.indexOf('SCRIPT') < 0 &&
        tag.indexOf('EDITABLE') < 0
      ) {
        return null;
      }
      const raw =
        el.getAttribute('data-row-kind') ||
        el.getAttribute('data-kind') ||
        el.getAttribute('data-row');
      if (!raw) return null;
      const v = ('' + raw).toLowerCase();
      if (v.indexOf('trigger') >= 0) return 'trigger';
      if (v.indexOf('condition') >= 0) return 'condition';
      if (
        v.indexOf('action') >= 0 ||
        v.indexOf('sequence') >= 0 ||
        v.indexOf('step') >= 0
      ) {
        return 'action';
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  // Walk the event path and return the innermost trigger/condition/action
  // row element, if any. Text nodes are skipped (ancestors follow in the
  // path); inputs, dialogs, dropdowns, the code editor, and our own UI
  // never match.
  function resolveEditorRow(path) {
    if (!path || !path.length) return null;

    try {
      let target = null;
      for (let i = 0; i < path.length; i++) {
        const n = path[i];
        if (!n || typeof n !== 'object') continue;
        if (n.nodeType === 3 || n.nodeType === 8) continue;
        if (typeof n.tagName === 'string') {
          target = n;
          break;
        }
      }
      if (target) {
        const tn = ((target.tagName || '') + '').toUpperCase();
        if (
          tn === 'INPUT' ||
          tn === 'TEXTAREA' ||
          tn === 'SELECT' ||
          tn === 'OPTION'
        ) {
          return null;
        }
        if (target.isContentEditable) return null;
      }
    } catch (e) {
      // ignore
    }

    for (let i = 0; i < path.length; i++) {
      const el = path[i];
      if (!el || typeof el !== 'object') continue;
      if (el.nodeType === 3 || el.nodeType === 8) continue;
      try {
        if (el.getAttribute && typeof el.getAttribute === 'function') {
          if (el.getAttribute('data-ha-tweaks')) return null;
        }
      } catch (e) {
        // ignore
      }
      let tag = '';
      try {
        tag = ((el.tagName || '') + '').toUpperCase();
      } catch (e) {
        tag = '';
      }
      if (!tag) continue;
      if (
        tag === 'HA-DIALOG' ||
        tag === 'DIALOG' ||
        tag === 'MWC-MENU' ||
        tag === 'MWC-LIST-ITEM' ||
        tag === 'HA-DROPDOWN' ||
        tag === 'HA-DROPDOWN-ITEM' ||
        tag === 'HA-CODE-EDITOR' ||
        tag.indexOf('CODE-MIRROR') >= 0 ||
        tag.indexOf('MONACO') >= 0
      ) {
        return null;
      }
    }

    for (let j = 0; j < path.length; j++) {
      const el = path[j];
      if (!el || typeof el !== 'object') continue;
      if (el.nodeType === 3 || el.nodeType === 8) continue;
      let tag = '';
      try {
        tag = ((el.tagName || '') + '').toUpperCase();
      } catch (e) {
        tag = '';
      }
      if (tag) {
        const kind = editorRowKindFor(tag);
        if (kind) return { element: el, kind: kind };
        const attrKind = editorRowAttrKind(el);
        if (attrKind) return { element: el, kind: attrKind };
      }
      // closest() covers truncated paths (retargeted events).
      try {
        if (typeof el.closest === 'function') {
          const hit = el.closest(
            'ha-automation-trigger-row,ha-automation-condition-row,' +
              'ha-automation-action-row,ha-script-action'
          );
          if (hit && hit !== el) {
            const htag = ((hit.tagName || '') + '').toUpperCase();
            const hkind = editorRowKindFor(htag);
            if (hkind) return { element: hit, kind: hkind };
          }
        }
      } catch (e) {
        // ignore
      }
      // Fallback: rows also carry their data + index as properties.
      try {
        if (el.trigger && typeof el.trigger === 'object' && typeof el.index === 'number') {
          return { element: el, kind: 'trigger' };
        }
        if (el.condition && typeof el.condition === 'object' && typeof el.index === 'number') {
          return { element: el, kind: 'condition' };
        }
        if (el.action && typeof el.action === 'object' && typeof el.index === 'number') {
          return { element: el, kind: 'action' };
        }
      } catch (e) {
        // ignore
      }
    }
    return null;
  }

  /* ================================================================
   * Tweak 1: automation/script right-click + long-press -> Edit + Delete
   * ================================================================ */
  const AutomationContextMenuTweak = {
    id: 'automation-context-menu',
    name: 'Automation + script context menu',
    description:
      'Right-click (or long-press on touch) an automation or script entity in dashboards or configuration tables. Actions toggleable in settings (Cmd/Ctrl+Shift+M).',
    defaultEnabled: true,
    menuItems: [
      { id: 'edit', label: 'Edit' },
      // { id: 'run', label: 'Run' },
      // { id: 'toggle', label: 'Turn on/off' },
      // { id: 'traces', label: 'View traces' },
      // { id: 'copy', label: 'Copy entity ID' },
      { id: 'delete', label: 'Delete' },
    ],

    _onContextMenu: null,
    _onKeyDown: null,
    _onPointerDown: null,
    _onPointerMove: null,
    _onPointerUp: null,
    _onPointerCancel: null,
    _onScrollCapture: null,
    _lpTimer: null,
    _lpPending: null,
    _lpPointerId: null,
    _suppressContextUntil: 0,
    _menuOpenedAt: 0,
    _swallowNextTouchEnd: false,
    _onTouchEndCapture: null,
    _menuEl: null,
    _backdropEl: null,
    _dialogEl: null,
    _dialogBackdropEl: null,

    init: function () {
      const self = this;
      this._onContextMenu = function (ev) {
        try {
          self._handleContextMenu(ev);
        } catch (e) {
          console.warn(LOG_TAG, 'contextmenu handler failed', e);
        }
      };
      // capture:true so we see events inside shadow DOM before HA handles them
      window.addEventListener('contextmenu', this._onContextMenu, { capture: true });

      this._onKeyDown = function (ev) {
        try {
          if (ev && ev.key === 'Escape') self.closeAll();
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('keydown', this._onKeyDown, { capture: true });

      // Mobile long-press: pointer events only, touch primary pointer only.
      // Never preventDefault here (would break scroll); the menu opens on
      // timer fire and the synthetic contextmenu iOS fires afterwards is
      // suppressed in _handleContextMenu.
      this._onPointerDown = function (ev) {
        try {
          self._handlePointerDown(ev);
        } catch (e) {
          console.warn(LOG_TAG, 'pointerdown handler failed', e);
        }
      };
      this._onPointerMove = function (ev) {
        try {
          self._handlePointerMove(ev);
        } catch (e) {
          // ignore
        }
      };
      this._onPointerUp = function () {
        try {
          self._cancelLongPress();
        } catch (e) {
          // ignore
        }
      };
      this._onPointerCancel = function () {
        try {
          self._cancelLongPress();
        } catch (e) {
          // ignore
        }
      };
      this._onScrollCapture = function () {
        try {
          self._cancelLongPress();
        } catch (e) {
          // ignore
        }
      };
      if (typeof window.PointerEvent !== 'undefined') {
        window.addEventListener('pointerdown', this._onPointerDown, {
          capture: true,
          passive: true,
        });
        window.addEventListener('pointermove', this._onPointerMove, {
          capture: true,
          passive: true,
        });
        window.addEventListener('pointerup', this._onPointerUp, {
          capture: true,
          passive: true,
        });
        window.addEventListener('pointercancel', this._onPointerCancel, {
          capture: true,
          passive: true,
        });
        window.addEventListener('scroll', this._onScrollCapture, {
          capture: true,
          passive: true,
        });
      }
      // The lift after a long-press keeps the original row as its target
      // (touch retargeting), so HA would read it as a completed hold and
      // open the automation. Swallow exactly one release, set at fire time.
      // passive:false: preventDefault here also kills the synthetic click.
      this._onTouchEndCapture = function (ev) {
        try {
          if (self._swallowNextTouchEnd) {
            self._swallowNextTouchEnd = false;
            if (ev && ev.cancelable) ev.preventDefault();
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
          }
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('touchend', this._onTouchEndCapture, {
        capture: true,
        passive: false,
      });
      // Warm the registry cache so the first right-click already resolves.
      try {
        this._refreshRegistry(getHass());
      } catch (e) {
        // ignore
      }
    },

    destroy: function () {
      if (this._onContextMenu) {
        window.removeEventListener('contextmenu', this._onContextMenu, { capture: true });
        this._onContextMenu = null;
      }
      if (this._onKeyDown) {
        window.removeEventListener('keydown', this._onKeyDown, { capture: true });
        this._onKeyDown = null;
      }
      if (this._onPointerDown) {
        window.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
        this._onPointerDown = null;
      }
      if (this._onPointerMove) {
        window.removeEventListener('pointermove', this._onPointerMove, { capture: true });
        this._onPointerMove = null;
      }
      if (this._onPointerUp) {
        window.removeEventListener('pointerup', this._onPointerUp, { capture: true });
        this._onPointerUp = null;
      }
      if (this._onPointerCancel) {
        window.removeEventListener('pointercancel', this._onPointerCancel, {
          capture: true,
        });
        this._onPointerCancel = null;
      }
      if (this._onScrollCapture) {
        window.removeEventListener('scroll', this._onScrollCapture, { capture: true });
        this._onScrollCapture = null;
      }
      if (this._onTouchEndCapture) {
        window.removeEventListener('touchend', this._onTouchEndCapture, { capture: true });
        this._onTouchEndCapture = null;
      }
      this._cancelLongPress();
      this.closeAll();
    },

    onNavigate: function () {
      this.closeAll();
      // Registry barely changes, but a background refresh on navigation keeps
      // the cache correct for entities created since load.
      try {
        this._refreshRegistry(getHass());
      } catch (e) {
        // ignore
      }
    },

    _handleContextMenu: function (ev) {
      // Suppress the synthetic contextmenu iOS/Android fires after a
      // long-press we already handled (avoids a double menu).
      try {
        if (Date.now() < this._suppressContextUntil) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      } catch (e) {
        // fall through to normal handling
      }
      const path =
        typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
      // Editor rows belong to Tweak 5 (trigger/condition/action row menu):
      // yield so a right-click on an editor row never shows Edit/Delete here.
      try {
        if (resolveEditorRow(path)) return;
      } catch (e) {
        // fall through to normal handling
      }
      const entityId = this._resolveEntityId(path);
      if (!entityId) return; // not an automation row: let native menu through

      ev.preventDefault();
      ev.stopPropagation();

      const hass = getHass();
      if (!hass) {
        toast('HA Tweaks: still loading, try again in a second');
        return;
      }
      const stateObj = hass.states ? hass.states[entityId] : undefined;
      const configId = this._configIdFor(hass, entityId, stateObj, path);
      let friendlyName =
        (stateObj && stateObj.attributes && stateObj.attributes.friendly_name) || undefined;
      if (!friendlyName && path) {
        for (let i = 0; i < path.length; i++) {
          const el = path[i];
          if (!el) continue;
          try {
            if (el.automation && typeof el.automation.name === 'string') {
              friendlyName = el.automation.name;
              break;
            }
            if (el.script && typeof el.script.name === 'string') {
              friendlyName = el.script.name;
              break;
            }
          } catch (e) {
            // ignore
          }
        }
      }
      if (!friendlyName) friendlyName = entityId;

      this.closeAll();
      this._showMenu(ev.clientX, ev.clientY, entityId, friendlyName, configId);
      // Background refresh for next time; the open menu used the cache.
      try {
        this._refreshRegistry(hass);
      } catch (e) {
        // ignore
      }
    },

    _handlePointerDown: function (ev) {
      // Any new press clears a stale release-swallow (e.g. page hid mid-press).
      this._swallowNextTouchEnd = false;
      if (!ev || ev.pointerType !== 'touch') return;
      if (ev.isPrimary === false) return;
      // Only arm the timer on an actual automation row; anything else
      // (scrolling a view, tapping buttons) must not start a timer.
      // Editor rows belong to Tweak 5's long-press: yield.
      const path =
        typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
      try {
        if (resolveEditorRow(path)) return;
      } catch (e) {
        // fall through to normal handling
      }
      const entityId = this._resolveEntityId(path);
      if (!entityId) return;
      // A second finger down replaces any pending press.
      this._cancelLongPress();
      const x = typeof ev.clientX === 'number' ? ev.clientX : 0;
      const y = typeof ev.clientY === 'number' ? ev.clientY : 0;
      this._lpPointerId = ev.pointerId !== undefined ? ev.pointerId : null;
      this._lpPending = { entityId: entityId, x: x, y: y, path: path };
      const self = this;
      this._lpTimer = setTimeout(function () {
        try {
          self._fireLongPress();
        } catch (e) {
          console.warn(LOG_TAG, 'long-press fire failed', e);
        }
      }, LONG_PRESS_MS);
    },

    _handlePointerMove: function (ev) {
      if (!this._lpTimer || !this._lpPending) return;
      if (ev && this._lpPointerId !== null && ev.pointerId !== this._lpPointerId) return;
      const dx = (ev.clientX || 0) - this._lpPending.x;
      const dy = (ev.clientY || 0) - this._lpPending.y;
      const tol = LONG_PRESS_MOVE_TOLERANCE_PX;
      if (dx * dx + dy * dy > tol * tol) this._cancelLongPress();
    },

    _fireLongPress: function () {
      const pending = this._lpPending;
      this._lpTimer = null;
      this._lpPending = null;
      this._lpPointerId = null;
      if (!pending) return;
      const hass = getHass();
      if (!hass) {
        toast('HA Tweaks: still loading, try again in a second');
        return;
      }
      const stateObj = hass.states ? hass.states[pending.entityId] : undefined;
      const configId = this._configIdFor(hass, pending.entityId, stateObj, pending.path);
      let friendlyName =
        (stateObj && stateObj.attributes && stateObj.attributes.friendly_name) || undefined;
      if (!friendlyName && pending.path) {
        for (let i = 0; i < pending.path.length; i++) {
          const el = pending.path[i];
          if (!el) continue;
          try {
            if (el.automation && typeof el.automation.name === 'string') {
              friendlyName = el.automation.name;
              break;
            }
            if (el.script && typeof el.script.name === 'string') {
              friendlyName = el.script.name;
              break;
            }
          } catch (e) {
            // ignore
          }
        }
      }
      if (!friendlyName) friendlyName = pending.entityId;
      // Arm suppression BEFORE showing the menu: iOS fires its synthetic
      // contextmenu after this timer fires (finger still down).
      this._suppressContextUntil = Date.now() + LONG_PRESS_SUPPRESS_MS;
      // The coming release targets the original row, not our menu: swallow it
      // so HA does not read the lift as a completed hold (opens automation).
      this._swallowNextTouchEnd = true;
      this.closeAll();
      this._showMenu(pending.x, pending.y, pending.entityId, friendlyName, configId);
      // Background refresh for next time; the open menu used the cache.
      try {
        this._refreshRegistry(hass);
      } catch (e) {
        // ignore
      }
    },

    _cancelLongPress: function () {
      if (this._lpTimer) {
        clearTimeout(this._lpTimer);
        this._lpTimer = null;
      }
      this._lpPending = null;
      this._lpPointerId = null;
    },


    _isItemEnabled: function (itemId) {
      return isItemEnabled(this.id, itemId);
    },

    _domainFor: function (entityId) {
      const dot = (entityId || '').indexOf('.');
      return dot > 0 ? entityId.slice(0, dot) : 'automation';
    },

    // HA resolves editable configs the same way its own pickers do:
    // attributes.id first, then the entity registry unique_id. Anything with
    // neither (YAML without a UI id) is genuinely not editable from the UI.
    // Note: hass.entities only carries DISPLAY entries (no unique_id), so the
    // registry is fetched over the websocket like the pickers do and cached.
    _entityRegCache: null,
    _entityRegPromise: null,

    _configIdFor: function (hass, entityId, stateObj, path) {
      try {
        if (stateObj && stateObj.attributes && stateObj.attributes.id) {
          return stateObj.attributes.id;
        }
      } catch (e) {
        // ignore
      }
      try {
        if (this._entityRegCache && this._entityRegCache[entityId]) {
          return this._entityRegCache[entityId];
        }
      } catch (e) {
        // ignore
      }
      if (path && path.length) {
        for (let i = 0; i < path.length; i++) {
          const el = path[i];
          if (!el || typeof el !== 'object') continue;
          try {
            if (el.automation && el.automation.attributes && el.automation.attributes.id) {
              return el.automation.attributes.id;
            }
          } catch (e) {
            // ignore
          }
          try {
            if (Array.isArray(el._entityReg)) {
              for (let k = 0; k < el._entityReg.length; k++) {
                const reg = el._entityReg[k];
                if (reg && reg.entity_id === entityId && reg.unique_id) {
                  if (this._entityRegCache) {
                    this._entityRegCache[entityId] = reg.unique_id;
                  }
                  return reg.unique_id;
                }
              }
            }
          } catch (e) {
            // ignore
          }
        }
      }
      return undefined;
    },

    _refreshRegistry: function (hass) {
      if (this._entityRegPromise) return this._entityRegPromise;
      const self = this;
      try {
        if (!hass || typeof hass.callWS !== 'function') {
          return Promise.resolve({});
        }
        this._entityRegPromise = Promise.resolve()
          .then(function () {
            return hass.callWS({ type: 'config/entity_registry/list' });
          })
          .then(function (entries) {
            const map = {};
            try {
              (entries || []).forEach(function (e) {
                if (e && e.entity_id && e.unique_id) map[e.entity_id] = e.unique_id;
              });
            } catch (err) {
              // ignore malformed entries
            }
            self._entityRegCache = map;
            self._entityRegPromise = null;
            return map;
          })
          .catch(function (err) {
            self._entityRegPromise = null;
            console.warn(LOG_TAG, 'entity registry fetch failed', err);
            return {};
          });
        return this._entityRegPromise;
      } catch (e) {
        return Promise.resolve({});
      }
    },

    _makeSeparator: function () {
      // Inset separator: 90% width, centered, never touches the edges.
      const sep = document.createElement('div');
      sep.setAttribute('data-ha-tweaks', 'menu-separator');
      sep.style.cssText =
        'height:1px;width:90%;margin:4px auto;padding:0;border:0;background:var(--divider-color,#e0e0e0);';
      return sep;
    },

    _copyText: function (text) {
      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === 'function'
        ) {
          navigator.clipboard.writeText(text).catch(function () {
            // toast already shown; ignore async failure
          });
          return true;
        }
      } catch (e) {
        // fall through to legacy path
      }
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        if (typeof ta.select === 'function') {
          ta.select();
        } else if (typeof ta.setSelectionRange === 'function') {
          ta.setSelectionRange(0, String(text).length);
        }
        const ok =
          typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
        if (ta.parentNode) ta.parentNode.removeChild(ta);
        return !!ok;
      } catch (e) {
        return false;
      }
    },

    _resolveEntityId: function (path) {
      if (!path || !path.length) return null;

      // Do not trigger inside text inputs or contenteditable
      try {
        const target = path[0];
        if (target) {
          const tn = ((target.tagName || '') + '').toUpperCase();
          if (tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT' || tn === 'OPTION') {
            return null;
          }
          if (target.isContentEditable) return null;
        }
      } catch (e) {
        // ignore
      }

      // Check if inside an open dialog or dropdown menu - don't intercept context menu inside them
      for (let i = 0; i < path.length; i++) {
        const el = path[i];
        if (!el || typeof el !== 'object') continue;
        try {
          if (el.getAttribute && typeof el.getAttribute === 'function') {
            if (el.getAttribute('data-ha-tweaks')) return null;
          }
        } catch (e) {
          // ignore
        }
        let tag = '';
        try {
          tag = ((el.tagName || '') + '').toUpperCase();
        } catch (e) {
          tag = '';
        }
        if (
          tag === 'HA-DROPDOWN' ||
          tag === 'HA-DROPDOWN-ITEM' ||
          tag === 'MWC-MENU' ||
          tag === 'MWC-LIST-ITEM' ||
          tag === 'HA-DIALOG' ||
          tag === 'DIALOG' ||
          tag === 'HA-MORE-INFO' ||
          tag === 'MORE-INFO-CONTENT'
        ) {
          return null;
        }
      }

      for (let i = 0; i < path.length; i++) {
        const el = path[i];
        if (!el || typeof el !== 'object') continue;
        const candidates = [];

        // 1. ha-data-table rowId property (automations & scripts tables use id="entity_id")
        try {
          if (typeof el.rowId === 'string') candidates.push(el.rowId);
        } catch (e) {
          // ignore
        }

        // 2. Automation / script object properties (e.g. on <ha-switch>, <ha-icon-button>, table row)
        try {
          if (el.automation) {
            if (typeof el.automation === 'string') {
              candidates.push(el.automation);
            } else if (typeof el.automation.entity_id === 'string') {
              candidates.push(el.automation.entity_id);
            }
          }
          if (el.script) {
            if (typeof el.script === 'string') {
              candidates.push(el.script);
            } else if (typeof el.script.entity_id === 'string') {
              candidates.push(el.script.entity_id);
            }
          }
          if (el.item && typeof el.item === 'object' && typeof el.item.entity_id === 'string') {
            candidates.push(el.item.entity_id);
          }
          if (el.data && typeof el.data === 'object' && typeof el.data.entity_id === 'string') {
            candidates.push(el.data.entity_id);
          }
          if (el.row && typeof el.row === 'object' && typeof el.row.entity_id === 'string') {
            candidates.push(el.row.entity_id);
          }
          if (el.entry && typeof el.entry === 'object' && typeof el.entry.entity_id === 'string') {
            candidates.push(el.entry.entity_id);
          }
        } catch (e) {
          // ignore
        }

        // 3. Lovelace card / row configuration
        try {
          if (el._config && typeof el._config.entity === 'string') {
            candidates.push(el._config.entity);
          }
          if (el._config && typeof el._config.entity_id === 'string') {
            candidates.push(el._config.entity_id);
          }
          if (el.config && typeof el.config.entity === 'string') {
            candidates.push(el.config.entity);
          }
          if (el.config && typeof el.config.entity_id === 'string') {
            candidates.push(el.config.entity_id);
          }
        } catch (e) {
          // ignore
        }

        // 4. Element entity properties or stateObj
        try {
          if (typeof el.entity === 'string') candidates.push(el.entity);
          if (typeof el.entityId === 'string') candidates.push(el.entityId);
          if (el.stateObj && typeof el.stateObj.entity_id === 'string') {
            candidates.push(el.stateObj.entity_id);
          }
        } catch (e) {
          // ignore
        }

        // 5. DOM attributes
        try {
          if (el.getAttribute && typeof el.getAttribute === 'function') {
            const attr =
              el.getAttribute('data-entity-id') ||
              el.getAttribute('data-row-id') ||
              el.getAttribute('row-id') ||
              el.getAttribute('data-entity');
            if (typeof attr === 'string' && attr) candidates.push(attr);
          }
        } catch (e) {
          // ignore
        }

        for (let j = 0; j < candidates.length; j++) {
          const id = candidates[j];
          if (
            typeof id === 'string' &&
            (id.indexOf('automation.') === 0 || id.indexOf('script.') === 0)
          )
            return id;
        }
      }
      return null;
    },

    _showMenu: function (x, y, entityId, friendlyName, configId) {
      const self = this;
      this._menuOpenedAt = Date.now();

      // backdrop
      const backdrop = document.createElement('div');
      backdrop.setAttribute('data-ha-tweaks', 'menu-backdrop');
      backdrop.style.cssText =
        'position:fixed;inset:0;z-index:999998;background:transparent;margin:0;padding:0;border:0;';
      backdrop.addEventListener('click', function () {
        // The finger lifting right after a long-press lands on the backdrop.
        // That click is the end of the press, not a dismissal: ignore it or
        // the menu would close the instant it opens on touch.
        try {
          if (Date.now() - self._menuOpenedAt < LIFT_CLICK_IGNORE_MS) return;
        } catch (e) {
          // fall through to close
        }
        self.closeAll();
      });
      backdrop.addEventListener(
        'contextmenu',
        function (e) {
          e.preventDefault();
          self.closeAll();
        },
        { capture: true }
      );
      document.body.appendChild(backdrop);
      this._backdropEl = backdrop;

      // menu
      const menu = document.createElement('div');
      menu.setAttribute('data-ha-tweaks', 'automation-menu');
      menu.setAttribute('role', 'group');
      menu.style.cssText = [
        'position:fixed',
        'z-index:999999',
        'min-width:230px',
        'max-width:300px',
        'padding:4px 0',
        'margin:0',
        'background:var(--card-background-color,#ffffff)',
        'color:var(--primary-text-color,#212121)',
        'border:1px solid var(--divider-color,#e0e0e0)',
        'border-radius:var(--ha-card-border-radius,8px)',
        'box-shadow:0 8px 28px rgba(0,0,0,0.28)',
        'font-family:inherit',
        'font-size:14px',
        'line-height:1.4',
        'overflow:hidden',
      ].join(';');

      // Menu items: icon + label rows using HA's own ha-icon element
      const canAct = !!configId;
      const domain = self._domainFor(entityId);
      const isAutomation = domain === 'automation';
      const liveHass = getHass();
      const liveState =
        liveHass && liveHass.states && liveHass.states[entityId]
          ? liveHass.states[entityId].state
          : undefined;
      const isOn = liveState !== 'off';
      const built = [];
      function navInPlace(path) {
        try {
          history.pushState(null, '', path);
          window.dispatchEvent(
            new CustomEvent('location-changed', { bubbles: true, composed: true })
          );
        } catch (e) {
          window.location.assign(path);
        }
      }
      function makeItem(iconName, label, color, enabled) {
        const btn = document.createElement('button');
        // Pointer-only menu: not reachable from the keyboard tab order.
        btn.setAttribute('tabindex', '-1');
        btn.type = 'button';
        btn.disabled = !enabled;
        btn.title = label;
        btn.style.cssText = [
          'display:flex',
          'align-items:center',
          'gap:12px',
          'width:100%',
          'text-align:left',
          'padding:10px 16px',
          'margin:0',
          'border:0',
          'background:transparent',
          'color:' + (enabled ? color : 'var(--disabled-text-color,#9e9e9e)'),
          'font-size:14px',
          'font-family:inherit',
          'cursor:' + (enabled ? 'pointer' : 'default'),
          'opacity:' + (enabled ? '1' : '0.6'),
        ].join(';');
        const icon = document.createElement('ha-icon');
        icon.setAttribute('icon', iconName);
        icon.style.cssText = 'flex:0 0 auto;color:inherit;--mdc-icon-size:20px;';
        const span = document.createElement('span');
        span.textContent = label;
        span.style.cssText =
          'flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        btn.appendChild(icon);
        btn.appendChild(span);
        if (enabled) {
          btn.addEventListener('mouseenter', function () {
            btn.style.background = 'var(--secondary-background-color,#eeeeee)';
          });
          btn.addEventListener('mouseleave', function () {
            btn.style.background = 'transparent';
          });
        }
        return btn;
      }

      // Edit item: in-place navigation, no full page reload
      const editBtn = makeItem(
        'mdi:pencil',
        canAct ? 'Edit' : 'Edit (No UI ID)',
        'var(--primary-text-color,#212121)',
        canAct
      );
      if (!canAct) {
        editBtn.title = 'This entry has no UI id, cannot edit from the UI';
      } else {
        editBtn.addEventListener('click', function () {
          self.closeAll();
          try {
            history.pushState(null, '', '/config/' + self._domainFor(entityId) + '/edit/' + configId);
            window.dispatchEvent(
              new CustomEvent('location-changed', { bubbles: true, composed: true })
            );
          } catch (e) {
            window.location.assign('/config/' + self._domainFor(entityId) + '/edit/' + configId);
          }
        });
      }
      built.push({ id: 'edit', el: editBtn });

      // TEMP-DISABLED run – uncomment to restore
      // Run: needs only the entity_id, so YAML entries can run too.
      // const runBtn = makeItem(
      //   'mdi:play',
      //   isAutomation ? 'Run actions' : 'Run',
      //   'var(--primary-text-color,#212121)',
      //   true
      // );
      // runBtn.addEventListener('click', function () {
      //   self.closeAll();
      //   const h = getHass();
      //   if (!h) {
      //     toast('HA Tweaks: lost connection to Home Assistant');
      //     return;
      //   }
      //   try {
      //     if (isAutomation) {
      //       h.callService('automation', 'trigger', { entity_id: entityId });
      //     } else {
      //       h.callService('script', 'turn_on', { entity_id: entityId });
      //     }
      //     toast((isAutomation ? 'Triggered ' : 'Started ') + friendlyName);
      //   } catch (e) {
      //     toast('Run failed: ' + ((e && e.message) || e || 'unknown error'));
      //   }
      // });
      // built.push({ id: 'run', el: runBtn });

      // TEMP-DISABLED toggle – uncomment to restore
      // Enable/disable: automations only. Scripts have no disabled state,
      // and toggling needs only the entity_id so YAML automations qualify.
      // const canToggle = isAutomation;
      // const toggleBtn = makeItem(
      //   isOn ? 'mdi:toggle-switch' : 'mdi:toggle-switch-off',
      //   canToggle ? (isOn ? 'Turn off' : 'Turn on') : 'Turn on/off (scripts stay on)',
      //   'var(--primary-text-color,#212121)',
      //   canToggle
      // );
      // if (!canToggle) {
      //   toggleBtn.title = 'Scripts cannot be disabled, so there is nothing to toggle';
      // } else {
      //   toggleBtn.addEventListener('click', function () {
      //     self.closeAll();
      //     const h = getHass();
      //     if (!h) {
      //       toast('HA Tweaks: lost connection to Home Assistant');
      //       return;
      //     }
      //     try {
      //       h.callService('automation', 'toggle', { entity_id: entityId });
      //       toast((isOn ? 'Turned off ' : 'Turned on ') + friendlyName);
      //     } catch (e) {
      //       toast('Toggle failed: ' + ((e && e.message) || e || 'unknown error'));
      //     }
      //   });
      // }
      // built.push({ id: 'toggle', el: toggleBtn });

      // TEMP-DISABLED traces – uncomment to restore
      // Traces: same in-place navigation as Edit, per domain.
      // const traceBtn = makeItem(
      //   'mdi:history',
      //   canAct ? 'View traces' : 'View traces (No UI ID)',
      //   'var(--primary-text-color,#212121)',
      //   canAct
      // );
      // if (!canAct) {
      //   traceBtn.title = 'This entry has no UI id, cannot open traces from the UI';
      // } else {
      //   traceBtn.addEventListener('click', function () {
      //     self.closeAll();
      //     navInPlace('/config/' + domain + '/trace/' + configId);
      //   });
      // }
      // built.push({ id: 'traces', el: traceBtn });

      // TEMP-DISABLED copy – uncomment to restore
      // Copy: needs only the entity_id, always available.
      // const copyBtn = makeItem(
      //   'mdi:content-copy',
      //   'Copy entity ID',
      //   'var(--primary-text-color,#212121)',
      //   true
      // );
      // copyBtn.addEventListener('click', function () {
      //   self.closeAll();
      //   if (self._copyText(entityId)) {
      //     toast('Copied ' + entityId);
      //   } else {
      //     toast('Copy failed for ' + entityId);
      //   }
      // });
      // built.push({ id: 'copy', el: copyBtn });

      // Delete item
      const delBtn = makeItem(
        'mdi:delete',
        canAct ? 'Delete' : 'Delete (No UI ID)',
        'var(--error-color,#db4437)',
        canAct
      );
      if (!canAct) {
        delBtn.title = 'This entry has no UI id, cannot delete from the UI';
      } else {
        delBtn.addEventListener('click', function () {
          self._showDeleteConfirm(entityId, friendlyName, configId);
        });
      }
      built.push({ id: 'delete', el: delBtn });

      // Only enabled items reach the menu, separators between them.
      const visible = built.filter(function (it) {
        return self._isItemEnabled(it.id);
      });
      if (!visible.length) {
        self.closeAll();
        toast('All menu items are off. Press Cmd/Ctrl+Shift+M to choose what shows.');
        return;
      }
      visible.forEach(function (it, i) {
        menu.appendChild(it.el);
        if (i < visible.length - 1) menu.appendChild(self._makeSeparator());
      });

      document.body.appendChild(menu);
      this._menuEl = menu;

      // viewport edge collision
      try {
        menu.style.left = '0px';
        menu.style.top = '0px';
        const rect = menu.getBoundingClientRect();
        let left = x;
        let top = y;
        const margin = 8;
        if (left + rect.width > window.innerWidth - margin) {
          left = window.innerWidth - rect.width - margin;
        }
        if (top + rect.height > window.innerHeight - margin) {
          top = window.innerHeight - rect.height - margin;
        }
        if (left < margin) left = margin;
        if (top < margin) top = margin;
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
      } catch (e) {
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
      }
    },

    _showDeleteConfirm: function (entityId, friendlyName, configId) {
      const self = this;
      // remove menu but keep flow: close menu, open dialog
      this._removeMenuOnly();

      const backdrop = document.createElement('div');
      backdrop.setAttribute('data-ha-tweaks', 'dialog-backdrop');
      backdrop.style.cssText =
        'position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,0.45);margin:0;padding:0;border:0;';
      backdrop.addEventListener('click', function () {
        self.closeAll();
      });
      document.body.appendChild(backdrop);
      this._dialogBackdropEl = backdrop;

      const dialog = document.createElement('div');
      dialog.setAttribute('data-ha-tweaks', 'delete-dialog');
      dialog.setAttribute('role', 'alertdialog');
      dialog.style.cssText = [
        'position:fixed',
        'z-index:999999',
        'left:50%',
        'top:50%',
        'transform:translate(-50%,-50%)',
        'width:min(360px,calc(100vw - 32px))',
        'padding:0',
        'margin:0',
        'background:var(--card-background-color,#ffffff)',
        'color:var(--primary-text-color,#212121)',
        'border:1px solid var(--divider-color,#e0e0e0)',
        'border-radius:var(--ha-card-border-radius,8px)',
        'box-shadow:0 8px 28px rgba(0,0,0,0.28)',
        'font-family:inherit',
        'overflow:hidden',
      ].join(';');

      const body = document.createElement('div');
      body.style.cssText = 'padding:20px 20px 16px 20px;';
      const h = document.createElement('div');
      h.textContent = 'Delete "' + friendlyName + '"?';
      h.style.cssText = 'font-weight:600;font-size:16px;margin-bottom:8px;';
      const p = document.createElement('div');
      p.textContent = 'This cannot be undone.';
      p.style.cssText = 'font-size:14px;color:var(--secondary-text-color,#727272);';
      body.appendChild(h);
      body.appendChild(p);
      dialog.appendChild(body);

      const actions = document.createElement('div');
      actions.style.cssText =
        'display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--divider-color,#e0e0e0);';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText =
        'padding:8px 16px;border:1px solid var(--divider-color,#e0e0e0);border-radius:6px;background:transparent;color:var(--primary-text-color,#212121);font-size:14px;font-family:inherit;cursor:pointer;';
      cancelBtn.addEventListener('click', function () {
        self.closeAll();
      });

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.textContent = 'Delete';
      confirmBtn.style.cssText =
        'padding:8px 16px;border:0;border-radius:6px;background:var(--error-color,#db4437);color:#fff;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;';
      confirmBtn.addEventListener('click', function () {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting…';
        self._doDelete(entityId, friendlyName, configId);
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      dialog.appendChild(actions);

      document.body.appendChild(dialog);
      this._dialogEl = dialog;
      try {
        cancelBtn.focus();
      } catch (e) {
        // ignore
      }
    },

    _doDelete: function (entityId, friendlyName, configId) {
      const self = this;
      const domain = this._domainFor(entityId);
      const hass = getHass();
      if (!hass) {
        toast('HA Tweaks: lost connection to Home Assistant');
        self.closeAll();
        return;
      }
      Promise.resolve()
        .then(function () {
          return hass.callApi('DELETE', 'config/' + domain + '/config/' + configId);
        })
        .then(function () {
          self.closeAll();
          toast('Deleted ' + friendlyName);
        })
        .catch(function (err) {
          self.closeAll();
          const msg = (err && err.message) || err || 'unknown error';
          toast('Delete failed: ' + msg);
          console.warn(LOG_TAG, 'delete failed for', entityId, err);
        });
    },

    _removeMenuOnly: function () {
      if (this._menuEl && this._menuEl.parentNode) {
        this._menuEl.parentNode.removeChild(this._menuEl);
      }
      this._menuEl = null;
      if (this._backdropEl && this._backdropEl.parentNode) {
        this._backdropEl.parentNode.removeChild(this._backdropEl);
      }
      this._backdropEl = null;
    },

    closeAll: function () {
      this._removeMenuOnly();
      if (this._dialogEl && this._dialogEl.parentNode) {
        this._dialogEl.parentNode.removeChild(this._dialogEl);
      }
      this._dialogEl = null;
      if (this._dialogBackdropEl && this._dialogBackdropEl.parentNode) {
        this._dialogBackdropEl.parentNode.removeChild(this._dialogBackdropEl);
      }
      this._dialogBackdropEl = null;
    },
  };

  /* ================================================================
   * Tweak 5: Inside-editor row right-click / long-press -> row actions
   * - Only on /config/automation/edit/* and /config/script/edit/*.
   * - Right-click (or touch long-press) a trigger, condition, or action
   *   row: Duplicate, Copy, Cut, YAML toggle, Disable/Enable, Run
   *   (actions only), Delete.
   * - Prefers the row element's own methods when present (see
   *   EDITOR_ROW_NATIVE_METHODS); otherwise edits the saved config via
   *   the same REST config API the table delete uses (GET then POST
   *   config/<domain>/config/<id>), with a best-effort in-memory sync
   *   of the open manual editor so the UI updates immediately.
   * - Config fallback is top-level-rows only; nested rows (inside
   *   Choose/If/etc.) without a native method get a toast pointing at
   *   the row's own overflow menu.
   * ================================================================ */
  const EDITOR_ROW_NATIVE_METHODS = {
    duplicate: [
      '_duplicateAction',
      '_duplicateTrigger',
      '_duplicateCondition',
      'duplicate',
      '_duplicate',
      'duplicateRow',
      '_duplicateRow',
      'onDuplicate',
      '_onDuplicate',
    ],
    copy: [
      '_copyAction',
      '_copyTrigger',
      '_copyCondition',
      'copyRow',
      '_copyRow',
      'onCopy',
      '_onCopy',
      '_copy',
      'handleCopy',
    ],
    cut: [
      '_cutAction',
      '_cutTrigger',
      '_cutCondition',
      'cutRow',
      '_cutRow',
      'onCut',
      '_onCut',
      '_cut',
      'handleCut',
    ],
    paste: [
      '_pasteAction',
      '_pasteTrigger',
      '_pasteCondition',
      'paste',
      '_paste',
      'pasteRow',
      '_pasteRow',
      'onPaste',
      '_onPaste',
      'handlePaste',
    ],
    delete: [
      '_onDelete',
      'deleteRow',
      '_deleteRow',
      'removeRow',
      '_removeRow',
      'onDelete',
      '_delete',
      'handleDelete',
    ],
    yaml: [
      '_toggleYamlMode',
      'toggleYaml',
      '_toggleYaml',
      'toggleYamlMode',
      'switchYamlMode',
      '_switchYamlMode',
      'toggleMode',
    ],
    enabled: [
      '_onDisable',
      'toggleEnabled',
      '_toggleEnabled',
      'toggleDisable',
      '_toggleDisable',
      'onDisable',
      'setEnabled',
    ],
    run: [
      '_runAction',
      'runAction',
      'runSingle',
      '_run',
      'run',
      'onRun',
      '_onRun',
      'execute',
      'executeAction',
    ],
  };

  const EditorRowContextMenuTweak = {
    id: 'editor-row-context-menu',
    name: 'Editor row context menu',
    description:
      'Right-click (or long-press on touch) a trigger, condition, or action row inside the automation/script editor for Duplicate, Copy, Cut, YAML toggle, Disable, Run, and Delete.',
    defaultEnabled: true,
    menuItems: [
      { id: 'duplicate', label: 'Duplicate' },
      { id: 'copy', label: 'Copy' },
      { id: 'paste', label: 'Paste' },
      { id: 'cut', label: 'Cut' },
      { id: 'yaml', label: 'YAML toggle' },
      { id: 'enabled', label: 'Enable toggle' },
      { id: 'run', label: 'Run action' },
      { id: 'delete', label: 'Delete' },
    ],

    _onContextMenu: null,
    _onKeyDown: null,
    _onPointerDown: null,
    _onPointerMove: null,
    _onPointerUp: null,
    _onPointerCancel: null,
    _onScrollCapture: null,
    _onTouchEndCapture: null,
    _onPasteCapture: null,
    _lpTimer: null,
    _lpPending: null,
    _lpPointerId: null,
    _suppressContextUntil: 0,
    _menuOpenedAt: 0,
    _swallowNextTouchEnd: false,
    _menuEl: null,
    _backdropEl: null,
    _clipboard: null,
    _copiedCollapseState: null,

    init: function () {
      const self = this;
      this._onContextMenu = function (ev) {
        try {
          self._handleContextMenu(ev);
        } catch (e) {
          console.warn(LOG_TAG, 'editor row contextmenu handler failed', e);
        }
      };
      // capture:true so we see events inside shadow DOM before HA handles them
      window.addEventListener('contextmenu', this._onContextMenu, { capture: true });

      this._onKeyDown = function (ev) {
        try {
          if (ev && ev.key === 'Escape') self.closeAll();
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('keydown', this._onKeyDown, { capture: true });

      // Mobile long-press: same pattern as Tweak 1. Never preventDefault here
      // (would break scroll); the menu opens on timer fire and the synthetic
      // contextmenu iOS fires afterwards is suppressed in _handleContextMenu.
      this._onPointerDown = function (ev) {
        try {
          self._handlePointerDown(ev);
        } catch (e) {
          console.warn(LOG_TAG, 'editor row pointerdown handler failed', e);
        }
      };
      this._onPointerMove = function (ev) {
        try {
          self._handlePointerMove(ev);
        } catch (e) {
          // ignore
        }
      };
      this._onPointerUp = function () {
        try {
          self._cancelLongPress();
        } catch (e) {
          // ignore
        }
      };
      this._onPointerCancel = function () {
        try {
          self._cancelLongPress();
        } catch (e) {
          // ignore
        }
      };
      this._onScrollCapture = function () {
        try {
          self._cancelLongPress();
        } catch (e) {
          // ignore
        }
      };
      if (typeof window.PointerEvent !== 'undefined') {
        window.addEventListener('pointerdown', this._onPointerDown, {
          capture: true,
          passive: true,
        });
        window.addEventListener('pointermove', this._onPointerMove, {
          capture: true,
          passive: true,
        });
        window.addEventListener('pointerup', this._onPointerUp, {
          capture: true,
          passive: true,
        });
        window.addEventListener('pointercancel', this._onPointerCancel, {
          capture: true,
          passive: true,
        });
        window.addEventListener('scroll', this._onScrollCapture, {
          capture: true,
          passive: true,
        });
      }
      // Swallow exactly one release after a long-press fires, same as Tweak 1.
      // passive:false so preventDefault also kills the synthetic click.
      this._onTouchEndCapture = function (ev) {
        try {
          if (self._swallowNextTouchEnd) {
            self._swallowNextTouchEnd = false;
            if (ev && ev.cancelable) ev.preventDefault();
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
          }
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('touchend', this._onTouchEndCapture, {
        capture: true,
        passive: false,
      });

      this._onPasteCapture = function (ev) {
        try {
          if (!self._isEditorRoute(window.location.pathname)) return;
          const path =
            typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
          const info = self._resolveRow(path);
          if (!info) return;
          const s = self._snapshotCollapseStates();
          const targetIdx = self._rowSnapshotIndex(info.element, s);
          const colState =
            typeof self._copiedCollapseState === 'boolean'
              ? self._copiedCollapseState
              : null;
          self._scheduleCollapseRestore(s.states, 'paste', targetIdx, colState, s);
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('paste', this._onPasteCapture, { capture: true });
    },

    destroy: function () {
      if (this._onContextMenu) {
        window.removeEventListener('contextmenu', this._onContextMenu, { capture: true });
        this._onContextMenu = null;
      }
      if (this._onKeyDown) {
        window.removeEventListener('keydown', this._onKeyDown, { capture: true });
        this._onKeyDown = null;
      }
      if (this._onPointerDown) {
        window.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
        this._onPointerDown = null;
      }
      if (this._onPointerMove) {
        window.removeEventListener('pointermove', this._onPointerMove, { capture: true });
        this._onPointerMove = null;
      }
      if (this._onPointerUp) {
        window.removeEventListener('pointerup', this._onPointerUp, { capture: true });
        this._onPointerUp = null;
      }
      if (this._onPointerCancel) {
        window.removeEventListener('pointercancel', this._onPointerCancel, {
          capture: true,
        });
        this._onPointerCancel = null;
      }
      if (this._onScrollCapture) {
        window.removeEventListener('scroll', this._onScrollCapture, { capture: true });
        this._onScrollCapture = null;
      }
      if (this._onTouchEndCapture) {
        window.removeEventListener('touchend', this._onTouchEndCapture, { capture: true });
        this._onTouchEndCapture = null;
      }
      if (this._onPasteCapture) {
        window.removeEventListener('paste', this._onPasteCapture, { capture: true });
        this._onPasteCapture = null;
      }
      this._cancelLongPress();
      this.closeAll();
    },

    onNavigate: function () {
      this._cancelLongPress();
      this.closeAll();
    },

    _isEditorRoute: function (path) {
      return isEditorPath(path);
    },

    _editorDomain: function () {
      const m = (window.location.pathname || '').match(
        /^\/config\/(automation|script)\/edit(\/|$)/
      );
      return m ? m[1] : null;
    },

    _editorId: function () {
      const m = (window.location.pathname || '').match(
        /^\/config\/(?:automation|script)\/edit\/([^/?#]+)/
      );
      if (!m) return null;
      try {
        return decodeURIComponent(m[1]);
      } catch (e) {
        return m[1];
      }
    },

    _handleContextMenu: function (ev) {
      if (!ev) return;
      // No defaultPrevented bail-out here: Tweak 1 may have consumed this same
      // event first (entity inside the row). When a row resolves, the row
      // menu wins and Tweak 1's menu is closed below.
      if (!this._isEditorRoute(window.location.pathname)) return;
      // Suppress the synthetic contextmenu iOS/Android fires after a
      // long-press we already handled (avoids a double menu).
      try {
        if (Date.now() < this._suppressContextUntil) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      } catch (e) {
        // fall through to normal handling
      }
      const path =
        typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
      const info = this._resolveRow(path);
      if (!info) return; // not a trigger/condition/action row: native menu

      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') {
        try {
          ev.stopImmediatePropagation();
        } catch (e) {
          // ignore
        }
      }
      // Tweak 1 (Edit/Delete) may have run first on this same event when the
      // row references an entity: its menu loses, the row menu wins.
      try {
        if (AutomationContextMenuTweak) AutomationContextMenuTweak.closeAll();
      } catch (e) {
        // ignore
      }
      this.closeAll();
      this._showMenu(ev.clientX, ev.clientY, info);
    },

    _handlePointerDown: function (ev) {
      // Any new press clears a stale release-swallow.
      this._swallowNextTouchEnd = false;
      if (!ev || ev.pointerType !== 'touch') return;
      if (ev.isPrimary === false) return;
      if (!this._isEditorRoute(window.location.pathname)) return;
      // Only arm the timer on an actual editor row; anything else
      // (scrolling, tapping buttons) must not start a timer.
      const path =
        typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
      const info = this._resolveRow(path);
      if (!info) return;
      // A second finger down replaces any pending press.
      this._cancelLongPress();
      const x = typeof ev.clientX === 'number' ? ev.clientX : 0;
      const y = typeof ev.clientY === 'number' ? ev.clientY : 0;
      this._lpPointerId = ev.pointerId !== undefined ? ev.pointerId : null;
      this._lpPending = { x: x, y: y, info: info };
      const self = this;
      this._lpTimer = setTimeout(function () {
        try {
          self._fireLongPress();
        } catch (e) {
          console.warn(LOG_TAG, 'editor row long-press fire failed', e);
        }
      }, LONG_PRESS_MS);
    },

    _handlePointerMove: function (ev) {
      if (!this._lpTimer || !this._lpPending) return;
      if (ev && this._lpPointerId !== null && ev.pointerId !== this._lpPointerId) return;
      const dx = (ev.clientX || 0) - this._lpPending.x;
      const dy = (ev.clientY || 0) - this._lpPending.y;
      const tol = LONG_PRESS_MOVE_TOLERANCE_PX;
      if (dx * dx + dy * dy > tol * tol) this._cancelLongPress();
    },

    _fireLongPress: function () {
      const pending = this._lpPending;
      this._lpTimer = null;
      this._lpPending = null;
      this._lpPointerId = null;
      if (!pending || !pending.info) return;
      if (!this._isEditorRoute(window.location.pathname)) return;
      // Arm suppression BEFORE showing the menu: iOS fires its synthetic
      // contextmenu after this timer fires (finger still down).
      this._suppressContextUntil = Date.now() + LONG_PRESS_SUPPRESS_MS;
      // The coming release targets the original row, not our menu: swallow
      // it so HA does not read the lift as a completed hold/tap.
      this._swallowNextTouchEnd = true;
      try {
        if (AutomationContextMenuTweak) AutomationContextMenuTweak.closeAll();
      } catch (e) {
        // ignore
      }
      this.closeAll();
      this._showMenu(pending.x, pending.y, pending.info);
    },

    _cancelLongPress: function () {
      if (this._lpTimer) {
        clearTimeout(this._lpTimer);
        this._lpTimer = null;
      }
      this._lpPending = null;
      this._lpPointerId = null;
    },

    _isItemEnabled: function (itemId) {
      return isItemEnabled(this.id, itemId);
    },

    // Walk the event path (same style as Tweak 1's _resolveEntityId) and
    // return the innermost trigger/condition/action row element, if any.
    // Shared resolveEditorRow() also skips text nodes and matches variant
    // tag names, data attributes, closest(), and row data properties.
    _resolveRow: function (path) {
      try {
        return resolveEditorRow(path);
      } catch (e) {
        return null;
      }
    },

    _rowIndex: function (rowEl) {
      try {
        if (typeof rowEl.index === 'number' && rowEl.index >= 0) return rowEl.index;
      } catch (e) {
        // ignore
      }
      try {
        if (rowEl.getAttribute) {
          const raw = rowEl.getAttribute('data-index') || rowEl.getAttribute('index');
          const n = parseInt(raw, 10);
          if (!isNaN(n) && n >= 0) return n;
        }
      } catch (e) {
        // ignore
      }
      return -1;
    },

    // Scope-wide row index matching the order in _snapshotCollapseStates.
    // row.index only tracks position within its own list (triggers vs conditions
    // vs actions), whereas snapshot states and panels are ordered across the
    // entire editor scope.
    _rowSnapshotIndex: function (rowEl, snap) {
      try {
        if (snap && Array.isArray(snap.rows) && rowEl) {
          const idx = snap.rows.indexOf(rowEl);
          if (idx >= 0) return idx;
          for (let i = 0; i < snap.rows.length; i++) {
            const r = snap.rows[i];
            if (r === rowEl) return i;
            if (r && typeof r.contains === 'function' && r.contains(rowEl)) return i;
          }
        }
      } catch (e) {
        // ignore
      }
      return this._rowIndex(rowEl);
    },

    _rowData: function (rowEl, kind) {
      try {
        if (kind === 'trigger' && rowEl.trigger && typeof rowEl.trigger === 'object') {
          return rowEl.trigger;
        }
        if (kind === 'condition' && rowEl.condition && typeof rowEl.condition === 'object') {
          return rowEl.condition;
        }
        if (rowEl.action && typeof rowEl.action === 'object') return rowEl.action;
        if (rowEl.step && typeof rowEl.step === 'object') return rowEl.step;
        if (rowEl.trigger && typeof rowEl.trigger === 'object') return rowEl.trigger;
        if (rowEl.condition && typeof rowEl.condition === 'object') return rowEl.condition;
        if (rowEl.config && typeof rowEl.config === 'object') return rowEl.config;
      } catch (e) {
        // ignore
      }
      return null;
    },

    _rowEnabled: function (info) {
      try {
        if (typeof info.element.enabled === 'boolean') return info.element.enabled;
      } catch (e) {
        // ignore
      }
      const data = this._rowData(info.element, info.kind);
      if (data && data.enabled === false) return false;
      return true;
    },

    // True when the row sits directly in a top-level list (not nested
    // inside a Choose/If/Repeat/etc. block). Only top-level rows can use
    // the config fallback, which splices the top-level array.
    _isTopLevelRow: function (rowEl) {
      try {
        let node =
          rowEl.parentNode || (rowEl.getRootNode && rowEl.getRootNode().host) || null;
        let depth = 0;
        while (node && depth < 15) {
          depth++;
          let tag = '';
          try {
            tag = ((node.tagName || '') + '').toUpperCase();
          } catch (e) {
            tag = '';
          }
          if (
            tag === 'HA-AUTOMATION-TRIGGER-ROW' ||
            tag === 'HA-AUTOMATION-CONDITION-ROW' ||
            tag === 'HA-AUTOMATION-ACTION-ROW' ||
            tag === 'HA-SCRIPT-ACTION'
          ) {
            return false; // nested inside another row
          }
          if (
            tag === 'HA-AUTOMATION-TRIGGER' ||
            tag === 'HA-AUTOMATION-CONDITION' ||
            tag === 'HA-AUTOMATION-ACTION' ||
            tag === 'MANUAL-AUTOMATION-EDITOR' ||
            tag === 'MANUAL-SCRIPT-EDITOR'
          ) {
            return true;
          }
          try {
            node = node.parentNode || (node.getRootNode && node.getRootNode().host) || null;
          } catch (e) {
            node = null;
          }
          if (!node || node === document) return false;
        }
      } catch (e) {
        // ignore
      }
      return false;
    },

    _listKeyFor: function (domain, kind, cfg) {
      if (domain === 'script') return 'sequence';
      const singular = kind === 'trigger' ? 'trigger' : kind === 'condition' ? 'condition' : 'action';
      const plural = singular + 's';
      if (cfg && cfg[singular] !== undefined && cfg[plural] === undefined) return singular;
      return plural;
    },

    _manualEditor: function () {
      try {
        return querySelectorDeep('manual-automation-editor, manual-script-editor');
      } catch (e) {
        return null;
      }
    },

    _memoryKeyFor: function (kind, manual) {
      if (kind === 'trigger') return 'triggers';
      if (kind === 'condition') return 'conditions';
      try {
        if (manual && 'sequence' in manual) return 'sequence';
      } catch (e) {
        // ignore
      }
      return 'actions';
    },

    // Best-effort in-memory sync so the open editor shows the change
    // immediately (the POST below persists it). Fault-isolated: if the
    // editor's internals differ, the POST still went through.
    _syncEditorMemory: function (kind, nextList) {
      try {
        const manual = this._manualEditor();
        if (!manual) return;
        const key = this._memoryKeyFor(kind, manual);
        manual[key] = nextList;
        const currentConfig = (manual && manual.config && typeof manual.config === 'object') ? manual.config : {};
        const nextConfig = Object.assign({}, currentConfig);
        nextConfig[key] = nextList;
        manual.config = nextConfig;
        if (typeof manual.requestUpdate === 'function') {
          try {
            manual.requestUpdate();
          } catch (e) {
            // ignore
          }
        }
        manual.dispatchEvent(
          new CustomEvent('value-changed', { bubbles: true, composed: true, detail: { value: nextConfig } })
        );
      } catch (e) {
        console.warn(LOG_TAG, 'editor memory sync failed', e);
      }
    },

    // Collapse-state preservation (Tweak 5 + Tweak 2): a row mutation
    // re-renders the editor with everything expanded by default, losing
    // the user's collapse state. Snapshot the per-row collapsed state
    // before the mutation (same ROW_SELECTOR set Tweak 2 collapses), then
    // re-apply it after Lit settles. New rows (e.g. the duplicate)
    // inherit the source row's state instead of defaulting to expanded.
    // Tri-state collapse reader. Returns { state, signal } where state is
    // true (collapsed), false (confidently expanded), or null (unknown: no
    // signal found — NOT expanded). Priority per row:
    //   a. Tweak 2's own written flags (ground truth from auto-collapse):
    //      row._collapsed, row._selectorRowCollapsed, row.collapsed.
    //   b. The row's DEEP ha-expansion-panel (any shadow depth below the
    //      row; index 0 is the row's own header panel): .expanded, then
    //      .open, then aria-expanded, then expanded/open attributes.
    //      Shallow row.shadowRoot.querySelector() misses panels nested past
    //      the first shadow level, so this must stay deep.
    //   c. A DEEP nested ha-automation-row (same depth rule): .collapsed,
    //      then collapsed attr, then aria-expanded, then expanded/open attrs.
    //   d. Row-level leftovers (collapsed attr, aria-expanded,
    //      .expanded/.open booleans), else null.
    // Unknown MUST stay null: the old default-false made snapshots read
    // all-false, and restore then actively EXPANDED every row.
    _readRowCollapse: function (row) {
      const none = { state: null, signal: null };
      try {
        if (!row) return none;
        let v;
        let panel = null;
        try {
          const panels = deepPanelsIn(row);
          panel = panels && panels.length ? panels[0] : null;
        } catch (e) {
          panel = null;
        }
        // In inline mode (!optionsInSidebar), the panel's expanded state is the
        // ground truth because row-level _collapsed never tracks panel toggles.
        if (panel && !row.optionsInSidebar) {
          try {
            v = panel.expanded;
          } catch (e) {
            v = undefined;
          }
          if (typeof v === 'boolean') return { state: !v, signal: 'panel.expanded' };
          try {
            v = panel.open;
          } catch (e) {
            v = undefined;
          }
          if (typeof v === 'boolean') return { state: !v, signal: 'panel.open' };
          try {
            if (panel.getAttribute) {
              const pae = panel.getAttribute('aria-expanded');
              if (pae === 'false') {
                return { state: true, signal: 'panel[aria-expanded=false]' };
              }
              if (pae === 'true') {
                return { state: false, signal: 'panel[aria-expanded=true]' };
              }
            }
          } catch (e) {
            // ignore
          }
          try {
            if (panel.hasAttribute) {
              if (panel.hasAttribute('expanded')) {
                return { state: false, signal: 'panel[expanded]' };
              }
              if (panel.hasAttribute('open')) {
                return { state: false, signal: 'panel[open]' };
              }
            }
          } catch (e) {
            // ignore
          }
        }
        try {
          v = row._collapsed;
        } catch (e) {
          v = undefined;
        }
        if (typeof v === 'boolean') return { state: !!v, signal: 'row._collapsed' };
        try {
          v = row._selectorRowCollapsed;
        } catch (e) {
          v = undefined;
        }
        if (typeof v === 'boolean') {
          return { state: !!v, signal: 'row._selectorRowCollapsed' };
        }
        try {
          v = row.collapsed;
        } catch (e) {
          v = undefined;
        }
        if (typeof v === 'boolean') return { state: !!v, signal: 'row.collapsed' };
        let haRow = null;
        try {
          const inners = deepHaRowsIn(row);
          haRow = inners && inners.length ? inners[0] : null;
        } catch (e) {
          haRow = null;
        }
        if (haRow) {
          try {
            v = haRow.collapsed;
          } catch (e) {
            v = undefined;
          }
          if (typeof v === 'boolean') {
            return { state: !!v, signal: 'ha-row.collapsed' };
          }
          try {
            if (haRow.hasAttribute && haRow.hasAttribute('collapsed')) {
              return { state: true, signal: 'ha-row[collapsed]' };
            }
          } catch (e) {
            // ignore
          }
          try {
            if (haRow.getAttribute) {
              const hae = haRow.getAttribute('aria-expanded');
              if (hae === 'false') {
                return { state: true, signal: 'ha-row[aria-expanded=false]' };
              }
              if (hae === 'true') {
                return { state: false, signal: 'ha-row[aria-expanded=true]' };
              }
            }
          } catch (e) {
            // ignore
          }
          try {
            if (haRow.hasAttribute) {
              if (haRow.hasAttribute('expanded')) {
                return { state: false, signal: 'ha-row[expanded]' };
              }
              if (haRow.hasAttribute('open')) {
                return { state: false, signal: 'ha-row[open]' };
              }
            }
          } catch (e) {
            // ignore
          }
        }
        if (panel) {
          try {
            v = panel.expanded;
          } catch (e) {
            v = undefined;
          }
          if (typeof v === 'boolean') return { state: !v, signal: 'panel.expanded' };
          try {
            v = panel.open;
          } catch (e) {
            v = undefined;
          }
          if (typeof v === 'boolean') return { state: !v, signal: 'panel.open' };
        }
        try {
          if (row.hasAttribute && row.hasAttribute('collapsed')) {
            return { state: true, signal: 'row[collapsed]' };
          }
        } catch (e) {
          // ignore
        }
        try {
          if (typeof row.getAttribute === 'function') {
            const rae = row.getAttribute('aria-expanded');
            if (rae === 'false') {
              return { state: true, signal: 'row[aria-expanded=false]' };
            }
            if (rae === 'true') {
              return { state: false, signal: 'row[aria-expanded=true]' };
            }
          }
        } catch (e) {
          // ignore
        }
        try {
          v = row.expanded;
        } catch (e) {
          v = undefined;
        }
        if (typeof v === 'boolean') return { state: !v, signal: 'row.expanded' };
        try {
          v = row.open;
        } catch (e) {
          v = undefined;
        }
        if (typeof v === 'boolean') return { state: !v, signal: 'row.open' };
      } catch (e) {
        // ignore
      }
      return none;
    },

    // Normalize any value to the tri-state collapse vocabulary:
    // true = collapsed, false = confidently expanded, null = unknown.
    _triState: function (v) {
      if (v === true) return true;
      if (v === false) return false;
      return null;
    },

    // Tri-state snapshot reader: true = collapsed, false = confidently
    // expanded, null = unknown (restore must leave the row alone).
    _rowCollapseState: function (row) {
      try {
        return this._readRowCollapse(row).state;
      } catch (e) {
        return null;
      }
    },

    // Which signal _rowCollapseState matched (tag + signal are logged by
    // debugLog). Null when the state is unknown.
    _rowCollapseSignal: function (row) {
      try {
        return this._readRowCollapse(row).signal;
      } catch (e) {
        return null;
      }
    },

    // Backwards-compatible boolean wrapper: unknown counts as "not
    // collapsed". Never use this for snapshots — use _rowCollapseState.
    _rowIsCollapsed: function (row) {
      try {
        return this._rowCollapseState(row) === true;
      } catch (e) {
        return false;
      }
    },

    _collapseSelector: function () {
      try {
        if (typeof ROW_SELECTOR === 'string' && ROW_SELECTOR) return ROW_SELECTOR;
      } catch (e) {
        // ignore: fall through to the shared row-tag set
      }
      return 'ha-automation-trigger-row, ha-automation-action-row, ha-automation-condition-row, ha-script-action';
    },

    // Panel-anchored companion to the row snapshot. Panels are the actual
    // collapse UI, so this bypasses row-element identity churn entirely:
    // ordered list of every panel's tri-state (true = collapsed, false =
    // confidently expanded, null = unreadable) plus, per row, the index of
    // the row's OWN header panel (deepPanelsIn(row)[0]) inside that list.
    // Restore maps panels by index with the same duplicate/delete shift
    // discipline as rows, under the same never-expand invariant.
    _panelTriState: function (panel) {
      try {
        if (!panel) return null;
        let v;
        try {
          v = panel.expanded;
        } catch (e) {
          v = undefined;
        }
        if (v === true) return false;
        if (v === false) return true;
      } catch (e) {
        // ignore
      }
      return null;
    },

    _snapshotCollapseStates: function () {
      try {
        const manual = this._manualEditor();
        const scope =
          (manual && (manual.shadowRoot || manual)) ||
          (typeof document !== 'undefined' ? document : null);
        if (!scope) return { rows: [], states: [], panels: [], panelStates: [], rowPanelIdx: [] };
        let rows = [];
        try {
          rows = querySelectorAllDeep(this._collapseSelector(), scope) || [];
        } catch (e) {
          rows = [];
        }
        const states = [];
        for (let i = 0; i < rows.length; i++) {
          try {
            states.push(this._rowCollapseState(rows[i]));
          } catch (e) {
            states.push(null);
          }
        }
        let panels = [];
        try {
          panels = deepPanelsIn(scope) || [];
        } catch (e) {
          panels = [];
        }
        const panelStates = [];
        for (let i = 0; i < panels.length; i++) {
          try {
            panelStates.push(this._panelTriState(panels[i]));
          } catch (e) {
            panelStates.push(null);
          }
        }
        // Row's own header panel -> index in the scope-wide panel list.
        // indexOf on element identity: post-mutation elements differ, but
        // this mapping is only consumed positionally (shift discipline).
        const rowPanelIdx = [];
        for (let i = 0; i < rows.length; i++) {
          try {
            const own = deepPanelsIn(rows[i]);
            const p0 = own && own.length ? own[0] : null;
            rowPanelIdx.push(p0 ? panels.indexOf(p0) : -1);
          } catch (e) {
            rowPanelIdx.push(-1);
          }
        }
        try {
          debugLog('snapshot', {
            count: rows.length,
            states: states.slice(),
            panelCount: panels.length,
            panelStates: panelStates.slice(),
            rows: rows.map((r) => {
              let tag = '?';
              try {
                tag = ((r.tagName || '') + '').toLowerCase() || '?';
              } catch (e) {
                tag = '?';
              }
              let signal = null;
              try {
                signal = this._rowCollapseSignal(r);
              } catch (e) {
                signal = null;
              }
              return tag + ':' + (signal || 'unknown');
            }),
          });
        } catch (e) {
          // ignore
        }
        return { rows: rows, states: states, panels: panels, panelStates: panelStates, rowPanelIdx: rowPanelIdx };
      } catch (e) {
        return { rows: [], states: [], panels: [], panelStates: [], rowPanelIdx: [] };
      }
    },

    // Re-apply a single row's collapsed state using Tweak 2's setter when
    // available so both stay in sync; otherwise mirror its logic.
    _applyRowCollapsed: function (row, collapse) {
      try {
        if (!row) return;
        try {
          if (
            typeof AutoCollapseEditorTweak !== 'undefined' &&
            AutoCollapseEditorTweak &&
            typeof AutoCollapseEditorTweak._setSingleRowCollapsed === 'function'
          ) {
            AutoCollapseEditorTweak._setSingleRowCollapsed(row, collapse, false);
            return;
          }
        } catch (e) {
          // fall through to the local mirror
        }
        try {
          if (collapse) {
            if (typeof row.collapseAll === 'function') row.collapseAll();
            else if (typeof row.collapse === 'function') row.collapse();
            if (typeof row.collapseSelectorRow === 'function') row.collapseSelectorRow();
            if ('_collapsed' in row) row._collapsed = true;
            if ('_selectorRowCollapsed' in row) row._selectorRowCollapsed = true;
            if ('_isNew' in row) row._isNew = false;
          } else {
            if (typeof row.expandAll === 'function') row.expandAll();
            else if (typeof row.expand === 'function') row.expand();
            if (typeof row.expandSelectorRow === 'function') row.expandSelectorRow();
            if ('_collapsed' in row) row._collapsed = false;
            if ('_selectorRowCollapsed' in row) row._selectorRowCollapsed = false;
          }
          if (typeof row.requestUpdate === 'function') {
            try {
              row.requestUpdate();
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          // ignore
        }
        try {
          let panel = null;
          try {
            const panels = deepPanelsIn(row);
            panel = panels && panels.length ? panels[0] : null;
          } catch (e) {
            panel = null;
          }
          if (panel && 'expanded' in panel && Boolean(panel.expanded) === !!collapse) {
            try {
              panel.expanded = !collapse;
            } catch (e) {
              // ignore
            }
          }
          let haRow = null;
          try {
            const inners = deepHaRowsIn(row);
            haRow = inners && inners.length ? inners[0] : null;
          } catch (e) {
            haRow = null;
          }
          if (haRow && 'collapsed' in haRow && Boolean(haRow.collapsed) !== !!collapse) {
            try {
              haRow.collapsed = !!collapse;
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          // ignore
        }
        try {
          if ('collapsed' in row && typeof row.collapsed === 'boolean') {
            row.collapsed = !!collapse;
          }
        } catch (e) {
          // ignore
        }
        try {
          if ('expanded' in row && typeof row.expanded === 'boolean') {
            row.expanded = !collapse;
          }
        } catch (e) {
          // ignore
        }
      } catch (e) {
        // ignore
      }
    },

    _restoreCollapseStates: function (states, op, sourceIndex, sourceCollapsed) {
      try {
        if (!states || !states.length) return;
        const self = this;
        const manual = this._manualEditor();
        const scope =
          (manual && (manual.shadowRoot || manual)) ||
          (typeof document !== 'undefined' ? document : null);
        if (!scope) return;
        let rows = [];
        try {
          rows = querySelectorAllDeep(this._collapseSelector(), scope) || [];
        } catch (e) {
          rows = [];
        }
        if (!rows.length) return;
        const n0 = states.length;
        const n1 = rows.length;
        const srcIdx =
          typeof sourceIndex === 'number' && sourceIndex >= 0 ? sourceIndex : -1;
        let srcCol = null;
        if (typeof sourceCollapsed === 'boolean') srcCol = sourceCollapsed;
        else if (srcIdx >= 0 && srcIdx < n0) srcCol = self._triState(states[srcIdx]);
        function isCollapsedNow(row) {
          try {
            return self._rowCollapseState(row) === true;
          } catch (e) {
            return false;
          }
        }
        // INVARIANT: restore may only COLLAPSE, never blanket-expand.
        //   true  (was collapsed) -> collapse the row.
        //   false (was confidently expanded) -> expand ONLY if currently collapsed.
        //   null  (unknown) -> do not touch the row, leave whatever HA rendered.
        // New rows (isNew, e.g. the duplicate) inherit the SOURCE row's state:
        // collapsed source -> collapse the new row; expanded/unknown source ->
        // leave the default. Worst case is "nothing changes".
        function applySnapshot(rowIdx, snapVal, isNew) {
          try {
            const row = rows[rowIdx];
            if (!row) return;
            if (snapVal === true) {
              self._applyRowCollapsed(row, true);
            } else if (snapVal === false && !isNew) {
              // Confidently expanded before: expand only if something
              // (e.g. Tweak 2's observer) collapsed it since.
              if (isCollapsedNow(row)) self._applyRowCollapsed(row, false);
            }
            // null/undefined: unknown — never touch. New rows with a
            // false/null source keep HA's default render.
          } catch (e) {
            // ignore
          }
        }
        try {
          debugLog('restore', {
            op: op,
            before: n0,
            after: n1,
            sourceIndex: srcIdx,
            sourceState: srcCol,
            snapshot: states.slice(),
          });
        } catch (e) {
          // ignore
        }
        if (n1 === n0) {
          for (let j = 0; j < n1; j++) applySnapshot(j, self._triState(states[j]), false);
          return;
        }
        if ((op === 'duplicate' || op === 'paste') && n1 === n0 + 1 && srcIdx >= 0) {
          for (let j = 0; j <= srcIdx && j < n1; j++) {
            applySnapshot(j, self._triState(states[j]), false);
          }
          applySnapshot(srcIdx + 1, srcCol, true);
          for (let j = srcIdx + 2; j < n1; j++) {
            applySnapshot(j, self._triState(states[j - 1]), false);
          }
          return;
        }
        if ((op === 'cut' || op === 'delete') && n1 === n0 - 1 && srcIdx >= 0) {
          for (let j = 0; j < srcIdx && j < n1; j++) {
            applySnapshot(j, self._triState(states[j]), false);
          }
          for (let j = srcIdx; j < n1; j++) {
            applySnapshot(j, self._triState(states[j + 1]), false);
          }
          return;
        }
        // Generic fallback: index overlay, extras inherit the source state.
        if (n1 > n0 && srcIdx >= 0) {
          for (let j = 0; j <= srcIdx && j < n1; j++) {
            applySnapshot(j, self._triState(states[j]), j >= n0);
          }
          for (let j = srcIdx + 1; j < n1; j++) {
            if (j === srcIdx + 1) applySnapshot(j, srcCol, j >= n0);
            else if (j - 1 < n0) applySnapshot(j, self._triState(states[j - 1]), j >= n0);
            else applySnapshot(j, srcCol, j >= n0);
          }
          return;
        }
        if (n1 < n0 && srcIdx >= 0) {
          for (let j = 0; j < srcIdx && j < n1; j++) {
            applySnapshot(j, self._triState(states[j]), false);
          }
          for (let j = srcIdx; j < n1; j++) {
            if (j + 1 < n0) applySnapshot(j, self._triState(states[j + 1]), false);
          }
          return;
        }
        const m = Math.min(n0, n1);
        for (let j = 0; j < m; j++) applySnapshot(j, self._triState(states[j]), false);
        for (let j = m; j < n1; j++) applySnapshot(j, srcCol, true);
      } catch (e) {
        // ignore
      }
    },

    // Panel-anchored restore pass. Same shift discipline and never-expand
    // invariant as _restoreCollapseStates, but driven by the scope-wide
    // ordered panel list instead of row elements: true (was collapsed) ->
    // collapse; false (was confidently expanded) -> expand ONLY if
    // currently collapsed; null -> never touch. The duplicated row's panel
    // inherits the SOURCE panel state. Bypasses row-element identity churn
    // (Lit re-renders swap element instances) because it re-queries panels
    // fresh on every attempt.
    _restorePanelStates: function (panelSnap, op, sourceIndex, sourceCollapsed) {
      try {
        if (!panelSnap || !panelSnap.panelStates || !panelSnap.panelStates.length) return;
        const self = this;
        const manual = this._manualEditor();
        const scope =
          (manual && (manual.shadowRoot || manual)) ||
          (typeof document !== 'undefined' ? document : null);
        if (!scope) return;
        let fresh = [];
        try {
          fresh = deepPanelsIn(scope) || [];
        } catch (e) {
          fresh = [];
        }
        if (!fresh.length) return;
        const snapStates = panelSnap.panelStates;
        const n0 = snapStates.length;
        const n1 = fresh.length;
        const srcRowIdx =
          typeof sourceIndex === 'number' && sourceIndex >= 0 ? sourceIndex : -1;
        let srcPanelIdx = -1;
        try {
          if (
            srcRowIdx >= 0 &&
            panelSnap.rowPanelIdx &&
            srcRowIdx < panelSnap.rowPanelIdx.length
          ) {
            const v = panelSnap.rowPanelIdx[srcRowIdx];
            if (typeof v === 'number' && v >= 0) srcPanelIdx = v;
          }
        } catch (e) {
          srcPanelIdx = -1;
        }
        let srcCol = null;
        if (typeof sourceCollapsed === 'boolean') srcCol = sourceCollapsed;
        else if (srcPanelIdx >= 0 && srcPanelIdx < n0) {
          srcCol = self._triState(snapStates[srcPanelIdx]);
        }
        function applyPanel(pIdx, snapVal, isNew) {
          try {
            const p = fresh[pIdx];
            if (!p) return;
            if (snapVal === true) {
              if (p.expanded) {
                try {
                  p.expanded = false;
                } catch (e) {
                  // ignore
                }
              }
            } else if (snapVal === false && !isNew) {
              // Confidently expanded before: expand only if something
              // collapsed it since (same invariant as the row pass).
              if (!p.expanded) {
                try {
                  p.expanded = true;
                } catch (e) {
                  // ignore
                }
              }
            }
            // null/undefined: unknown — never touch.
          } catch (e) {
            // ignore
          }
        }
        try {
          debugLog('restore-panels', {
            op: op,
            before: n0,
            after: n1,
            sourcePanel: srcPanelIdx,
            sourceState: srcCol,
            snapshot: snapStates.slice(),
          });
        } catch (e) {
          // ignore
        }
        if (n1 === n0) {
          for (let j = 0; j < n1; j++) applyPanel(j, self._triState(snapStates[j]), false);
          return;
        }
        if ((op === 'duplicate' || op === 'paste') && srcPanelIdx >= 0 && n1 === n0 + 1) {
          for (let j = 0; j <= srcPanelIdx && j < n1; j++) {
            applyPanel(j, self._triState(snapStates[j]), false);
          }
          applyPanel(srcPanelIdx + 1, srcCol, true);
          for (let j = srcPanelIdx + 2; j < n1; j++) {
            applyPanel(j, self._triState(snapStates[j - 1]), false);
          }
          return;
        }
        if ((op === 'cut' || op === 'delete') && srcPanelIdx >= 0 && n1 === n0 - 1) {
          for (let j = 0; j < srcPanelIdx && j < n1; j++) {
            applyPanel(j, self._triState(snapStates[j]), false);
          }
          for (let j = srcPanelIdx; j < n1; j++) {
            applyPanel(j, self._triState(snapStates[j + 1]), false);
          }
          return;
        }
        // Generic fallback: index overlay, extras inherit the source state.
        if (n1 > n0 && srcPanelIdx >= 0) {
          for (let j = 0; j <= srcPanelIdx && j < n1; j++) {
            applyPanel(j, self._triState(snapStates[j]), j >= n0);
          }
          for (let j = srcPanelIdx + 1; j < n1; j++) {
            if (j === srcPanelIdx + 1) applyPanel(j, srcCol, j >= n0);
            else if (j - 1 < n0) applyPanel(j, self._triState(snapStates[j - 1]), j >= n0);
            else applyPanel(j, srcCol, j >= n0);
          }
          return;
        }
        if (n1 < n0 && srcPanelIdx >= 0) {
          for (let j = 0; j < srcPanelIdx && j < n1; j++) {
            applyPanel(j, self._triState(snapStates[j]), false);
          }
          for (let j = srcPanelIdx; j < n1; j++) {
            if (j + 1 < n0) applyPanel(j, self._triState(snapStates[j + 1]), false);
          }
          return;
        }
        const m = Math.min(n0, n1);
        for (let j = 0; j < m; j++) applyPanel(j, self._triState(snapStates[j]), false);
        for (let j = m; j < n1; j++) applyPanel(j, srcCol, true);
      } catch (e) {
        // ignore
      }
    },

    // Wait for Lit to re-render, then re-apply the snapshot. Retries for
    // ~2s so late-mounted rows (nested Choose/If branches) are covered.
    // panelSnap (optional 5th arg) is the full _snapshotCollapseStates()
    // object: each attempt re-runs BOTH the row pass and the panel pass.
    _scheduleCollapseRestore: function (states, op, sourceIndex, sourceCollapsed, panelSnap) {
      try {
        if (!states || !states.length) return;
        const self = this;
        const snap = states.slice();
        try {
          debugLog('schedule-restore', {
            op: op,
            count: snap.length,
            snapshot: snap.slice(),
            sourceIndex: sourceIndex,
            sourceState:
              typeof sourceCollapsed === 'boolean'
                ? sourceCollapsed
                : self._triState(sourceCollapsed),
          });
        } catch (e) {
          // ignore
        }
        // All-unknown snapshot: restore could never touch anything, so skip
        // the ~20 DOM scans entirely. Panels count too: an all-unknown row
        // snapshot with known-collapsed panels must still restore.
        let known = false;
        for (let k = 0; k < snap.length; k++) {
          if (snap[k] === true || snap[k] === false) {
            known = true;
            break;
          }
        }
        if (!known && panelSnap && panelSnap.panelStates) {
          for (let k = 0; k < panelSnap.panelStates.length; k++) {
            if (panelSnap.panelStates[k] === true || panelSnap.panelStates[k] === false) {
              known = true;
              break;
            }
          }
        }
        if (!known) return;
        const maxAttempts = 20;
        let attempts = 0;
        function attempt() {
          attempts++;
          try {
            self._restoreCollapseStates(snap, op, sourceIndex, sourceCollapsed);
          } catch (e) {
            // ignore
          }
          try {
            self._restorePanelStates(panelSnap, op, sourceIndex, sourceCollapsed);
          } catch (e) {
            // ignore
          }
          if (attempts < maxAttempts) {
            try {
              setTimeout(attempt, 100);
            } catch (e) {
              // ignore
            }
          }
        }
        function kick() {
          try {
            let manual = null;
            try {
              manual = self._manualEditor();
            } catch (e) {
              manual = null;
            }
            if (
              manual &&
              manual.updateComplete &&
              typeof manual.updateComplete.then === 'function'
            ) {
              manual.updateComplete.then(
                function () {
                  try {
                    if (typeof requestAnimationFrame === 'function') {
                      requestAnimationFrame(function () {
                        try {
                          setTimeout(attempt, 0);
                        } catch (e) {
                          // ignore
                        }
                      });
                    } else {
                      setTimeout(attempt, 0);
                    }
                  } catch (e) {
                    setTimeout(attempt, 0);
                  }
                },
                function () {
                  try {
                    setTimeout(attempt, 0);
                  } catch (e) {
                    // ignore
                  }
                }
              );
            } else if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(function () {
                try {
                  setTimeout(attempt, 0);
                } catch (e) {
                  // ignore
                }
              });
            } else {
              setTimeout(attempt, 0);
            }
          } catch (e) {
            try {
              setTimeout(attempt, 0);
            } catch (err) {
              // ignore
            }
          }
        }
        kick();
      } catch (e) {
        // ignore
      }
    },

    _writeClipboard: function (data) {
      let text = '';
      try {
        text = JSON.stringify(data === undefined ? null : data, null, 2);
      } catch (e) {
        text = String(data);
      }
      try {
        this._clipboard = JSON.parse(JSON.stringify(data));
      } catch (e) {
        this._clipboard = data;
      }
      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === 'function'
        ) {
          navigator.clipboard.writeText(text).catch(function () {
            // toast already shown; ignore async failure
          });
          return true;
        }
      } catch (e) {
        // fall through to legacy path
      }
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        if (typeof ta.select === 'function') ta.select();
        const ok =
          typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
        if (ta.parentNode) ta.parentNode.removeChild(ta);
        return !!ok;
      } catch (e) {
        return false;
      }
    },

    // Call the row's own method when one exists. Returns true when a
    // matching method was found (even if it threw: the row claimed the
    // op, so the config fallback must NOT also run).
    _tryNative: function (rowEl, op) {
      const names = EDITOR_ROW_NATIVE_METHODS[op] || [];
      for (let i = 0; i < names.length; i++) {
        let fn = null;
        try {
          fn = rowEl[names[i]];
        } catch (e) {
          fn = null;
        }
        if (typeof fn === 'function') {
          try {
            fn.call(rowEl);
          } catch (e) {
            console.warn(LOG_TAG, 'editor row native ' + op + ' failed', e);
          }
          return true;
        }
      }
      if (op === 'duplicate') {
        try {
          rowEl.dispatchEvent(
            new CustomEvent('duplicate', { bubbles: true, composed: true, detail: {} })
          );
          return true;
        } catch (e) {
          // ignore
        }
      }
      if (op === 'paste') {
        try {
          rowEl.dispatchEvent(
            new CustomEvent('paste', { bubbles: true, composed: true, detail: {} })
          );
          return true;
        } catch (e) {
          // ignore
        }
      }
      return false;
    },

    _doOp: function (info, op) {
      try {
        if (op === 'copy' || op === 'cut') {
          try {
            this._copiedCollapseState = this._rowCollapseState(info.element);
          } catch (e) {
            this._copiedCollapseState = null;
          }
        }
        if (op === 'copy') {
          if (this._tryNative(info.element, 'copy')) return;
          const data = this._rowData(info.element, info.kind);
          if (data) {
            this._writeClipboard(data);
            toast('Copied ' + info.kind + ' to clipboard');
          } else {
            toast('Nothing to copy on this row');
          }
          return;
        }
        if (op === 'paste') {
          let pasteSnap = null;
          let pasteFull = null;
          let pasteIdx = -1;
          const pasteCol =
            typeof this._copiedCollapseState === 'boolean'
              ? this._copiedCollapseState
              : null;
          try {
            const s = this._snapshotCollapseStates();
            pasteSnap = s.states;
            pasteFull = s;
            pasteIdx = this._rowSnapshotIndex(info.element, s);
          } catch (e) {
            pasteSnap = null;
          }
          let pasteHandled = false;
          try {
            pasteHandled = this._tryNative(info.element, 'paste');
          } catch (e) {
            pasteHandled = false;
          }
          if (!pasteHandled) {
            try {
              let clipItem = this._clipboard;
              if (!clipItem && typeof sessionStorage !== 'undefined') {
                const raw = sessionStorage.getItem('automationClipboard');
                if (raw) {
                  const parsed = JSON.parse(raw);
                  clipItem = (parsed && parsed[info.kind]) || (parsed && parsed.action) || parsed;
                }
              }
              if (clipItem) {
                info.element.dispatchEvent(
                  new CustomEvent('paste', {
                    bubbles: true,
                    composed: true,
                    detail: { item: clipItem },
                  })
                );
                pasteHandled = true;
              }
            } catch (e) {
              // ignore
            }
          }
          if (pasteHandled) {
            try {
              if (pasteSnap && pasteSnap.length) {
                this._scheduleCollapseRestore(
                  pasteSnap,
                  'paste',
                  pasteIdx,
                  pasteCol,
                  pasteFull
                );
              }
            } catch (e) {
              // ignore
            }
          }
          return;
        }
        if (op === 'yaml') {
          let yamlSnap = null;
          let yamlFull = null;
          let yamlIdx = -1;
          let yamlCol = null;
          try {
            const s = this._snapshotCollapseStates();
            yamlSnap = s.states;
            yamlFull = s;
            yamlIdx = this._rowSnapshotIndex(info.element, s);
            yamlCol =
              yamlIdx >= 0 && yamlIdx < yamlSnap.length
                ? this._triState(yamlSnap[yamlIdx])
                : this._rowCollapseState(info.element);
          } catch (e) {
            yamlSnap = null;
          }
          let yamlHandled = false;
          try {
            yamlHandled = this._tryNative(info.element, 'yaml');
          } catch (e) {
            yamlHandled = false;
          }
          if (!yamlHandled) this._yamlFallback(info);
          try {
            if (yamlSnap && yamlSnap.length) {
              this._scheduleCollapseRestore(yamlSnap, 'yaml', yamlIdx, yamlCol, yamlFull);
            }
          } catch (e) {
            // ignore
          }
          return;
        }
        if (op === 'run') {
          if (!this._tryNative(info.element, 'run')) this._runFallback(info);
          return;
        }
        let preSnap = null;
        let preFull = null;
        let preIdx = -1;
        let preCol = null;
        try {
          const s2 = this._snapshotCollapseStates();
          preSnap = s2.states;
          preFull = s2;
          preIdx = this._rowSnapshotIndex(info.element, s2);
          preCol =
            preIdx >= 0 && preIdx < preSnap.length
              ? this._triState(preSnap[preIdx])
              : this._rowCollapseState(info.element);
        } catch (e) {
          preSnap = null;
        }
        let nativeHandled = false;
        try {
          nativeHandled = this._tryNative(info.element, op === 'enabled' ? 'enabled' : op);
        } catch (e) {
          nativeHandled = false;
        }
        if (nativeHandled) {
          try {
            if (preSnap && preSnap.length) {
              this._scheduleCollapseRestore(preSnap, op, preIdx, preCol, preFull);
            }
          } catch (e) {
            // ignore
          }
        } else {
          this._configOp(info, op, preSnap, preIdx, preCol, preFull);
        }
      } catch (e) {
        console.warn(LOG_TAG, 'editor row action failed', op, e);
        try {
          toast('HA Tweaks: action failed');
        } catch (err) {
          // ignore
        }
      }
    },

    // Config fallback for duplicate/cut/delete/enable-disable. Same REST
    // config API the table delete uses: GET the config, splice/toggle the
    // top-level list, POST it back. Prefers the live editor array as the
    // base so unsaved edits in the same list are preserved.
    _configOp: function (info, op, preStates, preIndex, preCollapsed, preFull) {
      const self = this;
      const domain = this._editorDomain();
      const editId = this._editorId();
      if (!domain || !editId || editId === 'new') {
        toast('Save this ' + (domain === 'script' ? 'script' : 'automation') + ' first, then try again');
        return;
      }
      const hass = getHass();
      if (!hass) {
        toast('HA Tweaks: still loading, try again in a second');
        return;
      }
      const rowEl = info.element;
      const kind = info.kind;
      const index = this._rowIndex(rowEl);
      if (index < 0) {
        toast('HA Tweaks: could not find this row’s position');
        console.warn(LOG_TAG, 'editor row op: no index for', kind, rowEl);
        return;
      }
      if (!this._isTopLevelRow(rowEl)) {
        toast('Nested rows change from the row’s own menu for now');
        return;
      }
      const kindLabel =
        kind === 'trigger' ? 'Trigger' : kind === 'condition' ? 'Condition' : 'Action';
      let snapStates = Array.isArray(preStates) && preStates.length ? preStates : null;
      let snapFull = preFull && preFull.panelStates ? preFull : null;
      let snapIndex =
        typeof preIndex === 'number' && preIndex >= 0 ? preIndex : self._rowSnapshotIndex(rowEl, snapFull);
      let snapCol = self._triState(preCollapsed);
      if (!snapStates) {
        try {
          const s0 = self._snapshotCollapseStates();
          snapStates = s0.states;
          snapFull = s0;
          snapIndex = self._rowSnapshotIndex(rowEl, s0);
          snapCol =
            snapIndex >= 0 && snapIndex < snapStates.length
              ? self._triState(snapStates[snapIndex])
              : self._rowCollapseState(rowEl);
        } catch (e) {
          snapStates = null;
        }
      }
      Promise.resolve()
        .then(function () {
          return hass.callApi('GET', 'config/' + domain + '/config/' + editId);
        })
        .then(function (cfg) {
          const config = cfg && typeof cfg === 'object' ? cfg : {};
          const key = self._listKeyFor(domain, kind, config);
          let base = null;
          try {
            const manual = self._manualEditor();
            const memKey = self._memoryKeyFor(kind, manual);
            if (manual && manual.config && Array.isArray(manual.config[memKey])) {
              base = manual.config[memKey].slice();
            } else if (manual && Array.isArray(manual[memKey])) {
              base = manual[memKey].slice();
            }
          } catch (e) {
            base = null;
          }
          if (!base) base = Array.isArray(config[key]) ? config[key].slice() : [];
          if (index >= base.length) {
            throw new Error('row ' + index + ' out of range (' + base.length + ')');
          }
          let msg = '';
          if (op === 'duplicate') {
            base.splice(index + 1, 0, JSON.parse(JSON.stringify(base[index])));
            msg = kindLabel + ' duplicated';
          } else if (op === 'delete') {
            base.splice(index, 1);
            msg = kindLabel + ' deleted';
          } else if (op === 'cut') {
            self._writeClipboard(base[index]);
            base.splice(index, 1);
            msg = kindLabel + ' cut to clipboard';
          } else if (op === 'enabled') {
            const item =
              base[index] && typeof base[index] === 'object' ? base[index] : {};
            if (item.enabled === false) {
              try {
                delete item.enabled;
              } catch (e) {
                item.enabled = true;
              }
              msg = kindLabel + ' enabled';
            } else {
              item.enabled = false;
              msg = kindLabel + ' disabled';
            }
            base[index] = item;
          } else {
            throw new Error('unknown op ' + op);
          }
          self._syncEditorMemory(kind, base);
          const next = {};
          try {
            const keys = Object.keys(config);
            for (let i = 0; i < keys.length; i++) next[keys[i]] = config[keys[i]];
          } catch (e) {
            // ignore
          }
          next[key] = base;
          return hass
            .callApi('POST', 'config/' + domain + '/config/' + editId, next)
            .then(function () {
              return msg;
            });
        })
        .then(function (msg) {
          if (msg) toast(msg);
          try {
            if (snapStates && snapStates.length) {
              self._scheduleCollapseRestore(snapStates, op, snapIndex, snapCol, snapFull);
            }
          } catch (e) {
            // ignore
          }
        })
        .catch(function (err) {
          const msg = (err && err.message) || err || 'unknown error';
          toast('Action failed: ' + msg);
          console.warn(LOG_TAG, 'editor row op failed', op, err);
        });
    },

    _yamlFallback: function (info) {
      const el = info.element;
      try {
        if ('yamlMode' in el) {
          el.yamlMode = !el.yamlMode;
          if (typeof el.requestUpdate === 'function') {
            try {
              el.requestUpdate();
            } catch (e) {
              // ignore
            }
          }
          return;
        }
      } catch (e) {
        // ignore
      }
      try {
        el.dispatchEvent(new CustomEvent('toggle-yaml', { bubbles: true, composed: true, detail: {} }));
      } catch (e) {
        console.warn(LOG_TAG, 'yaml toggle failed', e);
      }
    },

    _runFallback: function (info) {
      const data = this._rowData(info.element, info.kind) || {};
      const svc = data.action || data.service;
      if (typeof svc === 'string' && svc.indexOf('.') > 0) {
        const dot = svc.indexOf('.');
        const svcDomain = svc.slice(0, dot);
        const svcName = svc.slice(dot + 1);
        const hass = getHass();
        if (!hass) {
          toast('HA Tweaks: still loading, try again in a second');
          return;
        }
        let params = {};
        try {
          if (data.data && typeof data.data === 'object') params = data.data;
          else if (data.service_data && typeof data.service_data === 'object') {
            params = data.service_data;
          }
        } catch (e) {
          params = {};
        }
        try {
          if (data.target !== undefined) {
            hass.callService(svcDomain, svcName, params, data.target);
          } else {
            hass.callService(svcDomain, svcName, params);
          }
          toast('Ran action');
        } catch (e) {
          toast('Run failed: ' + ((e && e.message) || e || 'unknown error'));
          console.warn(LOG_TAG, 'run action failed', e);
        }
        return;
      }
      toast('This block can’t run alone — use its own menu');
    },

    _makeSeparator: function () {
      // Inset separator: 90% width, centered, never touches the edges.
      const sep = document.createElement('div');
      sep.setAttribute('data-ha-tweaks', 'menu-separator');
      sep.style.cssText =
        'height:1px;width:90%;margin:4px auto;padding:0;border:0;background:var(--divider-color,#e0e0e0);';
      return sep;
    },

    _canPaste: function (info) {
      try {
        if (this._clipboard) return true;
        if (typeof sessionStorage !== 'undefined') {
          const raw = sessionStorage.getItem('automationClipboard');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (
              parsed &&
              (parsed[info.kind] ||
                parsed.action ||
                parsed.trigger ||
                parsed.condition)
            ) {
              return true;
            }
          }
        }
        if (info && info.element) {
          if (typeof info.element._pasteAvailable === 'function') {
            return !!info.element._pasteAvailable();
          }
        }
      } catch (e) {
        // ignore
      }
      return false;
    },

    _showMenu: function (x, y, info) {
      const self = this;
      this._menuOpenedAt = Date.now();

      // backdrop
      const backdrop = document.createElement('div');
      backdrop.setAttribute('data-ha-tweaks', 'menu-backdrop');
      backdrop.style.cssText =
        'position:fixed;inset:0;z-index:999998;background:transparent;margin:0;padding:0;border:0;';
      backdrop.addEventListener('click', function () {
        // The finger lifting right after a long-press lands on the backdrop.
        // That click is the end of the press, not a dismissal: ignore it or
        // the menu would close the instant it opens on touch.
        try {
          if (Date.now() - self._menuOpenedAt < LIFT_CLICK_IGNORE_MS) return;
        } catch (e) {
          // fall through to close
        }
        self.closeAll();
      });
      backdrop.addEventListener(
        'contextmenu',
        function (e) {
          e.preventDefault();
          self.closeAll();
        },
        { capture: true }
      );
      document.body.appendChild(backdrop);
      this._backdropEl = backdrop;

      // menu
      const menu = document.createElement('div');
      menu.setAttribute('data-ha-tweaks', 'editor-row-menu');
      menu.setAttribute('role', 'group');
      menu.style.cssText = [
        'position:fixed',
        'z-index:999999',
        'min-width:230px',
        'max-width:300px',
        'padding:4px 0',
        'margin:0',
        'background:var(--card-background-color,#ffffff)',
        'color:var(--primary-text-color,#212121)',
        'border:1px solid var(--divider-color,#e0e0e0)',
        'border-radius:var(--ha-card-border-radius,8px)',
        'box-shadow:0 8px 28px rgba(0,0,0,0.28)',
        'font-family:inherit',
        'font-size:14px',
        'line-height:1.4',
        'overflow:hidden',
      ].join(';');

      let yamlMode = false;
      try {
        yamlMode = !!info.element.yamlMode;
      } catch (e) {
        yamlMode = false;
      }
      const rowEnabled = this._rowEnabled(info);
      const isAction = info.kind === 'action';
      const built = [];
      function makeItem(iconName, label, color, hint) {
        const btn = document.createElement('button');
        // Pointer-only menu: not reachable from the keyboard tab order.
        btn.setAttribute('tabindex', '-1');
        btn.type = 'button';
        btn.title = hint ? label + ' (' + hint + ')' : label;
        btn.style.cssText = [
          'display:flex',
          'align-items:center',
          'gap:12px',
          'width:100%',
          'text-align:left',
          'padding:10px 16px',
          'margin:0',
          'border:0',
          'background:transparent',
          'color:' + color,
          'font-size:14px',
          'font-family:inherit',
          'cursor:pointer',
          'opacity:1',
        ].join(';');
        const icon = document.createElement('ha-icon');
        icon.setAttribute('icon', iconName);
        icon.style.cssText = 'flex:0 0 auto;color:inherit;--mdc-icon-size:20px;';
        const span = document.createElement('span');
        span.textContent = label;
        span.style.cssText =
          'flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        btn.appendChild(icon);
        btn.appendChild(span);
        if (hint) {
          const k = document.createElement('span');
          k.textContent = hint;
          k.style.cssText =
            'flex:0 0 auto;margin-left:16px;font-size:12px;color:var(--secondary-text-color,#727272);';
          btn.appendChild(k);
        }
        btn.addEventListener('mouseenter', function () {
          btn.style.background = 'var(--secondary-background-color,#eeeeee)';
        });
        btn.addEventListener('mouseleave', function () {
          btn.style.background = 'transparent';
        });
        return btn;
      }
      function addItem(id, iconName, label, color, hint) {
        const btn = makeItem(iconName, label, color, hint);
        btn.addEventListener('click', function () {
          self.closeAll();
          self._doOp(info, id);
        });
        built.push({ id: id, el: btn });
      }

      const fg = 'var(--primary-text-color,#212121)';
      addItem('duplicate', 'mdi:content-duplicate', 'Duplicate', fg, null);
      addItem('copy', 'mdi:content-copy', 'Copy', fg, '⌘/Ctrl+C');
      if (this._canPaste(info)) {
        addItem('paste', 'mdi:content-paste', 'Paste', fg, '⌘/Ctrl+V');
      }
      addItem('cut', 'mdi:content-cut', 'Cut', fg, '⌘/Ctrl+X');
      if (yamlMode) {
        addItem('yaml', 'mdi:format-list-bulleted', 'Edit in visual editor', fg, null);
      } else {
        addItem('yaml', 'mdi:code-braces', 'Edit in YAML', fg, null);
      }
      if (rowEnabled) {
        addItem('enabled', 'mdi:eye-off', 'Disable', fg, null);
      } else {
        addItem('enabled', 'mdi:eye', 'Enable', fg, null);
      }
      if (isAction) {
        addItem('run', 'mdi:play', 'Run action', fg, null);
      }
      addItem('delete', 'mdi:delete', 'Delete', 'var(--error-color,#db4437)', '⌘/Ctrl+Del');

      // Only enabled items reach the menu, separators between them.
      const visible = built.filter(function (it) {
        return self._isItemEnabled(it.id);
      });
      if (!visible.length) {
        self.closeAll();
        toast('All menu items are off. Press Cmd/Ctrl+Shift+M to choose what shows.');
        return;
      }
      visible.forEach(function (it, i) {
        menu.appendChild(it.el);
        if (i < visible.length - 1) menu.appendChild(self._makeSeparator());
      });

      document.body.appendChild(menu);
      this._menuEl = menu;

      // viewport edge collision
      try {
        menu.style.left = '0px';
        menu.style.top = '0px';
        const rect = menu.getBoundingClientRect();
        let left = x;
        let top = y;
        const margin = 8;
        if (left + rect.width > window.innerWidth - margin) {
          left = window.innerWidth - rect.width - margin;
        }
        if (top + rect.height > window.innerHeight - margin) {
          top = window.innerHeight - rect.height - margin;
        }
        if (left < margin) left = margin;
        if (top < margin) top = margin;
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
      } catch (e) {
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
      }
    },

    _removeMenuOnly: function () {
      if (this._menuEl && this._menuEl.parentNode) {
        this._menuEl.parentNode.removeChild(this._menuEl);
      }
      this._menuEl = null;
      if (this._backdropEl && this._backdropEl.parentNode) {
        this._backdropEl.parentNode.removeChild(this._backdropEl);
      }
      this._backdropEl = null;
    },

    closeAll: function () {
      this._removeMenuOnly();
    },
  };

  /* ================================================================
   * Tweak 3: Dashboard empty-space right-click / long-press -> New Automation/Script
   * - Same touch handling as Tweak 1: 550ms press, move cancels
   *   (so scroll never triggers), lift-click ignored, release
   *   swallowed, synthetic iOS contextmenu suppressed
   * - Only fires on empty Lovelace space: inside a Lovelace view, but
   *   not on cards, entity rows, buttons, inputs, dialogs, or our own UI
   * - Entity rows belong to Tweak 1 and are left alone
   * ================================================================ */
  const DashboardEmptyMenuTweak = {
    id: 'dashboard-empty-menu',
    name: 'Dashboard empty-space menu',
    description:
      'Right-click (or long-press on touch) empty dashboard space for New Automation / New Script. Each item toggleable in settings (Cmd/Ctrl+Shift+M).',
    defaultEnabled: true,
    menuItems: [
      { id: 'new-automation', label: 'New Automation' },
      { id: 'new-script', label: 'New Script' },
    ],

    _onContextMenu: null,
    _onKeyDown: null,
    _onPointerDown: null,
    _onPointerMove: null,
    _onPointerUp: null,
    _onPointerCancel: null,
    _onScrollCapture: null,
    _lpTimer: null,
    _lpPending: null,
    _lpPointerId: null,
    _suppressContextUntil: 0,
    _menuOpenedAt: 0,
    _swallowNextTouchEnd: false,
    _onTouchEndCapture: null,
    _menuEl: null,
    _backdropEl: null,

    init: function () {
      const self = this;
      this._onContextMenu = function (ev) {
        try {
          self._handleContextMenu(ev);
        } catch (e) {
          console.warn(LOG_TAG, 'empty-space menu handler failed', e);
        }
      };
      window.addEventListener('contextmenu', this._onContextMenu, { capture: true });

      this._onKeyDown = function (ev) {
        try {
          if (ev && ev.key === 'Escape') self.closeAll();
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('keydown', this._onKeyDown, { capture: true });

      // Mobile long-press: same pattern as Tweak 1. Never preventDefault
      // here (would break scroll); the menu opens on timer fire and the
      // synthetic contextmenu iOS fires afterwards is suppressed.
      this._onPointerDown = function (ev) {
        try {
          self._handlePointerDown(ev);
        } catch (e) {
          console.warn(LOG_TAG, 'empty-space pointerdown failed', e);
        }
      };
      this._onPointerMove = function (ev) {
        try {
          self._handlePointerMove(ev);
        } catch (e) {
          // ignore
        }
      };
      this._onPointerUp = function () {
        try {
          self._cancelLongPress();
        } catch (e) {
          // ignore
        }
      };
      this._onPointerCancel = function () {
        try {
          self._cancelLongPress();
        } catch (e) {
          // ignore
        }
      };
      this._onScrollCapture = function () {
        try {
          self._cancelLongPress();
        } catch (e) {
          // ignore
        }
      };
      if (typeof window.PointerEvent !== 'undefined') {
        window.addEventListener('pointerdown', this._onPointerDown, {
          capture: true,
          passive: true,
        });
        window.addEventListener('pointermove', this._onPointerMove, {
          capture: true,
          passive: true,
        });
        window.addEventListener('pointerup', this._onPointerUp, {
          capture: true,
          passive: true,
        });
        window.addEventListener('pointercancel', this._onPointerCancel, {
          capture: true,
          passive: true,
        });
        window.addEventListener('scroll', this._onScrollCapture, {
          capture: true,
          passive: true,
        });
      }
      // Swallow exactly one release after a long-press fires: the lift
      // targets the dashboard background, and without this HA can read it
      // as a tap/hold. passive:false so preventDefault also kills click.
      this._onTouchEndCapture = function (ev) {
        try {
          if (self._swallowNextTouchEnd) {
            self._swallowNextTouchEnd = false;
            if (ev && ev.cancelable) ev.preventDefault();
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
          }
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('touchend', this._onTouchEndCapture, {
        capture: true,
        passive: false,
      });
    },

    destroy: function () {
      if (this._onContextMenu) {
        window.removeEventListener('contextmenu', this._onContextMenu, { capture: true });
        this._onContextMenu = null;
      }
      if (this._onKeyDown) {
        window.removeEventListener('keydown', this._onKeyDown, { capture: true });
        this._onKeyDown = null;
      }
      if (this._onPointerDown) {
        window.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
        this._onPointerDown = null;
      }
      if (this._onPointerMove) {
        window.removeEventListener('pointermove', this._onPointerMove, { capture: true });
        this._onPointerMove = null;
      }
      if (this._onPointerUp) {
        window.removeEventListener('pointerup', this._onPointerUp, { capture: true });
        this._onPointerUp = null;
      }
      if (this._onPointerCancel) {
        window.removeEventListener('pointercancel', this._onPointerCancel, {
          capture: true,
        });
        this._onPointerCancel = null;
      }
      if (this._onScrollCapture) {
        window.removeEventListener('scroll', this._onScrollCapture, { capture: true });
        this._onScrollCapture = null;
      }
      if (this._onTouchEndCapture) {
        window.removeEventListener('touchend', this._onTouchEndCapture, { capture: true });
        this._onTouchEndCapture = null;
      }
      this._cancelLongPress();
      this.closeAll();
    },

    onNavigate: function () {
      this._cancelLongPress();
      this.closeAll();
    },

    _handleContextMenu: function (ev) {
      // Suppress the synthetic contextmenu iOS fires after a long-press
      // we already handled (avoids a double menu).
      try {
        if (Date.now() < this._suppressContextUntil) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      } catch (e) {
        // fall through to normal handling
      }
      const path =
        typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
      // Entity rows belong to the automation context menu: never double-handle.
      if (this._resolveAutomationEntity(path)) return;
      if (!this._isEmptyDashboardSpace(path, ev.target)) return;

      ev.preventDefault();
      ev.stopPropagation();
      this.closeAll();
      this._showMenu(ev.clientX, ev.clientY);
    },

    _handlePointerDown: function (ev) {
      // Any new press clears a stale release-swallow.
      this._swallowNextTouchEnd = false;
      if (!ev || ev.pointerType !== 'touch') return;
      if (ev.isPrimary === false) return;
      // Only arm the timer on empty dashboard space; entity rows belong
      // to Tweak 1, and scrolling/buttons must never start a timer.
      const path =
        typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
      if (this._resolveAutomationEntity(path)) return;
      if (!this._isEmptyDashboardSpace(path, ev.target)) return;
      // A second finger down replaces any pending press.
      this._cancelLongPress();
      const x = typeof ev.clientX === 'number' ? ev.clientX : 0;
      const y = typeof ev.clientY === 'number' ? ev.clientY : 0;
      this._lpPointerId = ev.pointerId !== undefined ? ev.pointerId : null;
      this._lpPending = { x: x, y: y };
      const self = this;
      this._lpTimer = setTimeout(function () {
        try {
          self._fireLongPress();
        } catch (e) {
          console.warn(LOG_TAG, 'empty-space long-press fire failed', e);
        }
      }, LONG_PRESS_MS);
    },

    _handlePointerMove: function (ev) {
      if (!this._lpTimer || !this._lpPending) return;
      if (ev && this._lpPointerId !== null && ev.pointerId !== this._lpPointerId) return;
      const dx = (ev.clientX || 0) - this._lpPending.x;
      const dy = (ev.clientY || 0) - this._lpPending.y;
      const tol = LONG_PRESS_MOVE_TOLERANCE_PX;
      if (dx * dx + dy * dy > tol * tol) this._cancelLongPress();
    },

    _fireLongPress: function () {
      const pending = this._lpPending;
      this._lpTimer = null;
      this._lpPending = null;
      this._lpPointerId = null;
      if (!pending) return;
      // Arm suppression BEFORE showing the menu: iOS fires its synthetic
      // contextmenu after this timer fires (finger still down).
      this._suppressContextUntil = Date.now() + LONG_PRESS_SUPPRESS_MS;
      this._swallowNextTouchEnd = true;
      this.closeAll();
      this._showMenu(pending.x, pending.y);
    },

    _cancelLongPress: function () {
      if (this._lpTimer) {
        clearTimeout(this._lpTimer);
        this._lpTimer = null;
      }
      this._lpPending = null;
      this._lpPointerId = null;
    },


    _resolveAutomationEntity: function (path) {
      try {
        if (
          typeof AutomationContextMenuTweak !== 'undefined' &&
          typeof AutomationContextMenuTweak._resolveEntityId === 'function'
        ) {
          return AutomationContextMenuTweak._resolveEntityId(path);
        }
      } catch (e) {
        // ignore
      }
      return null;
    },

    _isEmptyDashboardSpace: function (path, target) {
      try {
        if (target) {
          try {
            const tn = ((target.tagName || '') + '').toUpperCase();
            if (tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT' || tn === 'OPTION') {
              return false;
            }
            if (target.isContentEditable) return false;
          } catch (e) {
            // ignore
          }
        }
        let inLovelace = false;
        for (let i = 0; i < (path || []).length; i++) {
          const el = path[i];
          if (!el || typeof el !== 'object') continue;
          try {
            if (el.getAttribute && typeof el.getAttribute === 'function') {
              if (el.getAttribute('data-ha-tweaks')) return false;
            }
          } catch (e) {
            // ignore
          }
          let tag = '';
          try {
            tag = ((el.tagName || '') + '').toUpperCase();
          } catch (e) {
            tag = '';
          }
          if (!tag) continue;
          if (
            tag.indexOf('DIALOG') >= 0 ||
            tag === 'MORE-INFO-CONTENT' ||
            tag === 'HA-MORE-INFO' ||
            tag.indexOf('MENU') >= 0 ||
            tag.indexOf('POPUP') >= 0
          ) {
            return false;
          }
          if (tag === 'BUTTON' || tag === 'A' || tag.indexOf('BUTTON') >= 0) {
            return false;
          }
          // Cards and rows are not empty space.
          if (tag.indexOf('CARD') >= 0) return false;
          if (tag.indexOf('HUI-ENTITY') === 0) return false;
          if (tag === 'STATE-BADGE') return false;
          if (tag === 'HA-BADGE' || tag.indexOf('BADGE') >= 0) return false;
          if (tag.indexOf('HUI-') === 0 && tag.indexOf('ROW') >= 0) return false;
          if (
            tag === 'HUI-VIEW' ||
            tag === 'HUI-MASONRY-VIEW' ||
            tag === 'HUI-PANEL-VIEW' ||
            tag === 'HA-PANEL-LOVELACE' ||
            tag.indexOf('LOVELACE') >= 0
          ) {
            inLovelace = true;
          }
        }
        return inLovelace;
      } catch (e) {
        return false;
      }
    },

    _isItemEnabled: function (itemId) {
      return isItemEnabled(this.id, itemId);
    },

    _navInPlace: function (path) {
      try {
        history.pushState(null, '', path);
        window.dispatchEvent(
          new CustomEvent('location-changed', { bubbles: true, composed: true })
        );
      } catch (e) {
        window.location.assign(path);
      }
    },

    _makeSeparator: function () {
      const sep = document.createElement('div');
      sep.setAttribute('data-ha-tweaks', 'menu-separator');
      sep.style.cssText =
        'height:1px;width:90%;margin:4px auto;padding:0;border:0;background:var(--divider-color,#e0e0e0);';
      return sep;
    },

    _makeItem: function (iconName, label) {
      const btn = document.createElement('button');
      // Pointer-only menu: not reachable from the keyboard tab order.
      btn.setAttribute('tabindex', '-1');
      btn.type = 'button';
      btn.title = label;
      btn.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:12px',
        'width:100%',
        'text-align:left',
        'padding:10px 16px',
        'margin:0',
        'border:0',
        'background:transparent',
        'color:var(--primary-text-color,#212121)',
        'font-size:14px',
        'font-family:inherit',
        'cursor:pointer',
        'opacity:1',
      ].join(';');
      const icon = document.createElement('ha-icon');
      icon.setAttribute('icon', iconName);
      icon.style.cssText = 'flex:0 0 auto;color:inherit;--mdc-icon-size:20px;';
      const span = document.createElement('span');
      span.textContent = label;
      span.style.cssText =
        'flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      btn.appendChild(icon);
      btn.appendChild(span);
      btn.addEventListener('mouseenter', function () {
        btn.style.background = 'var(--secondary-background-color,#eeeeee)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.background = 'transparent';
      });
      return btn;
    },

    _showMenu: function (x, y) {
      const self = this;
      this._menuOpenedAt = Date.now();

      const backdrop = document.createElement('div');
      backdrop.setAttribute('data-ha-tweaks', 'menu-backdrop');
      backdrop.style.cssText =
        'position:fixed;inset:0;z-index:999998;background:transparent;margin:0;padding:0;border:0;';
      backdrop.addEventListener('click', function () {
        // The lifting finger after a long-press lands on the backdrop.
        // That click is the end of the press, not a dismissal.
        try {
          if (Date.now() - self._menuOpenedAt < LIFT_CLICK_IGNORE_MS) return;
        } catch (e) {
          // fall through to close
        }
        self.closeAll();
      });
      backdrop.addEventListener(
        'contextmenu',
        function (e) {
          e.preventDefault();
          self.closeAll();
        },
        { capture: true }
      );
      document.body.appendChild(backdrop);
      this._backdropEl = backdrop;

      const menu = document.createElement('div');
      menu.setAttribute('data-ha-tweaks', 'dashboard-empty-menu');
      menu.setAttribute('role', 'group');
      menu.style.cssText = [
        'position:fixed',
        'z-index:999999',
        'min-width:230px',
        'max-width:300px',
        'padding:4px 0',
        'margin:0',
        'background:var(--card-background-color,#ffffff)',
        'color:var(--primary-text-color,#212121)',
        'border:1px solid var(--divider-color,#e0e0e0)',
        'border-radius:var(--ha-card-border-radius,8px)',
        'box-shadow:0 8px 28px rgba(0,0,0,0.28)',
        'font-family:inherit',
        'font-size:14px',
        'line-height:1.4',
        'overflow:hidden',
      ].join(';');

      const built = [];
      const autoBtn = this._makeItem('mdi:robot', 'New Automation');
      autoBtn.addEventListener('click', function () {
        self.closeAll();
        self._navInPlace('/config/automation/edit/new');
      });
      built.push({ id: 'new-automation', el: autoBtn });

      const scriptBtn = this._makeItem('mdi:script-text', 'New Script');
      scriptBtn.addEventListener('click', function () {
        self.closeAll();
        self._navInPlace('/config/script/edit/new');
      });
      built.push({ id: 'new-script', el: scriptBtn });

      const visible = built.filter(function (it) {
        return self._isItemEnabled(it.id);
      });
      if (!visible.length) {
        self.closeAll();
        toast('All menu items are off. Press Cmd/Ctrl+Shift+M to choose what shows.');
        return;
      }
      visible.forEach(function (it, i) {
        menu.appendChild(it.el);
        if (i < visible.length - 1) menu.appendChild(self._makeSeparator());
      });

      document.body.appendChild(menu);
      this._menuEl = menu;

      try {
        menu.style.left = '0px';
        menu.style.top = '0px';
        const rect = menu.getBoundingClientRect();
        let left = x;
        let top = y;
        const margin = 8;
        if (left + rect.width > window.innerWidth - margin) {
          left = window.innerWidth - rect.width - margin;
        }
        if (top + rect.height > window.innerHeight - margin) {
          top = window.innerHeight - rect.height - margin;
        }
        if (left < margin) left = margin;
        if (top < margin) top = margin;
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
      } catch (e) {
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
      }
    },

    _removeMenuOnly: function () {
      if (this._menuEl && this._menuEl.parentNode) {
        this._menuEl.parentNode.removeChild(this._menuEl);
      }
      this._menuEl = null;
      if (this._backdropEl && this._backdropEl.parentNode) {
        this._backdropEl.parentNode.removeChild(this._backdropEl);
      }
      this._backdropEl = null;
    },

    closeAll: function () {
      this._removeMenuOnly();
    },
  };

  /* ================================================================
   * Tweak 2: Auto-collapse automation & script editor
   * - Instant, zero-flash collapse on editor open & YAML->UI mode switch
   * - Newly added blocks stay open (_isNew / post-initial pass)
   * - Collapses & expands all levels (top-level + nested Choose/If/Repeat/Fields)
   * - Native Collapse All / Expand All button in hass-subpage toolbar
   * ================================================================ */
  const MDI_COLLAPSE_ALL =
    'M16.59,5.41L15.17,4L12,7.17L8.83,4L7.41,5.41L12,10M7.41,18.59L8.83,20L12,16.83L15.17,20L16.59,18.59L12,14L7.41,18.59Z';
  const MDI_EXPAND_ALL =
    'M12,18.17L8.83,15L7.42,16.41L12,21L16.59,16.41L15.17,15M12,5.83L15.17,9L16.58,7.59L12,3L7.41,7.59L8.83,9L12,5.83Z';
  // Row tags collapsed by the initial pass and setAllCollapsed. Mirrors the
  // shared EDITOR_ROW_TAGS contract (Tweak 5): trigger rows expose no
  // collapse()/collapseAll() upstream, so they collapse via their
  // ha-expansion-panel through _setSingleRowCollapsed + the panels loop.
  const ROW_SELECTOR =
    'ha-automation-trigger-row, ha-automation-action-row, ha-automation-condition-row, ha-automation-option-row, ha-script-action, ha-script-action-row, ha-script-field-row';

  const AutoCollapseEditorTweak = {
    id: 'auto-collapse-editor',
    name: 'Auto-collapse editor',
    description:
      'Open automation and script editors with building blocks collapsed (including after YAML-to-UI switches), plus a Collapse All / Expand All button in the toolbar.',
    defaultEnabled: true,

    _activePath: null,
    _lastManualEditor: null,
    _initialWindowUntil: 0,
    _collapsedInPass: null,
    _observers: [],
    _observedRoots: null,
    _watchTimer: null,
    _settleTimer: null,
    _syncTimer: null,
    _toolbarBtn: null,
    _toolbarTooltip: null,
    _onEditorEvent: null,

    init: function () {
      const self = this;
      this._observedRoots = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
      this._collapsedInPass = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
      this._onEditorEvent = function () {
        if (!self._isEditorRoute(window.location.pathname)) return;
        self._scheduleSyncToolbar();
      };
      ['toggle-collapsed', 'expanded-changed', 'open-sidebar', 'close-sidebar', 'value-changed'].forEach(
        function (evtName) {
          window.addEventListener(evtName, self._onEditorEvent, {
            capture: true,
            passive: true,
          });
        }
      );
      this.onNavigate(window.location.pathname);
    },

    destroy: function () {
      const self = this;
      if (this._onEditorEvent) {
        ['toggle-collapsed', 'expanded-changed', 'open-sidebar', 'close-sidebar', 'value-changed'].forEach(
          function (evtName) {
            window.removeEventListener(evtName, self._onEditorEvent, { capture: true });
          }
        );
        this._onEditorEvent = null;
      }
      this._cleanupEditor();
      this._activePath = null;
    },

    onNavigate: function (path) {
      const currentPath = typeof path === 'string' ? path : window.location.pathname;
      if (!this._isEditorRoute(currentPath)) {
        this._cleanupEditor();
        this._activePath = null;
        return;
      }
      if (this._activePath !== currentPath) {
        this._activePath = currentPath;
        this._resetInitialPass();
      }
      this._startEditorWatch();
    },

    _isEditorRoute: function (path) {
      return /^\/config\/(automation|script)\/(edit|show)(\/|$)/.test(path || '');
    },

    _resetInitialPass: function () {
      if (this._lastManualEditor) {
        try {
          delete this._lastManualEditor._haTweaksInitialDone;
        } catch (e) {
          this._lastManualEditor._haTweaksInitialDone = false;
        }
      }
      this._lastManualEditor = null;
      this._initialWindowUntil = 0;
      this._collapsedInPass = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
      if (this._settleTimer) {
        clearTimeout(this._settleTimer);
        this._settleTimer = null;
      }
    },

    _cleanupEditor: function () {
      if (this._watchTimer) {
        clearInterval(this._watchTimer);
        this._watchTimer = null;
      }
      if (this._settleTimer) {
        clearTimeout(this._settleTimer);
        this._settleTimer = null;
      }
      if (this._syncTimer) {
        clearTimeout(this._syncTimer);
        this._syncTimer = null;
      }
      if (this._observers && this._observers.length) {
        this._observers.forEach(function (obs) {
          try {
            obs.disconnect();
          } catch (e) {
            // ignore
          }
        });
      }
      this._observers = [];
      this._observedRoots = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
      this._removeToolbarButton();
      this._lastManualEditor = null;
      this._initialWindowUntil = 0;
    },

    _startEditorWatch: function () {
      const self = this;
      this._tickEditor();
      if (this._watchTimer) clearInterval(this._watchTimer);
      const started = Date.now();
      this._watchTimer = setInterval(function () {
        if (!self._isEditorRoute(window.location.pathname)) {
          self._cleanupEditor();
          return;
        }
        self._tickEditor();
        // Once the manual editor has settled its initial pass, mutations handle
        // the rest; stop the fast bootstrap poll after 15s max.
        if (
          (self._lastManualEditor && self._lastManualEditor._haTweaksInitialDone) ||
          Date.now() - started > 15000
        ) {
          clearInterval(self._watchTimer);
          self._watchTimer = null;
        }
      }, 60);
    },

    _observeRoot: function (root) {
      if (!root || typeof MutationObserver === 'undefined') return;
      if (this._observedRoots && this._observedRoots.has(root)) return;
      if (this._observedRoots) this._observedRoots.add(root);
      const self = this;
      try {
        const obs = new MutationObserver(function () {
          try {
            self._tickEditor();
          } catch (e) {
            // ignore
          }
        });
        obs.observe(root, { childList: true, subtree: true });
        this._observers.push(obs);
      } catch (e) {
        // ignore
      }
    },

    _findOuterEditor: function () {
      return querySelectorDeep('ha-automation-editor, ha-script-editor');
    },

    _findManualEditor: function (outer) {
      const scope = (outer && outer.shadowRoot) || outer || document;
      return querySelectorDeep(
        'manual-automation-editor, manual-script-editor, blueprint-automation-editor, blueprint-script-editor',
        scope
      );
    },

    _isYamlMode: function (outer, manual) {
      if (!outer) return false;
      try {
        if (outer.mode === 'yaml') return true;
      } catch (e) {
        // ignore
      }
      const scope = outer.shadowRoot || outer;
      if (!manual && querySelectorDeep('ha-yaml-editor', scope)) return true;
      return false;
    },

    _tickEditor: function () {
      const outer = this._findOuterEditor();
      if (!outer || !outer.shadowRoot) return;
      this._observeRoot(outer.shadowRoot);

      const subpage = outer.shadowRoot.querySelector('hass-subpage');
      const manual = this._findManualEditor(outer);
      const isYaml = this._isYamlMode(outer, manual);

      this._ensureToolbarButton(subpage, isYaml);

      if (isYaml || !manual) {
        // If user switched to YAML mode, clear _lastManualEditor so switching
        // back to UI mode triggers a fresh auto-collapse pass on the new tree.
        if (isYaml) {
          this._lastManualEditor = null;
          this._initialWindowUntil = 0;
        }
        return;
      }

      if (manual.shadowRoot) this._observeRoot(manual.shadowRoot);

      // Observe top-level section containers so row mounts fire immediately
      const containers = querySelectorAllDeep(
        'ha-automation-action, ha-automation-condition, ha-script-fields, ha-automation-option',
        manual.shadowRoot || manual
      );
      for (let i = 0; i < containers.length; i++) {
        if (containers[i] && containers[i].shadowRoot) {
          this._observeRoot(containers[i].shadowRoot);
        }
      }

      // Detect fresh manual-editor instance (initial open or YAML -> UI switch)
      if (manual !== this._lastManualEditor) {
        this._lastManualEditor = manual;
        this._initialWindowUntil = 0;
        this._collapsedInPass = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
        try {
          delete manual._haTweaksInitialDone;
        } catch (e) {
          manual._haTweaksInitialDone = false;
        }
      }

      if (!manual._haTweaksInitialDone) {
        this._runInitialCollapsePass(manual);
      }

      this._scheduleSyncToolbar();
    },

    _runInitialCollapsePass: function (manual) {
      const self = this;
      const scope = manual.shadowRoot || manual;
      const rows = querySelectorAllDeep(ROW_SELECTOR, scope);
      const panels = querySelectorAllDeep('ha-expansion-panel', scope);
      if (!rows.length && !panels.length) return;

      const now = Date.now();
      if (!this._initialWindowUntil) {
        // Give nested Lit components 350ms from the first rendered row to finish
        // mounting their initial subtree, then lock initialPassDone so any blocks
        // the user adds afterward stay open.
        this._initialWindowUntil = now + 350;
        if (this._settleTimer) clearTimeout(this._settleTimer);
        this._settleTimer = setTimeout(function () {
          self._settleTimer = null;
          if (self._lastManualEditor === manual) {
            self._runInitialCollapsePass(manual);
            manual._haTweaksInitialDone = true;
            self._syncToolbarButton();
          }
        }, 360);
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row._isNew) continue;
        if (this._collapsedInPass && this._collapsedInPass.has(row)) continue;
        if (this._collapsedInPass) this._collapsedInPass.add(row);
        this._setSingleRowCollapsed(row, true, true);
      }

      for (let j = 0; j < panels.length; j++) {
        const panel = panels[j];
        if (!panel) continue;
        if (this._collapsedInPass && this._collapsedInPass.has(panel)) continue;
        if (this._collapsedInPass) this._collapsedInPass.add(panel);
        try {
          if (panel.expanded) panel.expanded = false;
        } catch (e) {
          // ignore
        }
      }

      if (now >= this._initialWindowUntil) {
        manual._haTweaksInitialDone = true;
      }
    },

    // Sets a single row collapsed or expanded, chaining onto Lit's updateComplete
    // so ha-automation-action-row / ha-automation-condition-row firstUpdated()
    // (`if (this.root) this._collapsed = false`) is overridden in the microtask
    // before the browser paints a single expanded frame.
    _setSingleRowCollapsed: function (row, collapse, skipIfNew) {
      if (!row) return;
      const apply = function () {
        if (skipIfNew && row._isNew) return;
        try {
          if (collapse) {
            if (typeof row.collapseAll === 'function') row.collapseAll();
            else if (typeof row.collapse === 'function') row.collapse();
            if (typeof row.collapseSelectorRow === 'function') row.collapseSelectorRow();
            if ('_collapsed' in row) row._collapsed = true;
            if ('_selectorRowCollapsed' in row) row._selectorRowCollapsed = true;
            if ('_isNew' in row) row._isNew = false;
          } else {
            if (typeof row.expandAll === 'function') row.expandAll();
            else if (typeof row.expand === 'function') row.expand();
            if (typeof row.expandSelectorRow === 'function') row.expandSelectorRow();
            if ('_collapsed' in row) row._collapsed = false;
            if ('_selectorRowCollapsed' in row) row._selectorRowCollapsed = false;
          }
          if (typeof row.requestUpdate === 'function') {
            try {
              row.requestUpdate();
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          // ignore
        }
        try {
          let haRow = null;
          try {
            const inners = deepHaRowsIn(row);
            haRow = inners && inners.length ? inners[0] : null;
          } catch (e) {
            haRow = null;
          }
          if (haRow && 'collapsed' in haRow && Boolean(haRow.collapsed) !== !!collapse) {
            try {
              haRow.collapsed = !!collapse;
            } catch (e) {
              // ignore
            }
          }
          // Deep: the row's own header panel is index 0 (document order), so
          // nested rows' panels below are never touched by a single-row op.
          let panel = null;
          try {
            const panels = deepPanelsIn(row);
            panel = panels && panels.length ? panels[0] : null;
          } catch (e) {
            panel = null;
          }
          if (panel && Boolean(panel.expanded) === collapse) {
            panel.expanded = !collapse;
          }
        } catch (e) {
          // ignore
        }
      };

      apply();
      try {
        if (row.updateComplete && typeof row.updateComplete.then === 'function') {
          row.updateComplete
            .then(function () {
              apply();
              return row.updateComplete;
            })
            .then(function () {
              apply();
            })
            .catch(function () {
              // ignore
            });
        }
      } catch (e) {
        // ignore
      }
    },

    // Public/toolbar action: collapse or expand every level (top-level building
    // blocks + nested Choose options, If-Then-Else branches, Repeat, Parallel,
    // Sequence, And/Or/Not conditions, and Script fields).
    setAllCollapsed: function (collapse) {
      const self = this;
      const outer = this._findOuterEditor();
      const manual = this._findManualEditor(outer);
      if (!manual) return;
      manual._haTweaksInitialDone = true;

      const pass = function () {
        try {
          if (collapse && typeof manual.collapseAll === 'function') {
            manual.collapseAll();
          } else if (!collapse && typeof manual.expandAll === 'function') {
            manual.expandAll();
          }
        } catch (e) {
          // ignore
        }
        const scope = manual.shadowRoot || manual;
        const rows = querySelectorAllDeep(ROW_SELECTOR, scope);
        for (let i = 0; i < rows.length; i++) {
          self._setSingleRowCollapsed(rows[i], collapse, false);
        }
        const panels = querySelectorAllDeep('ha-expansion-panel', scope);
        for (let j = 0; j < panels.length; j++) {
          try {
            panels[j].expanded = !collapse;
          } catch (e) {
            // ignore
          }
        }
      };

      pass();
      // Second pass after Lit microtasks settle so newly-revealed nested Choose
      // options or If-Then branches also expand/collapse completely.
      setTimeout(function () {
        pass();
        self._syncToolbarButton();
      }, 45);
      this._scheduleSyncToolbar();
    },

    _getCollapsibleStats: function (manual) {
      const stats = { total: 0, expanded: 0 };
      if (!manual) return stats;
      const scope = manual.shadowRoot || manual;
      const haRows = querySelectorAllDeep('ha-automation-row', scope);
      for (let i = 0; i < haRows.length; i++) {
        const r = haRows[i];
        if (!r) continue;
        const isCollapsible = Boolean(
          r.leftChevron ||
            r.buildingBlock ||
            r.hasAttribute('left-chevron') ||
            r.hasAttribute('building-block')
        );
        if (!isCollapsible) continue;
        stats.total++;
        const isCollapsed = Boolean(r.collapsed || r.hasAttribute('collapsed'));
        if (!isCollapsed) stats.expanded++;
      }
      const panels = querySelectorAllDeep('ha-expansion-panel', scope);
      for (let j = 0; j < panels.length; j++) {
        const p = panels[j];
        if (!p) continue;
        stats.total++;
        if (p.expanded) stats.expanded++;
      }
      return stats;
    },

    _ensureToolbarButton: function (subpage, isYaml) {
      if (!subpage) return;
      if (this._toolbarBtn && this._toolbarBtn.parentNode !== subpage) {
        this._removeToolbarButton();
      }
      if (!this._toolbarBtn) {
        const self = this;
        const btn = document.createElement('ha-icon-button');
        btn.id = 'ha-tweaks-button-collapse';
        btn.setAttribute('slot', 'toolbar-icon');
        btn.setAttribute('data-ha-tweaks', 'collapse-toggle');
        btn.path = MDI_EXPAND_ALL;
        btn.label = 'Expand all';
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          const outer = self._findOuterEditor();
          const manual = self._findManualEditor(outer);
          const stats = self._getCollapsibleStats(manual);
          if (stats.total === 0) {
            toast('No collapsible building blocks in this editor');
            return;
          }
          const shouldCollapse = stats.expanded > 0;
          self.setAllCollapsed(shouldCollapse);
        });

        const tooltip = document.createElement('ha-tooltip');
        tooltip.setAttribute('placement', 'bottom');
        tooltip.setAttribute('for', 'ha-tweaks-button-collapse');
        tooltip.setAttribute('data-ha-tweaks', 'collapse-tooltip');
        tooltip.textContent = 'Expand all';

        // Insert right before the 3-dot dropdown (or Traces button) so it sits
        // alongside Undo/Redo in the native hass-subpage toolbar.
        const anchor =
          subpage.querySelector('ha-button[slot="toolbar-icon"]') ||
          subpage.querySelector('ha-dropdown[slot="toolbar-icon"]');
        if (anchor) {
          subpage.insertBefore(btn, anchor);
          subpage.insertBefore(tooltip, anchor);
        } else {
          subpage.appendChild(btn);
          subpage.appendChild(tooltip);
        }
        this._toolbarBtn = btn;
        this._toolbarTooltip = tooltip;
      }

      this._toolbarBtn.style.display = isYaml ? 'none' : '';
    },

    _scheduleSyncToolbar: function () {
      const self = this;
      if (this._syncTimer) clearTimeout(this._syncTimer);
      this._syncTimer = setTimeout(function () {
        self._syncTimer = null;
        self._syncToolbarButton();
      }, 30);
    },

    _syncToolbarButton: function () {
      if (!this._toolbarBtn) return;
      const outer = this._findOuterEditor();
      const manual = this._findManualEditor(outer);
      if (!manual || this._isYamlMode(outer, manual)) {
        this._toolbarBtn.style.display = 'none';
        return;
      }
      const stats = this._getCollapsibleStats(manual);
      // Hide button if there are no collapsible building blocks at all, or keep
      // it visible and updated when blocks exist.
      this._toolbarBtn.style.display = '';
      const hasExpanded = stats.expanded > 0;
      const nextLabel = hasExpanded ? 'Collapse all' : 'Expand all';
      const nextPath = hasExpanded ? MDI_COLLAPSE_ALL : MDI_EXPAND_ALL;
      if (this._toolbarBtn.path !== nextPath) {
        this._toolbarBtn.path = nextPath;
      }
      if (this._toolbarBtn.label !== nextLabel) {
        this._toolbarBtn.label = nextLabel;
      }
      if (this._toolbarTooltip && this._toolbarTooltip.textContent !== nextLabel) {
        this._toolbarTooltip.textContent = nextLabel;
      }
    },

    _removeToolbarButton: function () {
      if (this._toolbarBtn && this._toolbarBtn.parentNode) {
        try {
          this._toolbarBtn.parentNode.removeChild(this._toolbarBtn);
        } catch (e) {
          // ignore
        }
      }
      this._toolbarBtn = null;
      if (this._toolbarTooltip && this._toolbarTooltip.parentNode) {
        try {
          this._toolbarTooltip.parentNode.removeChild(this._toolbarTooltip);
        } catch (e) {
          // ignore
        }
      }
      this._toolbarTooltip = null;
    },
  };

  /* ================================================================
   * Tweak 4: Right-click = long press (Lovelace)
   * - A mouse right-click on a card, entity row, tile, badge, or picture
   *   element triggers the same hold action a long press would: the
   *   card's own hold_action when configured, otherwise more-info.
   * - Fires HA's native `action` event on the action-handler HA already
   *   bound to the pressed element, so there is no synthetic pointer
   *   sequence and no waiting for a timer.
   * - Cards that bind a delegated (resolve) handler, like picture
   *   elements, are resolved at the cursor the same way HA does.
   * - Falls back to hass-more-info when a row knows its entity but has
   *   no hold handler bound (plain entities-card rows).
   * - Touch is untouched; right-clicks outside Lovelace, in dialogs,
   *   menus, editors, and text fields are left to the browser.
   * ================================================================ */
  const RightClickHoldTweak = {
    id: 'right-click-hold',
    name: 'Right-click = long press',
    description:
      'Right-click a card, entity row, tile, or badge in Lovelace to trigger its hold action, usually more-info for that entity. Touch behavior is unchanged.',
    defaultEnabled: true,

    _onContextMenu: null,
    _onPointerDown: null,
    _lastTouchAt: 0,

    init: function () {
      const self = this;
      this._lastTouchAt = 0;
      this._onPointerDown = function (ev) {
        try {
          if (ev && ev.pointerType === 'touch') self._lastTouchAt = Date.now();
        } catch (e) {
          // ignore
        }
      };
      this._onContextMenu = function (ev) {
        try {
          self._handleContextMenu(ev);
        } catch (e) {
          console.warn(LOG_TAG, 'right-click hold failed', e);
        }
      };
      // Capture, like the other tweaks: action-handler binds its own
      // contextmenu listener on the target and stops propagation, so a
      // bubble-phase listener would never see events on entity rows.
      window.addEventListener('pointerdown', this._onPointerDown, {
        capture: true,
        passive: true,
      });
      window.addEventListener('contextmenu', this._onContextMenu, {
        capture: true,
      });
    },

    destroy: function () {
      if (this._onContextMenu) {
        window.removeEventListener('contextmenu', this._onContextMenu, {
          capture: true,
        });
        this._onContextMenu = null;
      }
      if (this._onPointerDown) {
        window.removeEventListener('pointerdown', this._onPointerDown, {
          capture: true,
        });
        this._onPointerDown = null;
      }
      this._lastTouchAt = 0;
    },

    onNavigate: function () {
      this._lastTouchAt = 0;
    },

    _handleContextMenu: function (ev) {
      if (!ev || ev.defaultPrevented) return;
      // Real right-click / ctrl-click only. Keyboard contextmenu (Shift+F10)
      // and assistive tech stay native.
      if (ev.button !== 2 && !ev.ctrlKey) return;
      // iOS fires a synthetic contextmenu after a long press; that gesture
      // already did whatever it was going to do.
      if (Date.now() - this._lastTouchAt < 1500) return;
      const path =
        typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
      if (!path || !path.length) return;
      // At window capture, ev.target is retargeted to the outermost shadow
      // host. path[0] is the element actually under the cursor.
      const targetEl = path[0] || ev.target;
      if (!this._isLovelace(path)) return;
      if (this._isExcluded(path, targetEl)) return;
      // Earlier tweaks own these targets. Checking the target itself instead
      // of only ev.defaultPrevented keeps us correct when a tweak is toggled
      // off and on again (which re-orders the window listeners).
      try {
        if (
          TweakRegistry.enabled['automation-context-menu'] &&
          AutomationContextMenuTweak._resolveEntityId(path)
        ) {
          return;
        }
      } catch (e) {
        // ignore
      }
      try {
        if (
          TweakRegistry.enabled['dashboard-empty-menu'] &&
          DashboardEmptyMenuTweak._isEmptyDashboardSpace(path, ev.target)
        ) {
          return;
        }
      } catch (e) {
        // ignore
      }

      const entityId = this._resolveEntityId(path);
      const handlers = this._findActionHandlers(path);
      if (!handlers.length) {
        if (!entityId) return; // nothing to act on: keep the browser menu
        ev.preventDefault();
        ev.stopPropagation();
        this._fireMoreInfo(targetEl, entityId);
        return;
      }

      // Prefer a handler that actually has a hold action, resolving
      // delegated containers (picture elements) at the cursor. Nested
      // controls (a tile icon inside its tile) then behave like their own
      // hold instead of the outer card's.
      let holdTarget = null;
      for (let i = 0; i < handlers.length; i++) {
        const el = handlers[i];
        const opts = el.actionHandler.options || {};
        if (opts.disabled) continue;
        if (opts.hasHold) {
          holdTarget = el;
          break;
        }
        if (typeof opts.resolve === 'function') {
          try {
            const resolved = opts.resolve(ev.clientX, ev.clientY, ev);
            if (
              resolved &&
              resolved.target &&
              resolved.options &&
              resolved.options.hasHold &&
              !resolved.options.disabled
            ) {
              holdTarget = resolved.target;
              break;
            }
          } catch (e) {
            // resolver failed: fall through to the other handlers
          }
        }
      }
      if (holdTarget) {
        ev.preventDefault();
        ev.stopPropagation();
        this._fireHold(holdTarget);
        return;
      }

      // No hold handler bound. Plain entities-card rows still know their
      // entity, so right-click opens more-info as a long press should.
      if (!entityId) return;
      const firstOpts = handlers[0].actionHandler.options || {};
      if (firstOpts.disabled) return;
      if (this._isHoldDisabled(path)) return;
      ev.preventDefault();
      ev.stopPropagation();
      this._fireMoreInfo(handlers[0], entityId);
    },

    _isLovelace: function (path) {
      for (let i = 0; i < path.length; i++) {
        const el = path[i];
        if (!el || typeof el !== 'object') continue;
        let tag = '';
        try {
          tag = ((el.tagName || '') + '').toUpperCase();
        } catch (e) {
          tag = '';
        }
        if (
          tag === 'HA-PANEL-LOVELACE' ||
          tag === 'HUI-ROOT' ||
          tag === 'HUI-VIEW' ||
          tag === 'HUI-MASONRY-VIEW' ||
          tag === 'HUI-PANEL-VIEW' ||
          tag === 'HUI-SECTIONS-VIEW' ||
          tag === 'HUI-SIDEBAR-VIEW'
        ) {
          return true;
        }
      }
      return false;
    },

    _isExcluded: function (path, target) {
      try {
        if (target) {
          const tn = ((target.tagName || '') + '').toUpperCase();
          if (
            tn === 'INPUT' ||
            tn === 'TEXTAREA' ||
            tn === 'SELECT' ||
            tn === 'OPTION'
          ) {
            return true;
          }
          if (target.isContentEditable) return true;
        }
      } catch (e) {
        // ignore
      }
      for (let i = 0; i < path.length; i++) {
        const el = path[i];
        if (!el || typeof el !== 'object') continue;
        try {
          if (el.getAttribute && typeof el.getAttribute === 'function') {
            if (el.getAttribute('data-ha-tweaks')) return true;
            if (el.getAttribute('contenteditable') === 'true') return true;
          }
        } catch (e) {
          // ignore
        }
        let tag = '';
        try {
          tag = ((el.tagName || '') + '').toUpperCase();
        } catch (e) {
          tag = '';
        }
        if (!tag) continue;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          tag === 'OPTION' ||
          tag.indexOf('DIALOG') >= 0 ||
          tag === 'HA-MORE-INFO' ||
          tag === 'MORE-INFO-CONTENT' ||
          tag.indexOf('MENU') >= 0 ||
          tag.indexOf('POPUP') >= 0 ||
          tag === 'HA-CODE-EDITOR' ||
          tag.indexOf('CODE-MIRROR') >= 0
        ) {
          return true;
        }
      }
      return false;
    },

    _findActionHandlers: function (path) {
      const out = [];
      for (let i = 0; i < path.length; i++) {
        const el = path[i];
        if (!el || typeof el !== 'object') continue;
        try {
          if (el.actionHandler && typeof el.actionHandler === 'object') {
            out.push(el);
          }
        } catch (e) {
          // ignore
        }
      }
      return out;
    },

    _resolveEntityId: function (path) {
      for (let i = 0; i < path.length; i++) {
        const el = path[i];
        if (!el || typeof el !== 'object') continue;
        const ids = [];
        try {
          if (el.stateObj && typeof el.stateObj.entity_id === 'string') {
            ids.push(el.stateObj.entity_id);
          }
        } catch (e) {
          // ignore
        }
        try {
          if (typeof el.entityId === 'string') ids.push(el.entityId);
        } catch (e) {
          // ignore
        }
        try {
          if (typeof el.entity === 'string') ids.push(el.entity);
        } catch (e) {
          // ignore
        }
        try {
          if (el._config && typeof el._config.entity === 'string') {
            ids.push(el._config.entity);
          }
        } catch (e) {
          // ignore
        }
        try {
          if (el._config && typeof el._config.image_entity === 'string') {
            ids.push(el._config.image_entity);
          }
          if (el._config && typeof el._config.camera_image === 'string') {
            ids.push(el._config.camera_image);
          }
        } catch (e) {
          // ignore
        }
        try {
          if (el.config && typeof el.config.entity === 'string') {
            ids.push(el.config.entity);
          }
          if (el.config && typeof el.config.image_entity === 'string') {
            ids.push(el.config.image_entity);
          }
          if (el.config && typeof el.config.camera_image === 'string') {
            ids.push(el.config.camera_image);
          }
        } catch (e) {
          // ignore
        }
        try {
          if (el.getAttribute && typeof el.getAttribute === 'function') {
            const attr =
              el.getAttribute('data-entity-id') || el.getAttribute('data-entity');
            if (typeof attr === 'string') ids.push(attr);
          }
        } catch (e) {
          // ignore
        }
        for (let j = 0; j < ids.length; j++) {
          if (this._looksLikeEntityId(ids[j])) return ids[j];
        }
      }
      return null;
    },

    _looksLikeEntityId: function (id) {
      return (
        typeof id === 'string' && id.indexOf('.') > 0 && id.indexOf(' ') < 0
      );
    },

    _isHoldDisabled: function (path) {
      for (let i = 0; i < path.length; i++) {
        const el = path[i];
        if (!el || typeof el !== 'object') continue;
        let cfg = null;
        try {
          cfg = el._config || el.config || null;
        } catch (e) {
          cfg = null;
        }
        if (!cfg || typeof cfg !== 'object') continue;
        const hold = cfg.hold_action;
        if (!hold) continue;
        if (hold === 'none') return true;
        if (typeof hold === 'object' && hold.action === 'none') return true;
      }
      return false;
    },

    _fireHold: function (el) {
      el.dispatchEvent(
        new CustomEvent('action', {
          detail: { action: 'hold' },
          bubbles: true,
          composed: true,
        })
      );
    },

    _fireMoreInfo: function (el, entityId) {
      el.dispatchEvent(
        new CustomEvent('hass-more-info', {
          detail: { entityId: entityId },
          bubbles: true,
          composed: true,
        })
      );
    },
  };

  /* ================================================================
   * Tweak 6: chips show after active for (Mushroom chips-card `for:` gating)
   * ================================================================
   * Hides a Mushroom chip until its entity has held a target state for a
   * duration. Plain chips read `entity` + `state` (default 'on') + a
   * duration key (`for:` / `active_for:` / `show_for:` / `duration:`) from
   * the chip's own `_config`, falling back to the parent
   * `mushroom-chips-card`'s `_config.chips[index]` matched by sibling index
   * inside `.chip-container`. Conditional chips evaluate every entry in
   * `_config.conditions` (entries without `for:` are plain state checks);
   * ALL must pass. Chips with no parseable duration are never touched, so
   * the tweak is zero-impact until a `for:` key appears.
   *
   * Hiding is `style.display = 'none'` re-applied on every scan because
   * Mushroom re-creates chip elements on re-render. Re-renders surface as
   * childList mutations (debounced rescan); a single global one-shot timer
   * wakes the earliest pending chip; a 10s backstop covers the rest but
   * stays idle when no ruled chip was seen last pass. */

  // Duration parser: number (seconds), numeric string, "HH:MM:SS" /
  // "MM:SS", or {hours,minutes,seconds} (singular keys accepted too).
  // Returns seconds, or null when unparseable (caller treats as no-rule).
  function parseForDuration(v) {
    try {
      if (typeof v === 'number') {
        if (!isFinite(v) || v < 0) return null;
        return v;
      }
      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return null;
        if (s.indexOf(':') >= 0) {
          const parts = s.split(':');
          if (parts.length !== 2 && parts.length !== 3) return null;
          const nums = [];
          for (let i = 0; i < parts.length; i++) {
            const p = parts[i].trim();
            if (!p) return null;
            const n = Number(p);
            if (!isFinite(n) || n < 0) return null;
            nums.push(n);
          }
          const total =
            nums.length === 2
              ? nums[0] * 60 + nums[1]
              : nums[0] * 3600 + nums[1] * 60 + nums[2];
          if (!isFinite(total) || total < 0) return null;
          return total;
        }
        const asNum = Number(s);
        if (!isFinite(asNum) || asNum < 0) return null;
        return asNum;
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const h = v.hours !== undefined ? v.hours : v.hour;
        const m = v.minutes !== undefined ? v.minutes : v.minute;
        const sec = v.seconds !== undefined ? v.seconds : v.second;
        if (h === undefined && m === undefined && sec === undefined) return null;
        const hn = h === undefined ? 0 : Number(h);
        const mn = m === undefined ? 0 : Number(m);
        const sn = sec === undefined ? 0 : Number(sec);
        if (!isFinite(hn) || !isFinite(mn) || !isFinite(sn)) return null;
        if (hn < 0 || mn < 0 || sn < 0) return null;
        return hn * 3600 + mn * 60 + sn;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  // Single timed-state check. `rule` = {state, state_not, forSeconds}.
  // `state` matches by === or inclusion; `state_not` by !== / exclusion;
  // neither present defaults to 'on'. Missing/unavailable/unknown states
  // never count. Returns {met, waitMs} where waitMs is the remaining ms
  // until the threshold when the state matches but the time does not.
  function isRuleMet(stateObj, rule, nowMs) {
    try {
      const r = rule || {};
      if (!stateObj || typeof stateObj.state !== 'string') {
        return { met: false, waitMs: 0 };
      }
      const cur = stateObj.state;
      if (cur === 'unavailable' || cur === 'unknown') {
        return { met: false, waitMs: 0 };
      }
      const hasState = r.state !== undefined && r.state !== null;
      const hasNot = r.state_not !== undefined && r.state_not !== null;
      const want = hasState ? r.state : 'on';
      let ok = true;
      if (hasState || !hasNot) {
        if (Array.isArray(want)) ok = want.indexOf(cur) >= 0;
        else ok = cur === '' + want;
      }
      if (ok && hasNot) {
        const not = r.state_not;
        if (Array.isArray(not)) ok = not.indexOf(cur) < 0;
        else ok = cur !== '' + not;
      }
      if (!ok) return { met: false, waitMs: 0 };
      if (r.forSeconds === undefined || r.forSeconds === null) {
        return { met: true, waitMs: 0 };
      }
      const need = Number(r.forSeconds);
      if (!isFinite(need) || need <= 0) return { met: true, waitMs: 0 };
      const now =
        typeof nowMs === 'number' && isFinite(nowMs) ? nowMs : Date.now();
      const changed = Date.parse(stateObj.last_changed);
      let elapsed = isFinite(changed) ? now - changed : 0;
      if (!isFinite(elapsed) || elapsed < 0) elapsed = 0;
      const threshold = need * 1000;
      if (elapsed >= threshold) return { met: true, waitMs: 0 };
      return { met: false, waitMs: threshold - elapsed };
    } catch (e) {
      return { met: false, waitMs: 0 };
    }
  }

  const ChipActiveForTweak = {
    id: 'chip-active-for',
    name: 'Chips: show after active for',
    description:
      'Hide Mushroom chips until their entity has held a state for a duration (per-chip `for:`). Chips without a duration key are untouched.',
    defaultEnabled: true,

    _chipSelector:
      'mushroom-entity-chip,mushroom-template-chip,mushroom-conditional-chip,' +
      'mushroom-light-chip,mushroom-weather-chip,mushroom-action-chip,' +
      'mushroom-alarm-control-panel-chip,mushroom-back-chip,mushroom-menu-chip,' +
      'mushroom-quickbar-chip,mushroom-spacer-chip',

    _observer: null,
    _interval: null,
    _debounceTimer: null,
    _wakeTimer: null,
    _onMutate: null,
    _hasRuled: false,
    _applied: null,

    init: function () {
      const self = this;
      try {
        this._applied = new WeakMap();
      } catch (e) {
        this._applied = null;
      }
      this._hasRuled = false;
      this._onMutate = function () {
        try {
          if (self._debounceTimer) clearTimeout(self._debounceTimer);
        } catch (e) {
          // ignore
        }
        self._debounceTimer = setTimeout(function () {
          self._debounceTimer = null;
          try {
            self.scan();
          } catch (e) {
            // never break the frontend for a chip scan
          }
        }, 150);
      };
      try {
        this._observer = new MutationObserver(this._onMutate);
        this._observer.observe(document, { childList: true, subtree: true });
      } catch (e) {
        this._observer = null;
        console.warn(LOG_TAG, 'chip-active-for observer failed', e);
      }
      try {
        this._interval = setInterval(function () {
          try {
            if (self._hasRuled) self.scan();
          } catch (e) {
            // ignore
          }
        }, 10000);
      } catch (e) {
        this._interval = null;
      }
      try {
        this.scan();
      } catch (e) {
        // ignore
      }
    },

    destroy: function () {
      try {
        if (this._observer) this._observer.disconnect();
      } catch (e) {
        // ignore
      }
      this._observer = null;
      try {
        if (this._interval) clearInterval(this._interval);
      } catch (e) {
        // ignore
      }
      this._interval = null;
      try {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
      } catch (e) {
        // ignore
      }
      this._debounceTimer = null;
      try {
        if (this._wakeTimer) clearTimeout(this._wakeTimer);
      } catch (e) {
        // ignore
      }
      this._wakeTimer = null;
      this._onMutate = null;
      // Restore every chip we hid.
      try {
        const hidden = querySelectorAllDeep('[data-ha-tweaks-chip-hidden]');
        for (let i = 0; i < hidden.length; i++) {
          try {
            hidden[i].style.display = '';
            hidden[i].removeAttribute('data-ha-tweaks-chip-hidden');
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
      try {
        this._applied = new WeakMap();
      } catch (e) {
        this._applied = null;
      }
      this._hasRuled = false;
    },

    onNavigate: function () {
      try {
        this.scan();
      } catch (e) {
        // ignore
      }
    },

    scan: function () {
      const self = this;
      const nowMs = Date.now();
      let earliest = 0;
      let ruled = 0;
      try {
        let hass = null;
        try {
          hass = getHass();
        } catch (e) {
          hass = null;
        }
        let hosts = [];
        try {
          hosts = querySelectorAllDeep(self._chipSelector);
        } catch (e) {
          hosts = [];
        }
        for (let i = 0; i < hosts.length; i++) {
          const host = hosts[i];
          try {
            const cfg = self._resolveConfig(host);
            const rule = self._ruleFromConfig(cfg);
            let states = null;
            try {
              states =
                (host.hass && host.hass.states) || (hass && hass.states) || null;
            } catch (e) {
              states = null;
            }
            if (!rule || !states) {
              // No rule (or no states yet): un-hide if we hid it before,
              // otherwise leave the chip exactly as Mushroom rendered it.
              try {
                if (self._applied && self._applied.get(host) === 'none') {
                  host.style.display = '';
                  self._applied.set(host, '');
                  try {
                    host.removeAttribute('data-ha-tweaks-chip-hidden');
                  } catch (e) {
                    // ignore
                  }
                }
              } catch (e) {
                // ignore
              }
              continue;
            }
            ruled++;
            const res = self._evaluateRule(rule, states, nowMs);
            const desired = res.met ? '' : 'none';
            let prev;
            try {
              prev = self._applied ? self._applied.get(host) : undefined;
            } catch (e) {
              prev = undefined;
            }
            if (prev !== desired) {
              try {
                host.style.display = desired;
                if (self._applied) self._applied.set(host, desired);
                if (desired === 'none') {
                  host.setAttribute('data-ha-tweaks-chip-hidden', '1');
                } else {
                  host.removeAttribute('data-ha-tweaks-chip-hidden');
                }
              } catch (e) {
                // ignore
              }
            }
            if (!res.met && res.waitMs > 0) {
              if (!(earliest > 0) || res.waitMs < earliest) earliest = res.waitMs;
            }
          } catch (e) {
            console.warn(LOG_TAG, 'chip-active-for chip failed', e);
          }
        }
        self._hasRuled = ruled > 0;
      } catch (e) {
        console.warn(LOG_TAG, 'chip-active-for scan failed', e);
      }
      // One global one-shot wake-up for the earliest pending chip.
      try {
        if (self._wakeTimer) {
          clearTimeout(self._wakeTimer);
          self._wakeTimer = null;
        }
        if (earliest > 0 && isFinite(earliest) && earliest < 2147483647) {
          self._wakeTimer = setTimeout(function () {
            self._wakeTimer = null;
            try {
              self.scan();
            } catch (e) {
              // ignore
            }
          }, earliest + 300);
        }
      } catch (e) {
        // ignore
      }
    },

    // Host `_config` first; only when absent, the parent
    // mushroom-chips-card `_config.chips[index]` by sibling index.
    _resolveConfig: function (host) {
      try {
        let cfg = null;
        try {
          cfg = host._config || null;
        } catch (e) {
          cfg = null;
        }
        if (cfg && typeof cfg === 'object') return cfg;
        try {
          return this._fallbackChipConfig(host);
        } catch (e) {
          return null;
        }
      } catch (e) {
        return null;
      }
    },

    // Climb getRootNode().host until the owning mushroom-chips-card, then
    // map the host to its sibling index inside .chip-container.
    _fallbackChipConfig: function (host) {
      try {
        let cur = null;
        try {
          const root = host.getRootNode ? host.getRootNode() : null;
          cur = (root && root.host) || host.parentNode || null;
        } catch (e) {
          cur = null;
        }
        let card = null;
        for (let hops = 0; cur && hops < 6; hops++) {
          let tag = '';
          try {
            tag = ((cur.tagName || '') + '').toUpperCase();
          } catch (e) {
            tag = '';
          }
          if (tag === 'MUSHROOM-CHIPS-CARD') {
            card = cur;
            break;
          }
          let next = null;
          try {
            const r = cur.getRootNode ? cur.getRootNode() : null;
            next = (r && r.host) || cur.parentNode || null;
          } catch (e) {
            next = null;
          }
          if (!next || next === cur) break;
          cur = next;
        }
        if (!card) return null;
        let cardCfg = null;
        try {
          cardCfg = card._config || null;
        } catch (e) {
          cardCfg = null;
        }
        if (!cardCfg || !Array.isArray(cardCfg.chips)) return null;
        let container = null;
        try {
          container = card.shadowRoot
            ? card.shadowRoot.querySelector('.chip-container')
            : null;
        } catch (e) {
          container = null;
        }
        if (!container) return null;
        let el = host;
        for (let guard = 0; el && el.parentNode !== container && guard < 6; guard++) {
          el = el.parentNode;
        }
        if (!el || el.parentNode !== container) return null;
        const idx = Array.prototype.indexOf.call(container.children, el);
        if (idx < 0 || idx >= cardCfg.chips.length) return null;
        const chipCfg = cardCfg.chips[idx];
        return chipCfg && typeof chipCfg === 'object' ? chipCfg : null;
      } catch (e) {
        return null;
      }
    },

    _durationRaw: function (obj) {
      try {
        if (!obj || typeof obj !== 'object') return undefined;
        if (obj.for !== undefined && obj.for !== null) return obj.for;
        if (obj.active_for !== undefined && obj.active_for !== null) {
          return obj.active_for;
        }
        if (obj.show_for !== undefined && obj.show_for !== null) return obj.show_for;
        if (obj.duration !== undefined && obj.duration !== null) return obj.duration;
      } catch (e) {
        // ignore
      }
      return undefined;
    },

    // Config -> rule ({kind:'single',...} | {kind:'all',...}) or null for
    // "no parseable duration: leave to Mushroom".
    _ruleFromConfig: function (cfg) {
      try {
        if (!cfg || typeof cfg !== 'object') return null;
        if (cfg.type === 'conditional' && Array.isArray(cfg.conditions)) {
          const conds = [];
          let hasTimed = false;
          for (let i = 0; i < cfg.conditions.length; i++) {
            const c = cfg.conditions[i];
            if (!c || typeof c !== 'object') return null;
            if (typeof c.entity !== 'string' || !c.entity) return null;
            let secs = null;
            const raw = this._durationRaw(c);
            if (raw !== undefined) {
              const parsed = parseForDuration(raw);
              if (parsed !== null) {
                secs = parsed;
                hasTimed = true;
              }
              // Unparseable `for:` degrades to a plain state check.
            }
            conds.push({
              entity: c.entity,
              state: c.state,
              state_not: c.state_not,
              forSeconds: secs,
            });
          }
          if (!conds.length || !hasTimed) return null;
          return { kind: 'all', conditions: conds };
        }
        if (typeof cfg.entity !== 'string' || !cfg.entity) return null;
        const praw = this._durationRaw(cfg);
        if (praw === undefined) return null;
        const psecs = parseForDuration(praw);
        if (psecs === null) return null;
        let st =
          cfg.state !== undefined && cfg.state !== null
            ? cfg.state
            : cfg.active_state;
        if (st === undefined || st === null) st = 'on';
        const rule = { kind: 'single', entity: cfg.entity, state: st, forSeconds: psecs };
        if (cfg.state_not !== undefined && cfg.state_not !== null) {
          rule.state_not = cfg.state_not;
        }
        return rule;
      } catch (e) {
        return null;
      }
    },

    _evaluateRule: function (rule, states, nowMs) {
      try {
        if (!rule || !states) return { met: false, waitMs: 0 };
        if (rule.kind === 'all') {
          let allMet = true;
          let earliest = 0;
          for (let i = 0; i < rule.conditions.length; i++) {
            const c = rule.conditions[i];
            const r = isRuleMet(states[c.entity], c, nowMs);
            if (!r.met) {
              allMet = false;
              if (r.waitMs > 0 && (!(earliest > 0) || r.waitMs < earliest)) {
                earliest = r.waitMs;
              }
            }
          }
          return { met: allMet, waitMs: allMet ? 0 : earliest };
        }
        return isRuleMet(states[rule.entity], rule, nowMs);
      } catch (e) {
        return { met: false, waitMs: 0 };
      }
    },
  };

  /* ================================================================
   * Tweak 7: Drag sidebar items to reorder them
   * - Delegated pointer handlers only: no observers, no timers, no work
   *   unless a pointer is actually down on a sidebar panel item.
   * - Persists through HA's own sidebar user data (frontend/set_user_data,
   *   key "sidebar"), the same store Edit sidebar writes. So the order
   *   syncs per user across devices and both UIs stay consistent.
   * - Lit owns the list, so the drag never moves real nodes: it shows a
   *   floating clone + an insertion line, then saves and lets HA re-render
   *   from the new order (no snap-back, no broken click handlers).
   * ================================================================ */
  const SIDEBAR_ITEM_PREFIX = 'sidebar-panel-';
  const SIDEBAR_HOLD_MS = 320;
  const SIDEBAR_MOUSE_THRESHOLD_PX = 5;
  const SIDEBAR_TOUCH_CANCEL_PX = 10;
  const SIDEBAR_AUTOSCROLL_EDGE_PX = 48;
  const SIDEBAR_AUTOSCROLL_STEP_PX = 9;

  const SidebarDragTweak = {
    id: 'sidebar-drag',
    name: 'Drag to reorder sidebar',
    description:
      'Hold and drag sidebar items to rearrange them. Saves to Home Assistant\u2019s sidebar order, so it syncs across devices and matches Edit sidebar.',
    defaultEnabled: true,

    _onPointerDown: null,
    _onPointerMove: null,
    _onPointerUp: null,
    _onClickCapture: null,
    _onTouchMove: null,
    _onKeyDown: null,
    _drag: null,
    _holdTimer: null,
    _scrollFrame: null,
    _swallowClickUntil: 0,

    init: function () {
      const self = this;
      this._onPointerDown = function (ev) {
        try {
          self._handlePointerDown(ev);
        } catch (e) {
          console.warn(LOG_TAG, 'sidebar-drag pointerdown failed', e);
        }
      };
      this._onPointerMove = function (ev) {
        try {
          self._handlePointerMove(ev);
        } catch (e) {
          // ignore
        }
      };
      this._onPointerUp = function (ev) {
        try {
          self._handlePointerUp(ev);
        } catch (e) {
          self._cancelDrag();
        }
      };
      this._onClickCapture = function (ev) {
        try {
          if (Date.now() < self._swallowClickUntil) {
            if (ev.cancelable) ev.preventDefault();
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
          }
        } catch (e) {
          // ignore
        }
      };
      // Non-passive: once a drag is active we must stop the list from scrolling.
      this._onTouchMove = function (ev) {
        try {
          if (self._drag && self._drag.active && ev.cancelable) ev.preventDefault();
        } catch (e) {
          // ignore
        }
      };
      this._onKeyDown = function (ev) {
        try {
          if (ev && ev.key === 'Escape' && self._drag) self._cancelDrag();
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('pointerdown', this._onPointerDown, {
        capture: true,
        passive: true,
      });
      window.addEventListener('pointermove', this._onPointerMove, {
        capture: true,
        passive: true,
      });
      window.addEventListener('pointerup', this._onPointerUp, {
        capture: true,
        passive: true,
      });
      window.addEventListener('pointercancel', this._onPointerUp, {
        capture: true,
        passive: true,
      });
      window.addEventListener('click', this._onClickCapture, { capture: true });
      window.addEventListener('touchmove', this._onTouchMove, {
        capture: true,
        passive: false,
      });
      window.addEventListener('keydown', this._onKeyDown, { capture: true });
    },

    destroy: function () {
      if (this._onPointerDown) {
        window.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
        this._onPointerDown = null;
      }
      if (this._onPointerMove) {
        window.removeEventListener('pointermove', this._onPointerMove, { capture: true });
        this._onPointerMove = null;
      }
      if (this._onPointerUp) {
        window.removeEventListener('pointerup', this._onPointerUp, { capture: true });
        window.removeEventListener('pointercancel', this._onPointerUp, { capture: true });
        this._onPointerUp = null;
      }
      if (this._onClickCapture) {
        window.removeEventListener('click', this._onClickCapture, { capture: true });
        this._onClickCapture = null;
      }
      if (this._onTouchMove) {
        window.removeEventListener('touchmove', this._onTouchMove, { capture: true });
        this._onTouchMove = null;
      }
      if (this._onKeyDown) {
        window.removeEventListener('keydown', this._onKeyDown, { capture: true });
        this._onKeyDown = null;
      }
      this._cancelDrag();
    },

    onNavigate: function () {
      // A route change can re-render the sidebar; drop any stale drag state.
      this._cancelDrag();
    },

    /* ---------- discovery ---------- */

    _sidebar: function () {
      try {
        return querySelectorDeep('ha-sidebar');
      } catch (e) {
        return null;
      }
    },

    _root: function () {
      const sidebar = this._sidebar();
      try {
        return (sidebar && (sidebar.shadowRoot || sidebar)) || null;
      } catch (e) {
        return sidebar || null;
      }
    },

    _list: function () {
      const root = this._root();
      if (!root || typeof root.querySelector !== 'function') return null;
      try {
        return (
          root.querySelector('ha-list-nav.before-spacer') ||
          root.querySelector('.before-spacer') ||
          null
        );
      } catch (e) {
        return null;
      }
    },

    _items: function () {
      const out = [];
      const list = this._list();
      if (!list || typeof list.querySelectorAll !== 'function') return out;
      try {
        const nodes = list.querySelectorAll(
          'ha-list-item-button[id^="' + SIDEBAR_ITEM_PREFIX + '"],a[id^="' + SIDEBAR_ITEM_PREFIX + '"]'
        );
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i] && nodes[i].parentNode) out.push(nodes[i]);
        }
      } catch (e) {
        // ignore
      }
      return out;
    },

    _itemFromPath: function (path) {
      if (!path || !path.length) return null;
      for (let i = 0; i < path.length; i++) {
        const el = path[i];
        if (!el || typeof el !== 'object' || el.nodeType !== 1) continue;
        let tag = '';
        try {
          tag = ((el.tagName || '') + '').toUpperCase();
        } catch (e) {
          tag = '';
        }
        if (tag !== 'HA-LIST-ITEM-BUTTON' && tag !== 'A') continue;
        const id = (el.id || '') + '';
        if (id.indexOf(SIDEBAR_ITEM_PREFIX) !== 0) continue;
        // Only the main (scrollable) nav is reorderable; the fixed block
        // (Settings / notifications / profile) is intentionally not.
        try {
          if (typeof el.closest === 'function' && !el.closest('.before-spacer')) {
            continue;
          }
        } catch (e) {
          // keep it
        }
        return el;
      }
      return null;
    },

    _urlPath: function (el) {
      try {
        return ((el && el.id) || '').slice(SIDEBAR_ITEM_PREFIX.length);
      } catch (e) {
        return '';
      }
    },

    /* ---------- gesture ---------- */

    _handlePointerDown: function (ev) {
      if (!ev || ev.isPrimary === false) return;
      if (this._drag) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      const path =
        typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
      const item = this._itemFromPath(path);
      if (!item) return;
      if (this._items().length < 2) return;
      const self = this;
      this._drag = {
        item: item,
        pointerId: ev.pointerId,
        pointerType: ev.pointerType || 'mouse',
        startX: typeof ev.clientX === 'number' ? ev.clientX : 0,
        startY: typeof ev.clientY === 'number' ? ev.clientY : 0,
        active: false,
        ghost: null,
        indicator: null,
        offsetY: 0,
        rect: null,
        dropIndex: 0,
      };
      // Touch has no hover cue, so a short hold lifts the item before dragging.
      // Mouse/pen lift as soon as the pointer actually moves.
      if (this._drag.pointerType === 'touch') {
        this._holdTimer = setTimeout(function () {
          self._holdTimer = null;
          try {
            if (self._drag && !self._drag.active) self._beginDrag(self._drag.startX, self._drag.startY);
          } catch (e) {
            self._cancelDrag();
          }
        }, SIDEBAR_HOLD_MS);
      }
    },

    _handlePointerMove: function (ev) {
      const drag = this._drag;
      if (!drag) return;
      if (drag.pointerId !== undefined && ev.pointerId !== drag.pointerId) return;
      const x = typeof ev.clientX === 'number' ? ev.clientX : 0;
      const y = typeof ev.clientY === 'number' ? ev.clientY : 0;
      if (!drag.active) {
        const dx = x - drag.startX;
        const dy = y - drag.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (drag.pointerType === 'touch') {
          // Moving before the hold fires means the user is scrolling.
          if (dist > SIDEBAR_TOUCH_CANCEL_PX) this._cancelDrag();
          return;
        }
        if (dist > SIDEBAR_MOUSE_THRESHOLD_PX) this._beginDrag(x, y);
        return;
      }
      this._moveDrag(x, y);
    },

    _handlePointerUp: function () {
      if (!this._drag) return;
      if (this._drag.active) this._finishDrag();
      else this._cancelDrag();
    },

    _beginDrag: function (x, y) {
      const drag = this._drag;
      if (!drag) return;
      const item = drag.item;
      let rect = null;
      try {
        rect = item.getBoundingClientRect();
      } catch (e) {
        rect = null;
      }
      if (!rect || !rect.height) {
        this._cancelDrag();
        return;
      }
      drag.active = true;
      drag.rect = rect;
      drag.offsetY = Math.max(0, Math.min(rect.height, y - rect.top));
      this._clearHoldTimer();

      const root = this._root();
      if (!root || typeof root.appendChild !== 'function') {
        this._cancelDrag();
        return;
      }

      // Floating clone, appended inside ha-sidebar's shadow root so it picks
      // up the sidebar's own item styles instead of looking foreign.
      let ghost = null;
      try {
        ghost = item.cloneNode(true);
      } catch (e) {
        ghost = null;
      }
      if (ghost) {
        try {
          ghost.removeAttribute('id');
          ghost.removeAttribute('href');
          ghost.removeAttribute('aria-current');
          if (ghost.classList) ghost.classList.remove('selected');
          ghost.setAttribute('data-ha-tweaks', 'sidebar-drag-ghost');
          ghost.style.cssText = [
            'position:fixed',
            'left:' + rect.left + 'px',
            'top:' + rect.top + 'px',
            'width:' + rect.width + 'px',
            'margin:0',
            'z-index:999999',
            'pointer-events:none',
            'opacity:0.98',
            'transform:scale(1.03)',
            'box-shadow:0 10px 28px rgba(0,0,0,0.32)',
            'border-radius:var(--ha-border-radius-sm,8px)',
            'transition:box-shadow 120ms ease-out, transform 120ms ease-out',
          ].join(';');
          root.appendChild(ghost);
        } catch (e) {
          ghost = null;
        }
      }
      drag.ghost = ghost;

      // Insertion line: fixed so it is never clipped by the scroll container.
      let indicator = null;
      try {
        indicator = document.createElement('div');
        indicator.setAttribute('data-ha-tweaks', 'sidebar-drag-indicator');
        indicator.style.cssText = [
          'position:fixed',
          'left:' + rect.left + 'px',
          'top:' + rect.top + 'px',
          'width:' + rect.width + 'px',
          'height:3px',
          'margin:0',
          'padding:0',
          'border:0',
          'border-radius:2px',
          'background:var(--primary-color,#03a9f4)',
          'box-shadow:0 0 6px var(--primary-color,#03a9f4)',
          'pointer-events:none',
          'z-index:999998',
          'opacity:0',
          'transition:top 90ms cubic-bezier(0.2,0.7,0.3,1),opacity 90ms linear',
        ].join(';');
        root.appendChild(indicator);
      } catch (e) {
        indicator = null;
      }
      drag.indicator = indicator;

      try {
        item.style.transition = 'opacity 120ms ease-out';
        item.style.opacity = '0.25';
      } catch (e) {
        // ignore
      }
      // Any click that lands at the end of the drag is the drag, not a nav.
      this._swallowClickUntil = Date.now() + 600;
      this._moveDrag(x, y);
    },

    _moveDrag: function (x, y) {
      const drag = this._drag;
      if (!drag || !drag.active) return;
      drag.lastX = x;
      drag.lastY = y;
      if (drag.ghost) {
        try {
          drag.ghost.style.top = y - drag.offsetY + 'px';
        } catch (e) {
          // ignore
        }
      }
      const target = this._insertionTarget(y);
      drag.dropIndex = target.index;
      if (drag.indicator) {
        try {
          if (target.rect) {
            drag.indicator.style.top = target.top + 'px';
            drag.indicator.style.left = target.rect.left + 'px';
            drag.indicator.style.width = target.rect.width + 'px';
            drag.indicator.style.opacity = '1';
          } else {
            drag.indicator.style.opacity = '0';
          }
        } catch (e) {
          // ignore
        }
      }
      this._autoScroll(y);
    },

    // Index in the list WITHOUT the dragged item, plus the line position.
    _insertionTarget: function (y) {
      const drag = this._drag;
      const items = this._items();
      let index = 0;
      let lineTop = 0;
      let refRect = null;
      let lastRect = null;
      for (let i = 0; i < items.length; i++) {
        const el = items[i];
        if (drag && el === drag.item) continue;
        let rect = null;
        try {
          rect = el.getBoundingClientRect();
        } catch (e) {
          rect = null;
        }
        if (!rect || !rect.height) continue;
        if (!refRect) refRect = rect;
        lastRect = rect;
        if (y < rect.top + rect.height / 2) {
          return { index: index, top: rect.top - 2, rect: rect };
        }
        index++;
      }
      return {
        index: index,
        top: lastRect ? lastRect.bottom - 1 : 0,
        rect: refRect,
      };
    },

    _autoScroll: function (y) {
      const self = this;
      const list = this._list();
      if (!list) return;
      let rect = null;
      try {
        rect = list.getBoundingClientRect();
      } catch (e) {
        return;
      }
      let dir = 0;
      if (rect.height > 0 && list.scrollHeight > list.clientHeight + 4) {
        if (y < rect.top + SIDEBAR_AUTOSCROLL_EDGE_PX) dir = -1;
        else if (y > rect.bottom - SIDEBAR_AUTOSCROLL_EDGE_PX) dir = 1;
      }
      if (dir === 0) {
        this._stopAutoScroll();
        return;
      }
      if (this._scrollFrame !== null) return;
      const step = function () {
        self._scrollFrame = null;
        const drag = self._drag;
        if (!drag || !drag.active) return;
        const el = self._list();
        if (!el) return;
        const before = el.scrollTop;
        el.scrollTop = before + dir * SIDEBAR_AUTOSCROLL_STEP_PX;
        if (el.scrollTop !== before) {
          // Keep the ghost and line in step while the list moves under them.
          try {
            self._moveDrag(drag.lastX || 0, drag.lastY || 0);
          } catch (e) {
            // ignore
          }
        }
        self._scrollFrame = requestAnimationFrame(step);
      };
      this._scrollFrame = requestAnimationFrame(step);
    },

    _stopAutoScroll: function () {
      if (this._scrollFrame !== null) {
        try {
          cancelAnimationFrame(this._scrollFrame);
        } catch (e) {
          // ignore
        }
        this._scrollFrame = null;
      }
    },

    _finishDrag: function () {
      const drag = this._drag;
      if (!drag) return;
      const items = this._items();
      const order = [];
      let draggedPath = '';
      for (let i = 0; i < items.length; i++) {
        const p = this._urlPath(items[i]);
        if (!p) continue;
        if (items[i] === drag.item) {
          draggedPath = p;
          continue;
        }
        order.push(p);
      }
      if (draggedPath) {
        let at = typeof drag.dropIndex === 'number' ? drag.dropIndex : order.length;
        if (at < 0) at = 0;
        if (at > order.length) at = order.length;
        order.splice(at, 0, draggedPath);
      }
      this._cleanupDrag();
      if (!draggedPath || !order.length) return;
      this._saveOrder(order);
    },

    _cancelDrag: function () {
      this._cleanupDrag();
    },

    _clearHoldTimer: function () {
      if (this._holdTimer) {
        try {
          clearTimeout(this._holdTimer);
        } catch (e) {
          // ignore
        }
        this._holdTimer = null;
      }
    },

    _cleanupDrag: function () {
      const drag = this._drag;
      this._clearHoldTimer();
      this._stopAutoScroll();
      if (drag) {
        try {
          if (drag.ghost && drag.ghost.parentNode) {
            drag.ghost.parentNode.removeChild(drag.ghost);
          }
        } catch (e) {
          // ignore
        }
        try {
          if (drag.indicator && drag.indicator.parentNode) {
            drag.indicator.parentNode.removeChild(drag.indicator);
          }
        } catch (e) {
          // ignore
        }
        try {
          if (drag.item) {
            drag.item.style.opacity = '';
            drag.item.style.transition = '';
          }
        } catch (e) {
          // ignore
        }
      }
      this._drag = null;
    },

    /* ---------- persistence ---------- */

    // Writes the same payload Edit sidebar writes. Panels that are currently
    // hidden or not visible keep their existing slot at the end, so dragging
    // never silently unhides anything.
    _saveOrder: function (visibleOrder) {
      const hass = getHass();
      if (!hass || typeof hass.callWS !== 'function') {
        toast('HA Tweaks: lost connection to Home Assistant');
        return;
      }
      const sidebar = this._sidebar();
      let hidden = [];
      let previous = [];
      try {
        if (sidebar && Array.isArray(sidebar._hiddenPanels)) {
          hidden = sidebar._hiddenPanels.slice();
        } else if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('sidebarHiddenPanels');
          const parsed = raw ? JSON.parse(raw) : null;
          if (Array.isArray(parsed)) hidden = parsed;
        }
      } catch (e) {
        hidden = [];
      }
      try {
        if (sidebar && Array.isArray(sidebar._panelOrder)) {
          previous = sidebar._panelOrder.slice();
        } else if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('sidebarPanelOrder');
          const parsed = raw ? JSON.parse(raw) : null;
          if (Array.isArray(parsed)) previous = parsed;
        }
      } catch (e) {
        previous = [];
      }
      const merged = visibleOrder.slice();
      for (let i = 0; i < previous.length; i++) {
        const p = previous[i];
        if (typeof p === 'string' && p && merged.indexOf(p) < 0) merged.push(p);
      }
      hass
        .callWS({
          type: 'frontend/set_user_data',
          key: 'sidebar',
          value: { panelOrder: merged, hiddenPanels: hidden },
        })
        .catch(function (err) {
          console.warn(LOG_TAG, 'sidebar-drag save failed', err);
          toast('Could not save the sidebar order');
        });
    },
  };

  /* ================================================================
   * Settings page: HA quick-bar inspired, pointer/touch-driven.
   * Search field + filter chips + flat rows with icon, headline,
   * supporting text and a trailing switch. Applies immediately.
   * ================================================================ */
  const SETTINGS_ICONS = {
    'automation-context-menu': 'mdi:robot',
    'editor-row-context-menu': 'mdi:form-select',
    'dashboard-empty-menu': 'mdi:view-dashboard',
    'auto-collapse-editor': 'mdi:arrow-collapse-all',
    'right-click-hold': 'mdi:mouse-right-click',
    'chip-active-for': 'mdi:chip',
    'sidebar-drag': 'mdi:drag',
  };

  const MENU_ITEM_ICONS = {
    edit: 'mdi:pencil',
    delete: 'mdi:delete-outline',
    duplicate: 'mdi:content-duplicate',
    copy: 'mdi:content-copy',
    paste: 'mdi:content-paste',
    cut: 'mdi:content-cut',
    yaml: 'mdi:file-code-outline',
    enabled: 'mdi:toggle-switch-outline',
    run: 'mdi:play',
    'new-automation': 'mdi:robot',
    'new-script': 'mdi:script-text',
  };

  const SettingsModal = {
    _open: false,
    _dialogEl: null,
    _backdropEl: null,
    _listEl: null,
    _searchEl: null,
    _chipsEl: null,
    _onKeyDown: null,
    _query: '',
    _section: 'all',

    toggle: function () {
      if (this._open) this.close();
      else this.open();
    },

    open: function () {
      if (this._open) return;
      this._open = true;
      this._query = '';
      this._section = 'all';
      const self = this;

      const backdrop = document.createElement('div');
      backdrop.setAttribute('data-ha-tweaks', 'settings-backdrop');
      backdrop.style.cssText =
        'position:fixed;inset:0;z-index:999998;' +
        'background:var(--mdc-dialog-scrim-color,rgba(0,0,0,0.45));' +
        'margin:0;padding:0;border:0;';
      backdrop.addEventListener('click', function () {
        self.close();
      });
      document.body.appendChild(backdrop);
      this._backdropEl = backdrop;

      const dialog = document.createElement('div');
      dialog.setAttribute('data-ha-tweaks', 'settings-dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'ha-tweaks-title');
      dialog.style.cssText = [
        'position:fixed',
        'z-index:999999',
        'left:50%',
        'top:max(16px,env(safe-area-inset-top,0px))',
        'transform:translateX(-50%)',
        'width:min(580px,calc(100vw - 32px))',
        'height:min(760px,calc(100dvh - 48px))',
        'min-height:min(620px,calc(100dvh - 48px))',
        'max-height:calc(100dvh - 48px)',
        'display:flex',
        'flex-direction:column',
        'padding:0',
        'margin:0',
        'background:var(--card-background-color,#ffffff)',
        'color:var(--primary-text-color,#212121)',
        'border:0',
        'border-radius:var(--ha-border-radius-3xl,28px)',
        'box-shadow:var(--ha-shadow-l,0 12px 40px rgba(0,0,0,0.35))',
        'font-family:inherit',
        'overflow:hidden',
        'outline:none',
      ].join(';');

      const title = document.createElement('div');
      title.setAttribute('id', 'ha-tweaks-title');
      title.textContent = 'Home Assistant Tweaks v' + HA_TWEAKS_VERSION;
      title.style.cssText =
        'position:absolute;width:1px;height:1px;padding:0;margin:-1px;' +
        'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
      dialog.appendChild(title);

      const searchWrap = document.createElement('div');
      searchWrap.style.cssText =
        'position:relative;display:flex;align-items:center;' +
        'padding:16px 16px 12px 16px;flex:0 0 auto;';
      const searchIcon = document.createElement('ha-icon');
      searchIcon.setAttribute('icon', 'mdi:magnify');
      searchIcon.style.cssText =
        'position:absolute;left:28px;top:27px;--mdc-icon-size:24px;' +
        'color:var(--primary-text-color,#212121);pointer-events:none;';
      const input = document.createElement('input');
      input.type = 'search';
      input.setAttribute('tabindex', '-1');
      input.setAttribute('aria-label', 'Search Home Assistant Tweaks settings');
      input.placeholder = 'Search Home Assistant Tweaks';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.style.cssText = [
        'width:100%',
        'height:52px',
        'padding:0 16px 0 48px',
        'border:1px solid var(--primary-color,#03a9f4)',
        'border-radius:var(--ha-border-radius-md,8px)',
        'background:transparent',
        'color:var(--primary-text-color,#212121)',
        'font-family:inherit',
        'font-size:16px',
        'font-weight:400',
        'text-align:left',
        'outline:none',
      ].join(';');
      input.addEventListener('input', function (ev) {
        try {
          self._query = String((ev.target && ev.target.value) || '');
          self._renderList();
        } catch (e) {
          // keep typing usable even if rendering fails once
        }
      });
      searchWrap.appendChild(searchIcon);
      searchWrap.appendChild(input);
      dialog.appendChild(searchWrap);
      this._searchEl = input;

      const chips = document.createElement('div');
      chips.setAttribute('data-ha-tweaks', 'settings-chips');
      chips.setAttribute('tabindex', '-1');
      chips.style.cssText = [
        'display:flex',
        'align-items:center',
        'flex-wrap:nowrap',
        'gap:8px',
        'padding:0 16px 12px 16px',
        'overflow-x:auto',
        'overflow-y:hidden',
        'flex:0 0 auto',
      ].join(';');
      [
        { id: 'all', label: 'All' },
        { id: 'tweak', label: 'Tweaks' },
        { id: 'separator', separator: true },
        { id: 'item', label: 'Menu items' },
      ].forEach(function (def) {
        if (def.separator) {
          const separator = document.createElement('div');
          separator.setAttribute('aria-hidden', 'true');
          separator.style.cssText =
            'flex:0 0 auto;width:1px;height:32px;' +
            'border:0;background:var(--ha-color-border-neutral-quiet,var(--divider-color,#e0e0e0));';
          chips.appendChild(separator);
          return;
        }
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.setAttribute('tabindex', '-1');
        chip.setAttribute('data-ha-tweaks-section', def.id);
        chip.setAttribute('aria-pressed', def.id === self._section ? 'true' : 'false');
        chip.style.cssText = [
          'flex:0 0 auto',
          'display:inline-flex',
          'align-items:center',
          'justify-content:center',
          'gap:8px',
          'height:40px',
          'padding:0 16px',
          'border:1px solid var(--ha-color-border-neutral-quiet,var(--divider-color,#e0e0e0))',
          'border-radius:var(--ha-border-radius-md,8px)',
          'background:transparent',
          'color:var(--primary-color,#03a9f4)',
          'font-family:inherit',
          'font-size:14px',
          'font-weight:500',
          'line-height:1',
          'cursor:pointer',
          'outline:none',
          'white-space:nowrap',
        ].join(';');
        const check = document.createElement('ha-icon');
        check.setAttribute('icon', 'mdi:check');
        check.style.cssText =
          '--mdc-icon-size:18px;color:inherit;display:none;flex:0 0 auto;';
        const label = document.createElement('span');
        label.textContent = def.label;
        chip.appendChild(check);
        chip.appendChild(label);
        chip.addEventListener('click', function () {
          self._section = def.id;
          self._render();
        });
        chip._haTweaksCheck = check;
        chips.appendChild(chip);
      });
      dialog.appendChild(chips);
      this._chipsEl = chips;

      const list = document.createElement('div');
      list.setAttribute('data-ha-tweaks', 'settings-list');
      list.setAttribute('tabindex', '-1');
      list.style.cssText = [
        'flex:1 1 auto',
        'min-height:0',
        'overflow-y:auto',
        'overflow-x:hidden',
        'padding:4px 0 16px 0',
        'border-top:1px solid transparent',
      ].join(';');
      list.addEventListener('scroll', function () {
        list.style.borderTop = list.scrollTop > 0
          ? '1px solid var(--ha-color-border-neutral-quiet,var(--divider-color,#e0e0e0))'
          : '1px solid transparent';
      }, { passive: true });
      dialog.appendChild(list);
      this._listEl = list;

      document.body.appendChild(dialog);
      this._dialogEl = dialog;

      this._onKeyDown = function (ev) {
        try {
          if (ev && ev.key === 'Escape') self.close();
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('keydown', this._onKeyDown, { capture: true });

      this._render();
    },

    _getEntries: function () {
      const entries = [];
      TweakRegistry.tweaks.forEach(function (tweak) {
        entries.push({
          key: 'tweak:' + tweak.id,
          type: 'tweak',
          group: 'tweak',
          id: tweak.id,
          title: tweak.name,
          subtitle: tweak.description || 'Tweak',
          parentTitle: tweak.name,
          icon: SETTINGS_ICONS[tweak.id] || 'mdi:tune',
          enabled: !!TweakRegistry.enabled[tweak.id],
          tweak: tweak,
          item: null,
        });
        (tweak.menuItems || []).forEach(function (item) {
          entries.push({
            key: 'item:' + tweak.id + '.' + item.id,
            type: 'item',
            group: 'item',
            id: tweak.id + '.' + item.id,
            title: item.label,
            subtitle: 'Menu item in ' + tweak.name,
            parentTitle: tweak.name,
            icon: MENU_ITEM_ICONS[item.id] || SETTINGS_ICONS[tweak.id] || 'mdi:circle-medium',
            enabled: isItemEnabled(tweak.id, item.id),
            tweak: tweak,
            item: item,
          });
        });
      });
      return entries;
    },

    _filteredEntries: function () {
      const section = this._section;
      const terms = String(this._query || '')
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      return this._getEntries().filter(function (entry) {
        if (section !== 'all' && entry.group !== section) return false;
        if (!terms.length) return true;
        const haystack = [
          entry.title,
          entry.subtitle,
          entry.id,
          entry.parentTitle,
          entry.type,
          entry.group,
        ].join(' ').toLowerCase();
        return terms.every(function (term) {
          return haystack.indexOf(term) !== -1;
        });
      });
    },

    _render: function () {
      this._renderChips();
      this._renderList();
    },

    _renderChips: function () {
      const chips = this._chipsEl;
      if (!chips) return;
      const selected = this._section;
      chips.querySelectorAll('[data-ha-tweaks-section]').forEach((chip) => {
        const isSelected = chip.getAttribute('data-ha-tweaks-section') === selected;
        chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        chip.style.background = isSelected
          ? 'var(--ha-color-fill-primary-normal-hover,#0f4c5f)'
          : 'transparent';
        chip.style.borderColor = isSelected
          ? 'var(--ha-color-fill-primary-normal-hover,#0f4c5f)'
          : 'var(--ha-color-border-neutral-quiet,var(--divider-color,#e0e0e0))';
        chip.style.color = isSelected
          ? 'var(--white-color,#ffffff)'
          : 'var(--primary-color,#03a9f4)';
        chip.style.fontWeight = isSelected ? '600' : '500';
        if (chip._haTweaksCheck) {
          chip._haTweaksCheck.style.display = isSelected ? 'block' : 'none';
        }
      });
    },

    _renderList: function () {
      const list = this._listEl;
      if (!list) return;
      const self = this;
      while (list.firstChild) {
        try {
          list.removeChild(list.firstChild);
        } catch (e) {
          break;
        }
      }
      const entries = this._filteredEntries();
      if (!entries.length) {
        list.appendChild(this._makeEmptyState());
        return;
      }
      entries.forEach(function (entry) {
        list.appendChild(self._makeRow(entry));
      });
    },

    _makeEmptyState: function () {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:16px;width:100%;' +
        'padding:20px;color:var(--secondary-text-color,#727272);';
      const icon = document.createElement('ha-icon');
      icon.setAttribute('icon', 'mdi:magnify');
      icon.style.cssText = '--mdc-icon-size:24px;color:inherit;flex:0 0 auto;';
      const text = document.createElement('div');
      text.style.cssText = 'min-width:0;';
      const headline = document.createElement('div');
      headline.textContent = 'Nothing found';
      headline.style.cssText =
        'font-size:14px;font-weight:500;color:var(--primary-text-color,#212121);';
      const supporting = document.createElement('div');
      supporting.textContent = 'Try a different search or filter.';
      supporting.style.cssText = 'margin-top:2px;font-size:12px;color:inherit;';
      text.appendChild(headline);
      text.appendChild(supporting);
      row.appendChild(icon);
      row.appendChild(text);
      return row;
    },

    _makeRow: function (entry) {
      const self = this;
      const enabled = !!entry.enabled;
      const row = document.createElement('button');
      row.type = 'button';
      row.setAttribute('role', 'switch');
      row.setAttribute('tabindex', '-1');
      row.setAttribute('aria-checked', enabled ? 'true' : 'false');
      row.setAttribute('data-ha-tweaks-setting-row', entry.key);
      row.setAttribute('data-ha-tweaks-group', entry.group);
      row.title = (enabled ? 'Disable ' : 'Enable ') + entry.title;
      row.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:16px',
        'width:100%',
        'min-height:64px',
        'padding:10px 20px',
        'border:0',
        'background:transparent',
        'color:var(--primary-text-color,#212121)',
        'text-align:left',
        'cursor:pointer',
        'font-family:inherit',
        'outline:none',
      ].join(';');
      row.addEventListener('mouseenter', function () {
        row.style.background = 'var(--ha-color-fill-neutral-quiet-hover,var(--secondary-background-color,#eeeeee))';
      });
      row.addEventListener('mouseleave', function () {
        row.style.background = 'transparent';
      });

      const icon = document.createElement('ha-icon');
      icon.setAttribute('icon', entry.icon);
      icon.style.cssText =
        'flex:0 0 auto;--mdc-icon-size:24px;' +
        'color:var(--secondary-text-color,#727272);';
      row.appendChild(icon);

      const text = document.createElement('div');
      text.style.cssText = 'flex:1 1 auto;min-width:0;';
      const headline = document.createElement('div');
      headline.textContent = entry.title;
      headline.style.cssText =
        'font-size:14px;font-weight:500;line-height:1.35;' +
        'color:var(--primary-text-color,#212121);' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      const supporting = document.createElement('div');
      supporting.textContent = entry.subtitle;
      supporting.style.cssText = [
        'margin-top:2px',
        'font-size:12px',
        'line-height:1.35',
        'color:var(--secondary-text-color,#727272)',
        'display:-webkit-box',
        '-webkit-line-clamp:2',
        '-webkit-box-orient:vertical',
        'overflow:hidden',
      ].join(';');
      text.appendChild(headline);
      text.appendChild(supporting);
      row.appendChild(text);

      const switchVisual = document.createElement('div');
      switchVisual.setAttribute('aria-hidden', 'true');
      switchVisual.style.cssText = [
        'position:relative',
        'flex:0 0 auto',
        'width:36px',
        'height:20px',
        'border-radius:10px',
        'background:var(--disabled-text-color,#bdbdbd)',
        'transition:background 120ms ease-in-out',
      ].join(';');
      const knob = document.createElement('div');
      knob.style.cssText = [
        'position:absolute',
        'top:3px',
        'left:3px',
        'width:14px',
        'height:14px',
        'border-radius:50%',
        'background:#ffffff',
        'box-shadow:0 1px 3px rgba(0,0,0,0.3)',
        'transition:left 120ms ease-in-out',
      ].join(';');
      switchVisual.appendChild(knob);
      row.appendChild(switchVisual);

      function paint() {
        const on = row.getAttribute('aria-checked') === 'true';
        switchVisual.style.background = on
          ? 'var(--primary-color,#03a9f4)'
          : 'var(--disabled-text-color,#bdbdbd)';
        knob.style.left = on ? '19px' : '3px';
      }
      paint();

      row.addEventListener('click', function () {
        const next = row.getAttribute('aria-checked') !== 'true';
        row.setAttribute('aria-checked', next ? 'true' : 'false');
        paint();
        try {
          if (entry.group === 'tweak') {
            setTweakEnabled(entry.tweak.id, next);
            TweakRegistry.setEnabled(entry.tweak, next);
          } else if (entry.item) {
            setItemEnabled(entry.tweak.id, entry.item.id, next);
          }
        } catch (e) {
          console.warn(LOG_TAG, 'settings toggle failed', e);
        }
        // Keep data in sync with what is painted; no focus is moved.
        entry.enabled = next;
      });

      return row;
    },

    close: function () {
      if (this._onKeyDown) {
        window.removeEventListener('keydown', this._onKeyDown, { capture: true });
        this._onKeyDown = null;
      }
      if (this._dialogEl && this._dialogEl.parentNode) {
        this._dialogEl.parentNode.removeChild(this._dialogEl);
      }
      this._dialogEl = null;
      this._listEl = null;
      this._searchEl = null;
      this._chipsEl = null;
      if (this._backdropEl && this._backdropEl.parentNode) {
        this._backdropEl.parentNode.removeChild(this._backdropEl);
      }
      this._backdropEl = null;
      this._open = false;
      this._query = '';
      this._section = 'all';
    },
  };

  /* ---------- boot ---------- */
  TweakRegistry.register(AutomationContextMenuTweak);
  TweakRegistry.register(EditorRowContextMenuTweak);
  TweakRegistry.register(AutoCollapseEditorTweak);
  TweakRegistry.register(DashboardEmptyMenuTweak);
  TweakRegistry.register(RightClickHoldTweak);
  TweakRegistry.register(ChipActiveForTweak);
  TweakRegistry.register(SidebarDragTweak);

  window.addEventListener('location-changed', handleRouteChange);
  window.addEventListener('popstate', handleRouteChange);

  // Settings hotkey: Cmd/Ctrl+Shift+M toggles the flags page. Registered once
  // at boot, independent of any single tweak.
  window.addEventListener('keydown', function (ev) {
    try {
      if (ev && ev.code === 'KeyM' && ev.shiftKey && (ev.metaKey || ev.ctrlKey)) {
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        SettingsModal.toggle();
      }
    } catch (e) {
      // ignore
    }
  });

  // Debug handle for future AI/sessions: window.HATweaks
  // window.HAMods is a deprecated alias kept so older console snippets keep working.
  try {
    window.HATweaks = window.HATweaks || {};
    window.HATweaks.version = HA_TWEAKS_VERSION;
    window.HATweaks.registry = TweakRegistry;
    window.HATweaks.getHass = getHass;
    window.HATweaks.querySelectorDeep = querySelectorDeep;
    window.HATweaks.querySelectorAllDeep = querySelectorAllDeep;
    window.HATweaks.openSettings = function () {
      SettingsModal.toggle();
    };
    window.HATweaks.syncNow = function () {
      const hass = getHass();
      pushToServerDirect(hass);
      return pullFromServer(hass);
    };
    window.HATweaks.syncStatus = function () {
      return { pulled: _pulled, pendingPush: _pendingPush, config: loadConfig() };
    };
    try {
      window.HATweaks.chipActiveFor = {
        parseForDuration: parseForDuration,
        isRuleMet: isRuleMet,
      };
    } catch (e) {
      // ignore
    }
    window.HAMods = window.HATweaks;
  } catch (e) {
    // ignore
  }

  waitForHass(60000)
    .then((hass) => {
      // Sync first so tweaks start with the user's cross-device settings.
      pullFromServer(hass).then(() => {
        TweakRegistry.initAll();
        console.log(LOG_TAG + ' Initialized');
      });
    })
    .catch((e) => {
      console.warn(LOG_TAG + ' hass not found, retrying in background', e);
      // Last-resort retry loop for slow HA startups (e.g. Companion App)
      const retry = setInterval(() => {
        if (getHass()) {
          clearInterval(retry);
          TweakRegistry.initAll();
          console.log(LOG_TAG + ' Initialized (late)');
        }
      }, 1000);
    });
})();
