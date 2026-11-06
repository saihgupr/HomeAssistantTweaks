# Home Assistant Tweaks

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=saihgupr&repository=HomeAssistantTweaks&category=plugin)
[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/saihgupr)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## About

Home Assistant Tweaks is a lightweight, native-feeling collection of quality-of-life frontend tweaks for Home Assistant. Add desktop right-click context menus, a calmer automation editor, instant hold actions, and more — all configurable per user in real time with zero restarts required.

<!-- DEMO MEDIA: Placeholder for screenshots and walkthrough GIFs -->

---

## Highlights

- **Context Menus Anywhere:** Right-click automations, scripts, editor blocks, and empty dashboard canvas for instant actions.
- **Calmer Automation Editor:** Automations and scripts open collapsed by default, complete with a Collapse All / Expand All toolbar button.
- **Inline Editor Titles:** Click an automation or script name in the editor header to rename it in place. Enter or blur commits the name, Escape cancels.
- **Instant Hold Actions:** Right-click cards, badges, and tiles to trigger hold actions immediately without the default 500 ms wait.
- **Drag-to-Reorder Sidebar:** Hold and drag sidebar items into any order you like. Saves to Home Assistant's own sidebar order, so it syncs across devices and matches Edit sidebar.
- **Marketplace in Sidebar:** Native `panel_custom` sidebar entry that redirects to the Marketplace, visible in the sidebar and Edit sidebar (admins only).
- **Zero Reloads & Instant Sync:** Toggle any tweak in real time via `T`. Settings sync per HA user across desktop and the Companion App.
- **Safe & Isolated:** Single plain ES module with no external dependencies; one tweak failing will never break the rest of the frontend.

👉 **[Explore the Complete Tweaks Directory & Guides in the Wiki →](https://github.com/saihgupr/HomeAssistantTweaks/wiki/Home)**

---

## Installation

### Option A — HACS (Recommended)

1. Click the HACS badge above, or navigate to **HACS → ⋮ → Custom repositories**, add `https://github.com/saihgupr/HomeAssistantTweaks` with category **Plugin**, and download **Home Assistant Tweaks**.
2. Add the global module URL to `configuration.yaml` (a Lovelace dashboard resource alone does not run on `/config` pages, so this line is required):
   ```yaml
   frontend:
     extra_module_url:
       - /hacsfiles/HomeAssistantTweaks/ha-tweaks-loader.js
   ```
3. Restart Home Assistant once, then reload the page. Confirm in the developer console (`F12`):
   ```
   [HA Tweaks v1.16.2] Initialized
   ```
   The loader probes the installed `ha-tweaks.js` for its current ETag and imports that build. After this one-time setup, plugin updates only need a page reload, not a Home Assistant restart.

<details>
<summary><b>Option B — Manual Installation (Click to expand)</b></summary>

1. Copy [`ha-tweaks.js`](ha-tweaks.js) and [`ha-tweaks-loader.js`](ha-tweaks-loader.js) to `<config>/www/`.
2. Add to `configuration.yaml`:
   ```yaml
   frontend:
     extra_module_url:
       - /local/ha-tweaks-loader.js
   ```
3. Restart Home Assistant once, then reload. Confirm `[HA Tweaks v1.16.2] Initialized` in the console.

> **Note:** The loader keeps the `extra_module_url` stable. It probes `/local/ha-tweaks.js` for its current ETag and imports that revision, so deploying a new `ha-tweaks.js` only needs a page reload, not a Home Assistant restart. Keep both files in the same directory.

> **Upgrading from v1.8.2 or earlier (shipped as HA Mods)?** The file was renamed to `ha-tweaks.js` — update `extra_module_url` to the loader path above. Your toggles carry over automatically; `HATweaks` replaces `HAMods` in the console (`HAMods` still works as an alias).

</details>

### Marketplace Sidebar Entry (Optional)

The Marketplace sidebar item is a native `panel_custom` entry (a tiny redirect module, not a tweak, so it appears in the sidebar and Edit sidebar and syncs across devices):

1. Copy [`marketplace-redirect.js`](marketplace-redirect.js) to `<config>/www/marketplace-redirect.js` (`deploy.sh` does this automatically).
2. Add to `configuration.yaml`:
   ```yaml
   panel_custom:
     - name: marketplace-redirect
       sidebar_title: Marketplace
       sidebar_icon: mdi:store
       url_path: marketplace-redirect
       module_url: /local/marketplace-redirect.js
       config:
         target: /marketplace
       require_admin: true
   ```
3. Restart Home Assistant, then hard-refresh the browser (`Cmd/Ctrl + Shift + R`).

---

## Usage

Press **`T`** when not typing in a text field (or run `HATweaks.openSettings()` in the browser console) to open the settings modal. 

Every tweak and individual menu item can be toggled independently. Changes apply immediately without reloading and sync per HA user across desktop and mobile.

Fresh installs start with every tweak off, so you opt in to only what you want. Saved toggles survive updates.

### Reordering the sidebar

Switch on **Drag to reorder sidebar**, then drag any main-navigation item (dashboards, the Marketplace entry, custom panels) up or down. A floating copy follows the pointer with a line showing where it will land; dragging near the top or bottom auto-scrolls the list, and `Escape` cancels.

- Mouse lifts the item as soon as you move; touch lifts after a short hold, so normal scrolling is untouched.
- The order is saved to Home Assistant's own sidebar user data, so it syncs per user and stays in step with Edit sidebar.
- The fixed block (Settings, Notifications, Profile) is intentionally not draggable.

<details>
<summary><b>Tunables & Constants (Click to expand)</b></summary>

Default timing and gesture thresholds live near the top of [`ha-tweaks.js`](ha-tweaks.js):

| Constant | Default | What it changes |
|---|---|---|
| `LONG_PRESS_MS` | `550` | Touch hold length before a context menu opens |
| `LONG_PRESS_MOVE_TOLERANCE_PX` | `10` | Finger drift allowed before a press counts as scroll |
| `LONG_PRESS_SUPPRESS_MS` | `2000` | Window to swallow the synthetic `contextmenu` iOS fires after long-press |
| `LIFT_CLICK_IGNORE_MS` | `600` | Window where backdrop taps are ignored after menu open |
| `SIDEBAR_HOLD_MS` | `320` | Touch hold length before a sidebar item lifts for dragging |
| `SIDEBAR_MOUSE_THRESHOLD_PX` | `5` | Mouse movement needed to start a sidebar drag |
| `SIDEBAR_AUTOSCROLL_STEP_PX` | `9` | Pixels per frame when dragging near the sidebar's top or bottom edge |

</details>

<details>
<summary><b>Technical Architecture (Click to expand)</b></summary>

- **Dual-Store Sync:** Combines instant `localStorage` caching with HA user-level server storage (`frontend/get_user_data`).
- **Deep Shadow-DOM Traversal:** Utilizes `querySelectorDeep` and `composedPath` to interact with custom cards, badges, and nested editor rows.
- **In-Place Navigation:** Intercepts route changes via `location-changed` and `popstate` to bypass disruptive page reloads.
- **Editor Lifecycle:** Hooks Lit element `updateComplete` cycles to collapse editor blocks before first paint.
- **Fault Isolation:** Central `TweakRegistry` wraps each tweak in error boundaries so upstream HA frontend updates cannot break other tweaks or the core UI.
- **Native Sidebar Order:** Drag-to-reorder writes the same `frontend/set_user_data` payload Edit sidebar uses (`panelOrder` / `hiddenPanels`), so no extra storage is introduced and both UIs stay consistent. The drag shows a clone plus an insertion line and lets Lit re-render from the saved order instead of moving nodes underneath it.

</details>

---

## Troubleshooting & Debugging

If a tweak is not appearing or behaving as expected:

1. **Verify Loaded Version:**
   Press `T` to open settings. To confirm the loaded version, run in the browser console:
   ```js
   HATweaks.version
   ```
2. **Verify Initialization:**
   Check the developer console (`F12` or `Cmd + Option + I`). You should see:
   ```text
   [HA Tweaks v1.16.2] Initialized
   ```
   If not present, check that `extra_module_url` is added under `frontend:` in `configuration.yaml` and not just as a Lovelace dashboard resource.
3. **Inspect Settings & Cloud Sync:**
   Run:
   ```js
   HATweaks.syncStatus()
   ```
4. **Enable Debug Logging:**
   To turn on detailed logging:
   ```js
   localStorage.ha_tweaks_debug = '1';
   ```
   Reload the tab. All tweaks will log initialization, DOM matching, and event dispatch details. To disable, run `delete localStorage.ha_tweaks_debug`.
5. **Refresh the Module:**
   The loader imports the current build automatically. If a tab still shows an old version, close other Home Assistant tabs and reload. As a last resort, clear site data for the HA origin. No Home Assistant restart is needed.

---

## Contributing

Contributions and improvements are welcome!

1. Fork the repository.
2. Create your branch (`git checkout -b develop` or `git checkout -b feature/your-feature`).
3. Make your changes in `ha-tweaks.js`.
4. Run syntax verification:
   ```bash
   node --check ha-tweaks.js
   ```
5. Commit your changes with clear commit messages.
6. Submit a Pull Request targeting `main`.

---

## Related Projects

Check out more tools for Home Assistant from the **[Saihgupr Add-ons Repository](https://github.com/saihgupr/ha-addons)**:

- **[Home Assistant Time Machine](https://github.com/saihgupr/HomeAssistantTimeMachine)**: Web-based time machine to browse YAML backups and selectively restore individual automations, scripts, Lovelace views, and packages.
- **[Home Assistant Version Control](https://github.com/saihgupr/HomeAssistantVersionControl)**: Automated backup, history tracking, and instant restore engine.

[![Add Saihgupr Add-ons Repository](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fsaihgupr%2Fha-addons)

---

## FAQ

<details>
<summary><b>Frequently Asked Questions (Click to expand)</b></summary>

**Do I need to reload or edit YAML to toggle something?**  
No. Press `T`, toggle the switch, and it takes effect immediately. Toggles persist per HA user.

**It says "No UI ID" on Edit/Delete. Why?**  
That entry is YAML-defined without a UI id, so Home Assistant itself cannot open it in the visual editor. Give it an `id:` in YAML to enable editing.

**Will this break when Home Assistant updates?**  
Each tweak is fault-isolated: if an upstream DOM change breaks one tweak, it logs a warning and steps aside. The frontend and other tweaks keep working.

**Does it work in the Companion App?**  
Yes. Toggles sync per user, and long-press touch gestures are supported on iOS and Android.

**How do I confirm which version the browser is actually running?**  
Press `T` to open settings — `HATweaks.version` in the browser console is the source of truth.

</details>

---

## Support & Feedback

If you find Home Assistant Tweaks useful:
- ⭐ Star this repository on GitHub.
- 🐛 Found a bug or have a suggestion? Open an issue on [GitHub Issues](https://github.com/saihgupr/HomeAssistantTweaks/issues).
- ☕ Support continued maintenance and development:

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/saihgupr)

---

## License

This project is licensed under the [MIT License](LICENSE).
