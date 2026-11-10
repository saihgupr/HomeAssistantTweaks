# <sup><img src="assets/icon-96.png" width="48" height="48" align="middle" alt="Home Assistant Tweaks" /></sup> Home Assistant Tweaks

![Latest release](https://img.shields.io/github/v/release/saihgupr/HomeAssistantTweaks)
![License](https://img.shields.io/github/license/saihgupr/HomeAssistantTweaks)
![Stars](https://img.shields.io/github/stars/saihgupr/HomeAssistantTweaks?style=flat)

Small quality-of-life tweaks for the Home Assistant frontend. Each tweak does one thing: collapse the automation editor, rename titles inline, copy or duplicate editor rows, step back through earlier versions, add right-click menus, skip the hold-action delay, drag sidebar items into place, and more. This is a community project and anyone can submit a tweak. See [Contributing](CONTRIBUTING.md) to add yours.

Press **`T`** anywhere in Home Assistant to open settings. Every toggle applies right away. No YAML edits, no page reload, no server restart.

![Home Assistant Tweaks settings menu: press T to search and toggle tweaks live](assets/settings-menu.gif)

*[Watch the full tour video](assets/ha-tweaks-tour.mp4) · [Documentation & Wiki](https://github.com/saihgupr/HomeAssistantTweaks/wiki/Home)*

---

## Features

The highlights are below. Press **`T`** in Home Assistant, or see the [Wiki](https://github.com/saihgupr/HomeAssistantTweaks/wiki/Home), for the full list.

### Automation and script editor

#### Collapsed editor by default
Instead of one long scrolling page, automations open with all blocks collapsed. A toolbar button collapses or expands everything at once for the whole editor.

![Automation editor opening with collapsed rows, then expanding one row with the toolbar button](assets/collapse-editor.gif)

#### Inline title renaming
Click the title in the editor header and rename it there. Press Enter or click outside to save.

![Clicking the automation title in the editor header and renaming it inline](assets/inline-rename.gif)

#### Copy, cut, or duplicate editor rows
Right-click any trigger, condition, or action row inside the editor to copy, cut, or duplicate it.

![Right-click menu on an editor row showing Duplicate, Copy, Cut, and more](assets/editor-row-menu.gif)

#### Recover earlier versions of automations and scripts
The Version Control app snapshots your config files to Git each time they change. With it installed, the automation and script editors gain version navigation: step back through earlier versions of the one you are editing, preview any version in the editor or as YAML, and bring it back by saving.

> **Requires** the [Home Assistant Version Control](https://github.com/saihgupr/HomeAssistantVersionControl) app, installed separately.

![Stepping back through earlier saves in the automation editor](assets/version-history.gif)

### Menus and actions

#### Context menus where you right-click
Right-click (or long-press in the Companion App) an automation or script to open Edit or Delete.

![Right-click menu open on an automation row showing Edit and Delete](assets/context-menu.gif)

#### Instant card hold actions
Right-click any dashboard card, badge, or tile to trigger its hold action at once, without the usual press-and-hold wait. Left-clicks work as before.

![Right-clicking a dashboard card to trigger its hold action immediately](assets/hold-action.gif)

### Dashboard and sidebar

#### Drag-to-reorder sidebar
Drag sidebar items into the order you want. The order saves to Home Assistant's own sidebar storage, so it syncs per user across desktop and mobile.

![Dragging a sidebar item to a new position](assets/sidebar-drag.gif)

#### Mushroom chips that wait (`for:`)
Give a chip a `for:` duration and it stays hidden until the entity state has lasted that long. No template math or helper sensors needed.

> **Requires** [Mushroom](https://github.com/piitaya/lovelace-mushroom) cards to be installed.

![Mushroom chips waiting for state duration](assets/mushroom-chips.gif)

---

## Recently added

- **Optional Marketplace sidebar item.** Adds a direct link to the Home Assistant Marketplace in the sidebar for admin users. No `panel_custom` configuration or restart needed. It can be reordered or hidden at any time.

  [![Sidebar with the Marketplace entry highlighted](assets/marketplace-sidebar.png)](assets/marketplace-sidebar.png)

- **Dashboard empty-space menu.** Right-click (or long-press) empty space on a dashboard to open a short menu with New Automation and New Script. Each item can be switched on or off in settings.

  [![Right-click menu on empty dashboard space showing New Automation and New Script](assets/empty-space-menu.png)](assets/empty-space-menu.png)

---

## Compatibility

<!-- TODO: fill in the real minimums before publishing. -->
- **Home Assistant:** version X.X or newer
- **Browsers:** current Chrome, Firefox, Safari, and Edge
- **Companion App:** supported (right-clicks become long-presses; see the [FAQ](#faq))

---

## Installation

> **Note:** HACS became the built-in **Marketplace** in Home Assistant 2026.11. The steps below use the new name. On older versions, use **HACS** wherever you see Marketplace.

### Quick Start (Marketplace)

1. Open the repository directly in Home Assistant:

   [![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=saihgupr&repository=HomeAssistantTweaks&category=plugin)

   Or add it by hand: go to **Settings → Marketplace → Add from link** (on older versions: **HACS → Custom repositories**) with category **Plugin**, and enter:
   ```text
   https://github.com/saihgupr/HomeAssistantTweaks
   ```
2. Install **Home Assistant Tweaks**.
3. Choose how far you want the tweaks to reach:

   - **Dashboards only:** you are done. The Marketplace registers `ha-tweaks.js` as a dashboard resource. Reload your browser page and press **`T`**.
   - **Every page** (Settings, Developer Tools, and the rest): add the loader to `configuration.yaml`, then restart Home Assistant once.

     ```yaml
     frontend:
       extra_module_url:
         - /local/community/HomeAssistantTweaks/ha-tweaks-loader.js
     ```

     On a pre-2026.11 HACS install, use `/hacsfiles/HomeAssistantTweaks/ha-tweaks-loader.js` instead.
4. Reload your browser page and press **`T`** to choose your tweaks.

<details>
<summary><b>Manual Installation</b></summary>

1. Download [`ha-tweaks.js`](ha-tweaks.js) and [`ha-tweaks-loader.js`](ha-tweaks-loader.js).
2. Place both files in your `<config>/www/` directory.
3. Add the loader reference to `configuration.yaml`:
   ```yaml
   frontend:
     extra_module_url:
       - /local/ha-tweaks-loader.js
   ```
4. Restart Home Assistant once and reload the page. Press **`T`** to open settings.

</details>

<details>
<summary><b>Updating & Verifying</b></summary>

### Updates
Update the plugin in the Marketplace, then reload the page. The loader checks the asset ETag, so a normal reload usually picks up the new version without restarting Home Assistant.

If the console still shows the old version, the browser kept a cached copy. Hard-reload the page (`Ctrl+F5` or `Cmd+Shift+R`) or clear the site's cached data, then reload again. In the Companion App, force-close and reopen the app.

**Upgrading from v1.8.2 or earlier (formerly HA Mods):** the script file was consolidated to `ha-tweaks.js`. Update your `extra_module_url` line to the loader path above. Previously saved preferences transfer automatically.

### Verification
Open your browser developer console (`F12` or `Cmd+Option+I`) and look for:
```text
[HA Tweaks v1.x.x] Initialized
```
Typing `HATweaks.version` in the console returns the active version string.

</details>

---

## Troubleshooting

- **Nothing happens when I press `T`.** Open the browser console and look for the `[HA Tweaks ...] Initialized` line. If it is missing, the script is not loading. Check that the plugin is installed and that you reloaded the page.
- **It works on dashboards but not on Settings or Developer Tools.** Those pages need the loader. Add the `extra_module_url` entry from [Installation](#installation) and restart Home Assistant.
- **The console shows an old version after updating.** Your browser cached the old file. Hard-reload (`Ctrl+F5` or `Cmd+Shift+R`), or force-close and reopen the Companion App.
- **The loader path returns a 404.** The path depends on how you installed. Use `/local/community/HomeAssistantTweaks/...` for Marketplace 2026.11 and later, `/hacsfiles/HomeAssistantTweaks/...` for older HACS, or `/local/...` for a manual install.
- **I can't press `T` on my phone or tablet.** Run `HATweaks.openSettings()` in a console, or see the [FAQ](#faq).

Still stuck? [Open an issue](https://github.com/saihgupr/HomeAssistantTweaks/issues) and include your Home Assistant version, browser, and the console output.

---

## How It Works & Safety

- **No dependencies, no network calls.** One small file. Nothing is sent anywhere.
- **Browser only.** It changes the pages you see. It never touches your YAML files, automations, or entities on its own. The only things it saves are its own settings and your sidebar order.
- **Isolated tweaks.** Each tweak stands alone. If a Home Assistant update breaks one, that one stops and the rest keep working.
- **Opt in.** Fresh installs start with everything off. Turn on only what you want. Turn everything off to get stock Home Assistant back.
- **Sync per user.** Toggles are stored in Home Assistant user data with a local cache, so they follow you between desktop and the Companion App.

---

## Disable or Remove

- **To temporarily disable:** Press **`T`** and turn off individual switches (or toggle all off to return to stock).
- **To uninstall:** Remove the plugin from the Marketplace, remove the `extra_module_url` line from `configuration.yaml`, and restart Home Assistant once.

---

## FAQ

**Does this work in the Home Assistant Companion App?**
Yes. Right-clicks become long-presses, and sidebar items drag with touch and hold. On devices without a physical keyboard, run `HATweaks.openSettings()` in a console to open settings.

**Does this cause frontend lag or drain battery?**
No. There is no polling. Menus and drags answer to events, and editor folding runs once when the editor opens.

**Why does an automation say "No UI ID"?**
That automation is defined in YAML without an `id:`. Home Assistant needs an `id:` to open it in the visual editor, so add one to the YAML.

---

## Contributing

This is a community project. To submit a tweak, follow [CONTRIBUTING.md](CONTRIBUTING.md): fork the repository, add your tweak to `ha-tweaks.js`, verify with `node --check ha-tweaks.js`, and open a Pull Request targeting `develop`.

---

## License

<!-- TODO: confirm the license name and make sure a LICENSE file exists in the repo. -->
Released under the [MIT License](LICENSE).

---

## Related Projects

- [Home Assistant Version Control](https://github.com/saihgupr/HomeAssistantVersionControl) - Automated snapshot history and restore engine for automations, scripts, and views (powers the version history tweak).
- [Home Assistant Time Machine](https://github.com/saihgupr/HomeAssistantTimeMachine) - Browse historical backups and restore individual files, views, and packages.

---

## Support & Feedback

If you encounter any issues, bugs, or have feature requests, please [open an issue on GitHub](https://github.com/saihgupr/HomeAssistantTweaks/issues).

Home Assistant Tweaks is open-source and free. If you find it useful, consider giving it a star on GitHub or making a donation to support development!

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/saihgupr)
