import { isPluginsSettingsRoute } from "./core.js";

export class PluginPageController {
  constructor({
    createApp,
    getHref = () => window.location.href,
    document = globalThis.document,
    eventTarget = globalThis.window,
    observe = true,
    MutationObserverImpl = globalThis.MutationObserver,
  }) {
    this.createApp = createApp;
    this.getHref = getHref;
    this.document = document;
    this.eventTarget = eventTarget;
    this.observe = observe;
    this.MutationObserverImpl = MutationObserverImpl;
    this.app = undefined;
    this.mounted = false;
    this.syncing = false;
    this.sync = this.sync.bind(this);
    this.scheduleSync = this.scheduleSync.bind(this);
  }

  async sync() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      if (!isPluginsSettingsRoute(this.getHref())) {
        if (this.app && this.mounted) this.app.unmount();
        this.mounted = false;
        return;
      }

      if (!this.app) this.app = this.createApp();
      if (!this.mounted) this.mounted = await this.app.mount();
      else await this.app.syncFromURL?.();
    } finally {
      this.syncing = false;
    }
  }

  scheduleSync() {
    queueMicrotask(() => this.sync());
  }

  start() {
    this.eventTarget?.addEventListener?.("stash:location", this.scheduleSync);
    this.eventTarget?.addEventListener?.("popstate", this.scheduleSync);
    if (this.observe && this.MutationObserverImpl && this.document?.body) {
      this.observer = new this.MutationObserverImpl(this.scheduleSync);
      this.observer.observe(this.document.body, { childList: true, subtree: true });
    }
    this.sync();
  }

  stop() {
    this.eventTarget?.removeEventListener?.("stash:location", this.scheduleSync);
    this.eventTarget?.removeEventListener?.("popstate", this.scheduleSync);
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.app && this.mounted) this.app.unmount();
    this.mounted = false;
  }
}
