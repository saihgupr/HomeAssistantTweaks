# Home Assistant Tweaks

Small quality-of-life tweaks for the Home Assistant frontend. Each tweak does one thing: it adds a right-click menu where you expect one, keeps the automation editor tidy, removes the hold-action delay, or lets you drag sidebar items into place.

Press **`T`** anywhere in Home Assistant to open settings. Every toggle applies right away. No YAML edits, no page reload, no server restart.

![Home Assistant Tweaks settings menu: press T to search and toggle tweaks live](assets/settings-menu.gif)

*[Watch the full tour video](assets/ha-tweaks-tour-v1.18.19.mp4) · [Documentation & Wiki](https://github.com/saihgupr/HomeAssistantTweaks/wiki/Home)*

---

## Highlights

### Recover earlier versions of automations and scripts
The Version Control addon snapshots your config files to Git each time they change. With it installed, the automation and script editors gain version navigation: step back through earlier versions of the one you are editing, preview any version in the editor or as YAML, and bring it back by saving.

Requires the [Home Assistant Version Control](https://github.com/saihgupr/HomeAssistantVersionControl) addon.

![Stepping back through earlier saves in the automation editor](assets/version-history.gif)

### Collapsed editor by default
Instead of one long scrolling page, automations open with all blocks collapsed. A toolbar button collapses or expands everything at once for the whole editor.

![Automation editor opening with collapsed rows, then expanding one row with the toolbar button](assets/collapse-editor.gif)

### Inline title renaming
Click the title in the editor header and rename it there. Press Enter or click outside to save.

![Clicking the automation title in the editor header and renaming it inline](assets/inline-rename.gif)

### Instant card hold actions
Right-click any dashboard card, badge, or tile to trigger its hold action at once, without the usual press-and-hold wait. Left-clicks work as before.

![Right-clicking a dashboard card to trigger its hold action immediately](assets/hold-action.gif)

### Drag-to-reorder sidebar
Drag sidebar items into the order you want. The order saves to Home Assistant's own sidebar storage, so it syncs per user across desktop and mobile.

![Dragging a sidebar item to a new position](assets/sidebar-drag.gif)

### Mushroom chips that wait (`for:`)
Give a chip a `for:` duration and it stays hidden until the entity state has lasted that long. No template math or helper sensors needed.

![Mushroom chips waiting for state duration](assets/mushroom-chips.gif)

### Context menus where you right-click
Right-click (or long-press in the Companion App) an automation or script to open Edit or Delete. Right-click any trigger, condition, or action row inside the editor to copy, cut, or duplicate it.

![Right-click menu open on an automation row showing Edit and Delete](assets/context-menu.gif)

---

## New Additions

### Optional Marketplace sidebar item
Adds a direct link to the Home Assistant Marketplace in the sidebar for admin users. No `panel_custom` configuration or restart needed. It can be reordered or hidden at any time.

### Dashboard empty-space menu
Right-click (or long-press) empty space on a dashboard to open a short menu with New Automation and New Script. Each item can be switched on or off in settings.

---

## Installation

### Quick Start (Marketplace)

1. Open the repository directly in Home Assistant:

   [![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=saihgupr&repository=HomeAssistantTweaks&category=plugin)

   Or add it by hand: in Home Assistant go to **Settings → Marketplace → Add from link** (on older versions: **Marketplace → Custom repositories**) with category **Plugin**, and enter:
   ```text
   https://github.com/saihgupr/HomeAssistantTweaks
   ```
2. Install **Home Assistant Tweaks**.
3. Add the loader to `configuration.yaml` (required so tweaks load on `/config` administration pages as well as dashboards):
   ```yaml
   frontend:
     extra_module_url:
       - /hacsfiles/HomeAssistantTweaks/ha-tweaks-loader.js
   ```
4. Restart Home Assistant once. Reload your browser page and press **`T`** to choose your tweaks.

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

*Upgrading from v1.8.2 or earlier (formerly HA Mods): the script file was consolidated to `ha-tweaks.js`. Update your `extra_module_url` line to the loader path above; previously saved preferences transfer automatically.*

</details>

<details>
<summary><b>Updating & Verifying</b></summary>

### Updates
Update the plugin in Marketplace, then reload the page. The loader checks the asset ETag, so updates take effect immediately on reload without restarting Home Assistant.

### Verification
Open your browser developer console (`F12` or `Cmd+Option+I`) and look for:
```text
[HA Tweaks v1.18.19] Initialized
```
Typing `HATweaks.version` in the console returns the active version string.

</details>

---

## How It Works & Safety

- **No dependencies, no network calls.** One small file. Nothing is sent anywhere.
- **Browser only.** It changes the pages you see. It never edits YAML files, automations, entities, or stored data.
- **Isolated tweaks.** Each tweak stands alone. If a Home Assistant update breaks one, that one stops and the rest keep working.
- **Opt in.** Fresh installs start with everything off. Turn on only what you want. Turn everything off to get stock Home Assistant back.
- **Sync per user.** Toggles are stored in Home Assistant user data with a local cache, so they follow you between desktop and the Companion App.

---

## Disable or Remove

- **To temporarily disable:** Press **`T`** and turn off individual switches (or toggle all off to return to stock).
- **To uninstall:** Remove the plugin from Marketplace, remove the `extra_module_url` line from `configuration.yaml`, and restart Home Assistant once.

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

1. Fork the repository.
2. Make your edits in `ha-tweaks.js`.
3. Verify syntax:
   ```bash
   node --check ha-tweaks.js
   ```
4. Open a Pull Request targeting `main`.

---

## Related Projects

- [Home Assistant Version Control](https://github.com/saihgupr/HomeAssistantVersionControl) - Automated snapshot history and restore engine for automations, scripts, and views (powers the version history tweak).
- [Home Assistant Time Machine](https://github.com/saihgupr/HomeAssistantTimeMachine) - Browse historical backups and restore individual files, views, and packages.

---

## Support & Feedback

- Star this project on [GitHub](https://github.com/saihgupr/HomeAssistantTweaks).
- File bugs or feature requests on [GitHub Issues](https://github.com/saihgupr/HomeAssistantTweaks/issues).
- Support maintenance on [Ko-fi](https://ko-fi.com/saihgupr).

---

## License

This project is licensed under the [MIT License](LICENSE).
