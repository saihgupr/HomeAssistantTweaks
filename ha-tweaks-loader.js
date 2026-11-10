/**
 * HA Tweaks loader.
 *
 * `frontend.extra_module_url` is read once at Home Assistant startup, so
 * putting a version in that URL forces a restart on every release. This file
 * lives at a stable URL instead. It asks Home Assistant for the current ETag
 * of ha-tweaks.js and imports that exact revision, so browsers can cache the
 * real module normally while every page load still picks up a deploy.
 *
 * Keep this file stable. If it ever needs to change, change its filename too,
 * otherwise cached copies will keep running the old loader.
 */
(async () => {
  const moduleUrl = new URL('ha-tweaks.js', import.meta.url);

  let version = '';
  try {
    const probe = new URL(moduleUrl);
    probe.searchParams.set('probe', Date.now().toString(36));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(probe, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.ok) {
        version =
          response.headers.get('etag') ||
          response.headers.get('last-modified') ||
          '';
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Network hiccup: fall back to the unversioned URL so the cached copy
    // can still load.
  }

  if (version) {
    moduleUrl.searchParams.set('v', version);
  }

  try {
    await import(moduleUrl.href);
  } catch (err) {
    console.error('[HA Tweaks] Failed to load ha-tweaks.js', err);
  }
})();
