import { isPluginsSettingsRoute } from "./core.js";

const ENHANCEMENT_STORAGE_KEY = "spme.enhancementEnabled";

export class PluginPageController {
  constructor({
    createApp,
    getHref = () => window.location.href,
    document = globalThis.document,
    eventTarget = globalThis.window,
    storage = globalThis.localStorage,
    observe = true,
    MutationObserverImpl = globalThis.MutationObserver,
  }) {
    this.createApp = createApp;
    this.getHref = getHref;
    this.document = document;
    this.eventTarget = eventTarget;
    this.storage = storage;
    this.observe = observe;
    this.MutationObserverImpl = MutationObserverImpl;
    this.app = undefined;
    this.mounted = false;
    this.syncing = false;
    try {
      this.enhancementEnabled = this.storage?.getItem(ENHANCEMENT_STORAGE_KEY) !== "false";
    } catch {
      this.enhancementEnabled = true;
    }
    this.sync = this.sync.bind(this);
    this.scheduleSync = this.scheduleSync.bind(this);
    this.onEnhancementChange = this.onEnhancementChange.bind(this);
  }

  ensureEnhancementControl() {
    const menu = this.document?.querySelector?.("#settings-menu-container");
    const nav = menu?.querySelector?.(".nav");
    if (!nav) return;
    let control = nav.querySelector("#spme-enhancement-control");
    if (!control) {
      const pluginLink = [...nav.querySelectorAll("a[href]")].find((link) => {
        try {
          return new URL(link.getAttribute("href"), "http://stash.local").searchParams.get("tab") === "plugins";
        } catch {
          return false;
        }
      });
      const pluginItem = pluginLink?.closest(".nav-item");
      if (!pluginItem) return;
      control = this.document.createElement("div");
      control.id = "spme-enhancement-control";
      control.className = "nav-item";
      control.innerHTML = `<div class="spme-enhancement-switch"><label class="form-label" for="spme-enhancement-enabled">Enhanced Plugins UI</label><div class="custom-control custom-switch"><input id="spme-enhancement-enabled" class="custom-control-input" type="checkbox" role="switch" aria-describedby="spme-enhancement-help"><label class="custom-control-label" for="spme-enhancement-enabled" title="Toggle Plugin Manager Enhanced"></label></div></div><small id="spme-enhancement-help">Turn off to restore the stock Plugins page.</small>`;
      pluginItem.after(control);
      control.querySelector("input")?.addEventListener("change", this.onEnhancementChange);
    }
    const input = control.querySelector("#spme-enhancement-enabled");
    if (input) input.checked = this.enhancementEnabled;
    control.dataset.enabled = String(this.enhancementEnabled);
  }

  unmountApp() {
    try {
      this.app?.unmount?.();
    } finally {
      this.mounted = false;
    }
  }

  onEnhancementChange(event) {
    this.enhancementEnabled = Boolean(event.currentTarget.checked);
    try {
      this.storage?.setItem(ENHANCEMENT_STORAGE_KEY, String(this.enhancementEnabled));
    } catch {
      // Storage may be unavailable in privacy-restricted browser contexts.
    }
    this.ensureEnhancementControl();
    if (!this.enhancementEnabled) {
      this.unmountApp();
      return;
    }
    this.sync();
  }

  async sync() {
    if (this.stopped) return;
    if (this.syncing) {
      this.resyncRequested = true;
      return;
    }
    this.syncing = true;
    try {
      this.ensureEnhancementControl();
      if (!this.enhancementEnabled || !isPluginsSettingsRoute(this.getHref())) {
        if (this.app) this.unmountApp();
        return;
      }

      if (!this.app) this.app = this.createApp();
      if (this.mounted && this.app.isMounted?.() === false) this.unmountApp();
      if (!this.mounted) this.mounted = await this.app.mount();
      else await this.app.syncFromURL?.();
      if (this.stopped || !this.enhancementEnabled || !isPluginsSettingsRoute(this.getHref())) {
        this.unmountApp();
      }
    } catch (error) {
      this.lastError = error;
      if (this.app) this.unmountApp();
    } finally {
      this.syncing = false;
      if (this.resyncRequested) {
        this.resyncRequested = false;
        this.scheduleSync();
      }
    }
  }

  scheduleSync() {
    queueMicrotask(() => this.sync());
  }

  start() {
    this.stopped = false;
    this.eventTarget?.addEventListener?.("stash:location", this.scheduleSync);
    this.eventTarget?.addEventListener?.("popstate", this.scheduleSync);
    if (this.observe && this.MutationObserverImpl && this.document?.body) {
      this.observer = new this.MutationObserverImpl(this.scheduleSync);
      this.observer.observe(this.document.body, { childList: true, subtree: true });
    }
    this.sync();
  }

  stop() {
    this.stopped = true;
    this.eventTarget?.removeEventListener?.("stash:location", this.scheduleSync);
    this.eventTarget?.removeEventListener?.("popstate", this.scheduleSync);
    this.observer?.disconnect();
    this.observer = undefined;
    this.document?.querySelector?.("#spme-enhancement-control")?.remove();
    if (this.app) this.unmountApp();
  }
}
