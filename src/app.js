import {
  deriveSourceGithubUrl,
  filterPackages,
  packageLastCommitDate,
  pluginManagerTabFromURL,
  safeExternalUrl,
  sourceAnchorHref,
  sourceAnchorID,
  sortPackages,
  withoutPluginManagerSourceAnchor,
  withPluginManagerTab,
} from "./core.js";

const TAB_DEFINITIONS = [
  ["installed", "Installed"],
  ["browse", "Browse"],
  ["sources", "Sources"],
  ["configuration", "Configuration"],
];

const SOURCE_SORT_OPTIONS = [
  ["name", "Name (A–Z)"],
  ["name-desc", "Name (Z–A)"],
  ["packages", "Packages (fewest)"],
  ["packages-desc", "Packages (most)"],
  ["installed", "Installed (fewest)"],
  ["installed-desc", "Installed (most)"],
  ["enabled", "Enabled (fewest)"],
  ["enabled-desc", "Enabled (most)"],
];

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plural(count, singular, pluralValue = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function packageCommitDateHTML(pkg) {
  const value = packageLastCommitDate(pkg);
  if (!value) return '<span data-last-commit>Unknown</span>';
  const date = new Date(value);
  return `<time data-last-commit datetime="${date.toISOString()}">${escapeHTML(formatDate(value))}</time>`;
}

function findCoreSections(documentRef) {
  const wanted = new Set(["Installed Plugins", "Available Plugins", "Plugins"]);
  return [...documentRef.querySelectorAll(".setting-section")].filter((section) =>
    wanted.has(section.querySelector(":scope > h1")?.textContent?.trim())
  );
}

const GITHUB_BUTTON_CONTENT = `<svg class="spme-github-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.87c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path></svg><span class="spme-github-label">GitHub</span><span class="spme-external-icon" aria-hidden="true">↗</span>`;

function githubRepositoryLink(url, name) {
  return `<a class="spme-repo-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(name)} GitHub repository">${GITHUB_BUTTON_CONTENT}</a>`;
}

function githubLink(pkg) {
  if (!pkg.githubUrl) {
    return `<span class="spme-repo-missing" title="This package does not declare a GitHub repository and its source is not a conventional GitHub Pages index.">Repository unavailable</span>`;
  }
  return githubRepositoryLink(pkg.githubUrl, pkg.name);
}

function trustBadge(trust = { level: "unverified", label: "Unverified source" }) {
  return `<span class="spme-badge spme-trust-${escapeHTML(
    trust.level
  )}" title="${escapeHTML(trust.label)}">${escapeHTML(trust.label)}</span>`;
}

function sourceErrorHTML(error) {
  const diagnostic = String(error);
  const summary = diagnostic.includes("404 Not Found")
    ? "Package index returned 404 Not Found."
    : diagnostic.includes("filename, directory name, or volume label syntax is incorrect")
      ? "Local package index path is invalid or unavailable."
      : "Stash could not load this source.";
  return `<aside class="spme-source-error" aria-label="Source unavailable">
    <span class="spme-source-error-icon" aria-hidden="true">!</span>
    <div><strong>Source unavailable</strong><p>${escapeHTML(summary)}</p><details><summary>Technical details</summary><code>${escapeHTML(diagnostic)}</code></details></div>
  </aside>`;
}

function sortSourceEntries(entries, sort = "name") {
  const descending = sort.endsWith("-desc");
  const field = sort.replace(/-desc$/, "");
  return [...entries].sort((a, b) => {
    const comparison = field === "name"
      ? (a.source.name || a.source.url).localeCompare(b.source.name || b.source.url)
      : field === "installed"
        ? a.installed.length - b.installed.length
        : (a[field] ?? 0) - (b[field] ?? 0);
    if (comparison) return descending ? -comparison : comparison;
    return (a.source.name || a.source.url).localeCompare(b.source.name || b.source.url);
  });
}

function packageDescription(pkg) {
  return pkg.plugin?.description || pkg.metadata?.description || "No description provided.";
}

export class EnhancedPluginManager {
  constructor(service, options = {}) {
    this.service = service;
    this.document = options.document ?? globalThis.document;
    this.window = options.window ?? globalThis.window;
    this.storage = options.storage ?? this.window?.localStorage;
    this.confirm = options.confirm ?? globalThis.confirm?.bind(globalThis);
    this.setTimeout = options.setTimeout ?? globalThis.setTimeout?.bind(globalThis);
    this.activeTab = pluginManagerTabFromURL(this.window?.location?.href ?? "/settings?tab=plugins");
    let storedViewMode;
    try {
      storedViewMode = this.storage?.getItem("spme.viewMode");
    } catch {
      storedViewMode = undefined;
    }
    this.viewMode = storedViewMode === "table" ? "table" : "cards";
    this.inventory = undefined;
    this.available = undefined;
    this.coreSections = [];
    this.selectedInstalled = new Set();
    this.selectedAvailable = new Set();
    this.filters = {
      installed: { query: "", enabled: undefined, updatesOnly: false, sort: "name" },
      browse: { query: "", source: "", sort: "last-commit" },
      sources: { sort: "packages-desc" },
      configuration: { query: "", enabled: undefined },
    };
    this.message = undefined;
    this.busy = false;
    this.editingSource = undefined;
    this.addingSource = false;
    this.browseLimit = 50;
    this.onClick = this.onClick.bind(this);
    this.onInput = this.onInput.bind(this);
    this.onChange = this.onChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
    this.updateLayoutWidth = this.updateLayoutWidth.bind(this);
  }

  async mount() {
    if (this.document.querySelector("#spme-root")) return true;
    this.coreSections = findCoreSections(this.document);
    if (this.coreSections.length < 3) return false;

    this.root = this.document.createElement("section");
    this.root.id = "spme-root";
    this.root.className = "spme-shell";
    this.root.dataset.viewMode = this.viewMode;
    this.root.dataset.activeTab = this.activeTab;
    this.root.setAttribute("aria-label", "Enhanced plugin manager");
    this.coreSections[0].before(this.root);
    this.coreSections.forEach((section) => section.classList.add("spme-core-hidden"));
    this.root.addEventListener("click", this.onClick);
    this.root.addEventListener("input", this.onInput);
    this.root.addEventListener("change", this.onChange);
    this.root.addEventListener("submit", this.onSubmit);
    this.window?.addEventListener?.("resize", this.updateLayoutWidth);
    this.updateLayoutWidth();
    this.renderLoading("Loading installed plugins…");

    try {
      this.inventory = await this.service.loadInstalled({ checkUpdates: false });
      if (this.activeTab === "browse" || this.activeTab === "sources") {
        await this.loadAvailable();
      }
      this.render();
      this.scrollToSourceFromURL({ behavior: "auto" });
      return true;
    } catch (error) {
      this.renderFatal(error);
      return false;
    }
  }

  unmount() {
    this.root?.removeEventListener("click", this.onClick);
    this.root?.removeEventListener("input", this.onInput);
    this.root?.removeEventListener("change", this.onChange);
    this.root?.removeEventListener("submit", this.onSubmit);
    this.window?.removeEventListener?.("resize", this.updateLayoutWidth);
    this.root?.remove();
    this.root = undefined;
    this.coreSections.forEach((section) => section.classList.remove("spme-core-hidden"));
    this.coreSections = [];
  }

  updateLayoutWidth() {
    if (!this.root || !this.window) return;
    const settingsContainer = this.document.querySelector("#settings-container");
    const left = settingsContainer?.getBoundingClientRect().left
      ?? this.root.getBoundingClientRect().left;
    const available = Math.max(320, this.window.innerWidth - left - 16);
    this.root.style.setProperty("--spme-available-width", `${available}px`);
  }

  focusSourceForm() {
    const form = this.root?.querySelector(".spme-source-form-inline");
    form?.querySelector('[name="name"]')?.focus({ preventScroll: true });
  }

  clearSourceAnchor() {
    if (!this.window?.history || !this.window?.location) return;
    const currentURL = `${this.window.location.pathname}${this.window.location.search}${this.window.location.hash}`;
    const nextURL = withoutPluginManagerSourceAnchor(currentURL);
    if (nextURL !== currentURL) this.window.history.replaceState({}, "", nextURL);
  }

  sourceReferenceHTML(pkg) {
    const label = pkg.sourceName || pkg.sourceURL || "Unknown";
    const source = this.inventory?.sources.find((candidate) => candidate.url === pkg.sourceURL);
    if (!source || !this.window?.location) return escapeHTML(label);
    const href = sourceAnchorHref(this.window.location.href, source.url);
    return `<a class="spme-source-link" data-action="open-source" href="${escapeHTML(href)}" aria-label="Open source ${escapeHTML(source.name || source.url)} in Sources">${escapeHTML(label)}</a>`;
  }

  scrollToSourceFromURL({ behavior = "smooth" } = {}) {
    if (this.activeTab !== "sources" || !this.window?.location?.hash) return false;
    const anchorID = this.window.location.hash.slice(1);
    if (!/^spme-source-[0-9a-f]{8}$/.test(anchorID)) return false;
    const target = this.document.getElementById(anchorID);
    if (!target || !this.root?.contains(target)) return false;
    target.scrollIntoView?.({ behavior, block: "center" });
    target.focus({ preventScroll: true });
    return true;
  }

  renderLoading(label) {
    if (this.root) {
      this.root.innerHTML = `<div class="spme-loading" role="status">${escapeHTML(
        label
      )}</div>`;
    }
  }

  renderFatal(error) {
    if (!this.root) return;
    this.root.innerHTML = `<div class="spme-alert spme-alert-error" role="alert"><strong>Enhanced plugin manager could not load.</strong><br>${escapeHTML(
      error instanceof Error ? error.message : String(error)
    )}<br><button type="button" data-action="retry">Retry</button> <button type="button" data-action="show-core">Use core page</button></div>`;
  }

  async refresh({ checkUpdates = this.inventory?.checkedUpdates ?? false } = {}) {
    this.busy = true;
    this.render();
    try {
      this.inventory = await this.service.loadInstalled({ checkUpdates });
      if (this.activeTab === "browse" || this.activeTab === "sources") {
        await this.loadAvailable(true);
      }
      this.message = { type: "success", text: "Plugin information refreshed." };
    } catch (error) {
      this.message = {
        type: "error",
        text: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.busy = false;
      this.render();
    }
  }

  async loadAvailable(force = false) {
    if (this.available && !force) return;
    this.available = await this.service.loadAvailable(
      this.inventory.sources,
      new Set(this.inventory.packages.map((pkg) => pkg.package_id))
    );
  }

  async setTab(tab, { updateURL = true } = {}) {
    if (!TAB_DEFINITIONS.some(([id]) => id === tab)) return;
    this.activeTab = tab;
    if (tab !== "sources") {
      this.editingSource = undefined;
      this.addingSource = false;
    }
    if (this.root) this.root.dataset.activeTab = tab;
    this.message = undefined;
    if (updateURL && this.window?.history && this.window?.location) {
      const nextURL = withoutPluginManagerSourceAnchor(withPluginManagerTab(this.window.location.href, tab));
      const currentURL = `${this.window.location.pathname}${this.window.location.search}${this.window.location.hash}`;
      if (nextURL !== currentURL) this.window.history.pushState({}, "", nextURL);
    }
    if ((tab === "browse" || tab === "sources") && !this.available) {
      this.render();
      try {
        await this.loadAvailable();
      } catch (error) {
        this.message = {
          type: "error",
          text: error instanceof Error ? error.message : String(error),
        };
      }
    }
    this.render();
    this.scrollToSourceFromURL();
  }

  syncFromURL() {
    const tab = pluginManagerTabFromURL(this.window?.location?.href ?? "");
    if (tab !== this.activeTab) return this.setTab(tab, { updateURL: false });
    this.scrollToSourceFromURL({ behavior: "auto" });
  }

  tabsHTML() {
    return `<div class="spme-tabs" role="tablist" aria-label="Plugin manager sections">
      ${TAB_DEFINITIONS.map(
        ([id, label]) => `<button type="button" role="tab" data-action="tab" data-tab="${id}"
          aria-selected="${this.activeTab === id}" class="${
            this.activeTab === id ? "active" : ""
          }">${label}</button>`
      ).join("")}
    </div>`;
  }

  messageHTML() {
    if (!this.message) return "";
    return `<div class="spme-alert spme-alert-${escapeHTML(
      this.message.type
    )}" role="status"><span class="spme-alert-content">${escapeHTML(this.message.text)}</span><button type="button" class="spme-alert-dismiss" data-action="dismiss-message" aria-label="Dismiss notification" title="Dismiss"><span aria-hidden="true">×</span></button></div>`;
  }

  headerHTML() {
    const updates = this.inventory.packages.filter((pkg) => pkg.status === "update").length;
    const enabled = this.inventory.packages.filter((pkg) => pkg.enabled).length;
    const viewToggle = this.activeTab === "installed" || this.activeTab === "browse"
      ? `<div class="spme-view-toggle" role="group" aria-label="Package display mode">
          <button type="button" data-action="set-view" data-view-mode="cards" aria-pressed="${this.viewMode === "cards"}">Cards</button>
          <button type="button" data-action="set-view" data-view-mode="table" aria-pressed="${this.viewMode === "table"}">Table</button>
        </div>`
      : "";
    return `<header class="spme-header">
      <div><h1>Plugin Manager Enhanced</h1><p>Install, update, inspect, configure, and verify plugins without nested scrolling.</p></div>
      <div class="spme-header-tools">
        <div class="spme-summary" aria-label="Plugin summary">
          <span><strong>${this.inventory.packages.length}</strong> installed</span>
          <span><strong>${enabled}</strong> enabled</span>
          <span class="${updates ? "spme-text-warning" : ""}"><strong>${updates}</strong> updates</span>
        </div>
        ${viewToggle}
      </div>
    </header>`;
  }

  toolbarHTML({ kind, count, selectedCount = 0, extra = "" }) {
    const label = kind === "installed" ? "installed plugins" : "available plugins";
    return `<div class="spme-toolbar">
      <label class="spme-search"><span>Search ${label}</span><input type="search" data-filter="${kind}" aria-label="Search ${label}" placeholder="Name, ID, description, or source" value="${escapeHTML(
        this.filters[kind].query
      )}"></label>
      ${extra}
      <span class="spme-result-count" aria-live="polite">${plural(count, "result")}</span>
      ${selectedCount ? `<span>${plural(selectedCount, "selected plugin")}</span>` : ""}
    </div>`;
  }

  sortControlHTML(kind) {
    const selected = this.filters[kind].sort;
    return `<label><span>Sort</span><select data-filter-select="${kind}-sort" aria-label="Sort ${kind === "installed" ? "installed" : "available"} plugins"><option value="name" ${selected === "name" ? "selected" : ""}>Plugin name (A–Z)</option><option value="last-commit" ${selected === "last-commit" ? "selected" : ""}>Last commit (newest)</option><option value="last-commit-oldest" ${selected === "last-commit-oldest" ? "selected" : ""}>Last commit (oldest)</option></select></label>`;
  }

  installedHTML() {
    const packages = sortPackages(filterPackages(this.inventory.packages, this.filters.installed), this.filters.installed.sort);
    const selected = packages.filter((pkg) => this.selectedInstalled.has(pkg.package_id));
    const updates = this.inventory.packages.filter((pkg) => pkg.status === "update");
    const filterExtras = `${this.sortControlHTML("installed")}<label><span>Status</span><select data-filter-select="installed-enabled" aria-label="Filter installed plugins by enabled status"><option value="">All states</option><option value="true" ${
      this.filters.installed.enabled === true ? "selected" : ""
    }>Enabled</option><option value="false" ${
      this.filters.installed.enabled === false ? "selected" : ""
    }>Disabled</option></select></label>
      <label class="spme-check"><input type="checkbox" data-filter-check="updates" ${
        this.filters.installed.updatesOnly ? "checked" : ""
      }> Updates only</label>`;
    return `<section class="spme-panel" role="tabpanel">
      <div class="spme-actions spme-sticky">
        <button type="button" data-action="check-updates" ${this.busy ? "disabled" : ""}>Check for updates</button>
        <button type="button" data-action="update-all" ${
          !updates.length || this.busy ? "disabled" : ""
        }>Update all (${updates.length})</button>
        <button type="button" data-action="update-selected" ${
          !selected.length || this.busy ? "disabled" : ""
        }>Update selected (${selected.length})</button>
        <button type="button" class="danger" data-action="uninstall-selected" ${
          !selected.length || this.busy ? "disabled" : ""
        }>Uninstall selected (${selected.length})</button>
        <button type="button" data-action="reload">Reload plugin definitions</button>
      </div>
      ${this.toolbarHTML({ kind: "installed", count: packages.length, selectedCount: selected.length, extra: filterExtras })}
      ${this.viewMode === "table"
        ? this.packageTable(packages, true)
        : `<div class="spme-list">${packages.map((pkg) => this.packageCard(pkg, true)).join("") || '<p class="spme-empty">No installed plugins match these filters.</p>'}</div>`}
    </section>`;
  }

  packageCard(pkg, installed) {
    const selected = installed
      ? this.selectedInstalled.has(pkg.package_id)
      : this.selectedAvailable.has(`${pkg.sourceURL}|${pkg.package_id}`);
    const selectKey = installed ? pkg.package_id : `${pkg.sourceURL}|${pkg.package_id}`;
    const status = pkg.runtimeOnly
      ? '<span class="spme-badge spme-runtime-only" title="Loaded from the plugins directory without a package-manager record.">Runtime-only</span>'
      : pkg.status === "update"
        ? '<span class="spme-badge spme-status-update">Update available</span>'
        : pkg.status === "unchecked"
          ? '<span class="spme-badge">Updates not checked</span>'
          : installed
            ? '<span class="spme-badge spme-status-current">Current</span>'
            : '<span class="spme-badge spme-status-available">Available</span>';
    const state = installed
      ? `<span class="spme-badge ${pkg.enabled ? "spme-enabled" : "spme-disabled"}">${pkg.enabled ? "Enabled" : "Disabled"}</span>`
      : "";
    const version = installed && pkg.source_package
      ? `${escapeHTML(pkg.version || "Unknown")} → ${escapeHTML(pkg.source_package.version || "Unknown")}`
      : escapeHTML(pkg.version || "Unknown");
    const capabilities = installed && pkg.capabilities?.length
      ? `<details class="spme-capabilities"><summary>Capabilities</summary><ul>${pkg.capabilities.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul></details>`
      : "";
    const actions = installed
      ? pkg.runtimeOnly
        ? `<button type="button" data-action="toggle-enabled" data-id="${escapeHTML(pkg.package_id)}">${pkg.enabled ? "Disable" : "Enable"}</button>`
        : `<button type="button" data-action="toggle-enabled" data-id="${escapeHTML(pkg.package_id)}">${pkg.enabled ? "Disable" : "Enable"}</button>
         <button type="button" data-action="update-one" data-id="${escapeHTML(pkg.package_id)}" ${pkg.status !== "update" ? "disabled" : ""}>Update</button>
         <button type="button" class="danger subtle" data-action="uninstall-one" data-id="${escapeHTML(pkg.package_id)}">Uninstall</button>`
      : `<button type="button" data-action="install-one" data-key="${escapeHTML(selectKey)}">Install</button>`;
    return `<article class="spme-package-card" data-package-id="${escapeHTML(pkg.package_id)}">
      <label class="spme-select"><input type="checkbox" data-select-package="${installed ? "installed" : "available"}" data-key="${escapeHTML(selectKey)}" aria-label="Select ${escapeHTML(pkg.name)}" ${selected ? "checked" : ""} ${pkg.runtimeOnly ? 'disabled title="Runtime-only plugins are not available for package operations."' : ""}></label>
      <div class="spme-package-main">
        <div class="spme-package-title"><div><h2>${escapeHTML(pkg.name)}</h2><code>${escapeHTML(pkg.package_id)}</code></div><div class="spme-badges">${status}${state}${trustBadge(pkg.trust)}</div></div>
        <p>${escapeHTML(packageDescription(pkg))}</p>
        <dl><div><dt>Version</dt><dd>${version}</dd></div><div><dt>Last commit</dt><dd>${packageCommitDateHTML(pkg)}</dd></div><div><dt>Source</dt><dd>${this.sourceReferenceHTML(pkg)}</dd></div></dl>
        ${capabilities}
      </div>
      <div class="spme-card-actions">${githubLink(pkg)}${actions}</div>
    </article>`;
  }

  packageTable(packages, installed) {
    if (!packages.length) return `<p class="spme-empty">No ${installed ? "installed" : "available"} plugins match these filters.</p>`;
    return `<div class="spme-table-scroll" tabindex="0" aria-label="${installed ? "Installed" : "Available"} plugin table">
      <table class="spme-package-table">
        <colgroup class="spme-columns-${installed ? "installed" : "browse"}">
          <col class="spme-col-select"><col class="spme-col-plugin"><col class="spme-col-description"><col class="spme-col-version"><col class="spme-col-last-commit"><col class="spme-col-source"><col class="spme-col-status"><col class="spme-col-actions">
        </colgroup>
        <thead><tr><th scope="col"><span class="visually-hidden">Select</span></th><th scope="col">Plugin</th><th scope="col">Description</th><th scope="col">Version</th><th scope="col">Last commit</th><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody>${packages.map((pkg) => this.packageTableRow(pkg, installed)).join("")}</tbody>
      </table>
    </div>`;
  }

  packageTableRow(pkg, installed) {
    const selected = installed
      ? this.selectedInstalled.has(pkg.package_id)
      : this.selectedAvailable.has(`${pkg.sourceURL}|${pkg.package_id}`);
    const selectKey = installed ? pkg.package_id : `${pkg.sourceURL}|${pkg.package_id}`;
    const status = pkg.runtimeOnly
      ? '<span class="spme-badge spme-runtime-only" title="Loaded from the plugins directory without a package-manager record.">Runtime-only</span>'
      : pkg.status === "update"
        ? '<span class="spme-badge spme-status-update">Update available</span>'
        : pkg.status === "unchecked"
          ? '<span class="spme-badge">Updates not checked</span>'
          : installed
            ? '<span class="spme-badge spme-status-current">Current</span>'
            : '<span class="spme-badge spme-status-available">Available</span>';
    const state = installed
      ? `<span class="spme-badge ${pkg.enabled ? "spme-enabled" : "spme-disabled"}">${pkg.enabled ? "Enabled" : "Disabled"}</span>`
      : "";
    const version = installed && pkg.source_package
      ? `${escapeHTML(pkg.version || "Unknown")} → ${escapeHTML(pkg.source_package.version || "Unknown")}`
      : escapeHTML(pkg.version || "Unknown");
    const actions = installed
      ? pkg.runtimeOnly
        ? `<button type="button" data-action="toggle-enabled" data-id="${escapeHTML(pkg.package_id)}">${pkg.enabled ? "Disable" : "Enable"}</button>`
        : `<button type="button" data-action="toggle-enabled" data-id="${escapeHTML(pkg.package_id)}">${pkg.enabled ? "Disable" : "Enable"}</button>
         <button type="button" data-action="update-one" data-id="${escapeHTML(pkg.package_id)}" ${pkg.status !== "update" ? "disabled" : ""}>Update</button>
         <button type="button" class="danger subtle" data-action="uninstall-one" data-id="${escapeHTML(pkg.package_id)}">Uninstall</button>`
      : `<button type="button" data-action="install-one" data-key="${escapeHTML(selectKey)}">Install</button>`;
    const capabilities = installed && pkg.capabilities?.length
      ? `<details class="spme-table-capabilities"><summary>Capabilities</summary><ul>${pkg.capabilities.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul></details>`
      : "";
    return `<tr data-package-id="${escapeHTML(pkg.package_id)}">
      <td class="spme-table-select"><input type="checkbox" data-select-package="${installed ? "installed" : "available"}" data-key="${escapeHTML(selectKey)}" aria-label="Select ${escapeHTML(pkg.name)}" ${selected ? "checked" : ""} ${pkg.runtimeOnly ? 'disabled title="Runtime-only plugins are not available for package operations."' : ""}></td>
      <td data-label="Plugin"><div class="spme-table-plugin"><strong>${escapeHTML(pkg.name)}</strong><code>${escapeHTML(pkg.package_id)}</code>${capabilities}</div></td>
      <td data-label="Description" class="spme-table-description">${escapeHTML(packageDescription(pkg))}</td>
      <td data-label="Version">${version}</td>
      <td data-label="Last commit">${packageCommitDateHTML(pkg)}</td>
      <td data-label="Source">${this.sourceReferenceHTML(pkg)}</td>
      <td data-label="Status"><div class="spme-badges">${status}${state}${trustBadge(pkg.trust)}</div></td>
      <td data-label="Actions"><div class="spme-table-actions">${githubLink(pkg)}${actions}</div></td>
    </tr>`;
  }

  browseHTML() {
    if (!this.available) return '<div class="spme-loading" role="status">Loading available plugins…</div>';
    const packages = sortPackages(filterPackages(this.available.packages, this.filters.browse), this.filters.browse.sort);
    const visiblePackages = packages.slice(0, this.browseLimit);
    const selected = packages.filter((pkg) => this.selectedAvailable.has(`${pkg.sourceURL}|${pkg.package_id}`));
    const sourceOptions = this.inventory.sources.map((source) => `<option value="${escapeHTML(source.url)}" ${this.filters.browse.source === source.url ? "selected" : ""}>${escapeHTML(source.name || source.url)}</option>`).join("");
    const extra = `${this.sortControlHTML("browse")}<label><span>Source</span><select data-filter-select="browse-source" aria-label="Filter available plugins by source"><option value="">All sources</option>${sourceOptions}</select></label>`;
    return `<section class="spme-panel" role="tabpanel">
      <div class="spme-actions spme-sticky"><button type="button" data-action="install-selected" ${!selected.length || this.busy ? "disabled" : ""}>Install selected (${selected.length})</button><button type="button" data-action="refresh-sources">Refresh catalog</button></div>
      ${this.toolbarHTML({ kind: "browse", count: packages.length, selectedCount: selected.length, extra })}
      ${this.viewMode === "table"
        ? this.packageTable(visiblePackages, false)
        : `<div class="spme-list">${visiblePackages.map((pkg) => this.packageCard(pkg, false)).join("") || '<p class="spme-empty">No available plugins match these filters.</p>'}</div>`}
      ${visiblePackages.length < packages.length ? `<div class="spme-load-more"><button type="button" data-action="load-more">Load ${Math.min(50, packages.length - visiblePackages.length)} more (${packages.length - visiblePackages.length} remaining)</button></div>` : ""}
    </section>`;
  }

  sourceFormHTML(source = {}, { editing = false } = {}) {
    return `<form class="spme-source-form spme-source-form-inline" data-source-form>
      <h2>${editing ? "Edit plugin source" : "Add plugin source"}</h2>
      <label><span>Name</span><input name="name" required value="${escapeHTML(source.name || "")}"></label>
      <label><span>Index URL</span><input name="url" type="url" required value="${escapeHTML(source.url || "")}"></label>
      <label><span>Local path</span><input name="local_path" value="${escapeHTML(source.local_path || "")}"></label>
      <div class="spme-source-form-actions"><button type="submit">${editing ? "Save source" : "Add source"}</button><button type="button" data-action="cancel-source">Cancel</button></div>
      <p class="spme-help">Duplicate names and URLs are rejected. Custom sources are treated as unverified unless hosted by the official Stash organization.</p>
    </form>`;
  }

  sourcesHTML() {
    if (!this.available) return '<div class="spme-loading" role="status">Checking plugin sources…</div>';
    const entries = sortSourceEntries(this.inventory.sources.map((source, index) => {
      const health = this.available.health.find((item) => item.source.url === source.url);
      const installed = this.inventory.packages.filter((pkg) => pkg.sourceURL === source.url);
      const enabled = installed.filter((pkg) => pkg.enabled).length;
      return { source, index, health, installed, enabled, packages: health?.packageCount ?? 0 };
    }), this.filters.sources.sort);
    const rows = entries.map(({ source, index, health, installed, enabled }) => {
      const trust = health?.source ? this.available.packages.find((pkg) => pkg.sourceURL === source.url)?.trust : undefined;
      const inferredTrust = trust ?? (source.url.includes("stashapp.github.io/CommunityScripts")
        ? { level: "official", label: "Official Stash source" }
        : source.url.includes("github")
          ? { level: "community", label: "Community GitHub source" }
          : { level: "unverified", label: "Unverified source" });
      const sourceLink = safeExternalUrl(source.url);
      const sourceURL = sourceLink
        ? `<a href="${escapeHTML(sourceLink)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.url)} ↗</a>`
        : `<code>${escapeHTML(source.url)}</code>`;
      const githubURL = deriveSourceGithubUrl(source.url);
      const repository = githubURL
        ? githubRepositoryLink(githubURL, source.name || "Unnamed source")
        : '<span class="spme-repo-missing">Repository unavailable</span>';
      const editing = this.editingSource === index;
      return `<article id="${sourceAnchorID(source.url)}" class="spme-source-card${editing ? " spme-source-card-editing" : ""}" data-source-index="${index}" tabindex="-1">
        <div><h2>${escapeHTML(source.name || "Unnamed source")}</h2>${sourceURL}<div class="spme-badges">${trustBadge(inferredTrust)}<span class="spme-badge ${health?.ok ? "spme-status-current" : "spme-status-error"}">${health?.ok ? "Healthy" : "Error"}</span></div></div>
        <dl><div><dt>Packages</dt><dd>${plural(health?.packageCount ?? 0, "package")}</dd></div><div><dt>Installed</dt><dd>${plural(installed.length, "plugin")}</dd></div><div><dt>Enabled</dt><dd>${plural(enabled, "plugin")}</dd></div><div><dt>Last checked</dt><dd>${escapeHTML(formatDate(health?.checkedAt))}</dd></div><div><dt>Local path</dt><dd>${escapeHTML(source.local_path || "Default")}</dd></div></dl>
        ${health?.error ? sourceErrorHTML(health.error) : ""}
        ${editing
          ? this.sourceFormHTML(source, { editing: true })
          : `<div class="spme-card-actions">${repository}<button type="button" data-action="edit-source" data-index="${index}">Edit</button><button type="button" class="danger subtle" data-action="delete-source" data-index="${index}">Delete</button></div>`}
      </article>`;
    }).join("");
    const addCard = this.addingSource
      ? `<article class="spme-source-card spme-source-card-adding" data-add-source-card>${this.sourceFormHTML()}</article>`
      : "";
    const sortOptions = SOURCE_SORT_OPTIONS.map(([value, label]) => `<option value="${value}" ${this.filters.sources.sort === value ? "selected" : ""}>${label}</option>`).join("");
    return `<section class="spme-panel" role="tabpanel">
      <div class="spme-actions spme-sticky"><button type="button" data-action="refresh-sources">Check all sources</button><button type="button" data-action="add-source" aria-expanded="${this.addingSource}" ${this.addingSource ? "disabled" : ""}>Add plugin source</button></div>
      <div class="spme-toolbar"><label><span>Sort</span><select data-filter-select="sources-sort" aria-label="Sort plugin sources">${sortOptions}</select></label><span class="spme-result-count">${plural(entries.length, "source")}</span></div>
      ${addCard}
      <div class="spme-source-grid">${rows || '<p class="spme-empty">No plugin sources configured.</p>'}</div>
    </section>`;
  }

  configurationHTML() {
    const query = this.filters.configuration.query.trim().toLowerCase();
    const packages = this.inventory.packages.filter((pkg) => {
      if (!pkg.plugin) return false;
      if (typeof this.filters.configuration.enabled === "boolean" && pkg.enabled !== this.filters.configuration.enabled) return false;
      const text = [pkg.name, pkg.package_id, packageDescription(pkg), ...(pkg.plugin.settings ?? []).map((setting) => `${setting.name} ${setting.display_name} ${setting.description}`)].join(" ").toLowerCase();
      return !query || text.includes(query);
    });
    const extra = `<label><span>Status</span><select data-filter-select="configuration-enabled" aria-label="Filter plugin configuration by enabled status"><option value="">All states</option><option value="true" ${this.filters.configuration.enabled === true ? "selected" : ""}>Enabled</option><option value="false" ${this.filters.configuration.enabled === false ? "selected" : ""}>Disabled</option></select></label>`;
    return `<section class="spme-panel" role="tabpanel">
      <div class="spme-actions spme-sticky"><button type="button" data-action="expand-config">Expand all</button><button type="button" data-action="collapse-config">Collapse all</button></div>
      ${this.toolbarHTML({ kind: "configuration", count: packages.length, extra })}
      <div class="spme-config-list">${packages.map((pkg) => this.pluginConfigCard(pkg)).join("") || '<p class="spme-empty">No plugin configuration matches these filters.</p>'}</div>
    </section>`;
  }

  pluginConfigCard(pkg) {
    const plugin = pkg.plugin;
    const config = this.inventory.pluginConfig[plugin.id] ?? {};
    const hooks = (plugin.hooks ?? []).map((hook) => `<div class="spme-hook"><strong>${escapeHTML(hook.name)}</strong><p>${escapeHTML(hook.description || "")}</p><ul>${(hook.hooks ?? []).map((event) => `<li><code>${escapeHTML(event)}</code></li>`).join("")}</ul></div>`).join("");
    const settings = (plugin.settings ?? []).map((setting) => {
      const value = config[setting.name];
      const label = setting.display_name || setting.name;
      let input;
      if (setting.type === "BOOLEAN") {
        input = `<input type="checkbox" data-config-input data-plugin="${escapeHTML(plugin.id)}" data-setting="${escapeHTML(setting.name)}" aria-label="${escapeHTML(label)}" ${value ? "checked" : ""}>`;
      } else {
        input = `<input data-config-input data-plugin="${escapeHTML(plugin.id)}" data-setting="${escapeHTML(setting.name)}" data-setting-type="${escapeHTML(setting.type)}" aria-label="${escapeHTML(label)}" type="${setting.type === "NUMBER" ? "number" : "text"}" value="${escapeHTML(value ?? "")}">`;
      }
      return `<label class="spme-setting"><span><strong>${escapeHTML(label)}</strong><small>${escapeHTML(setting.description || setting.name)}</small></span>${input}</label>`;
    }).join("");
    return `<details class="spme-plugin-config" data-plugin-id="${escapeHTML(plugin.id)}"><summary><span><strong>${escapeHTML(plugin.name)}</strong> <code>${escapeHTML(plugin.id)}</code></span><span class="spme-badges"><span class="spme-badge ${pkg.enabled ? "spme-enabled" : "spme-disabled"}">${pkg.enabled ? "Enabled" : "Disabled"}</span>${githubLink(pkg)}</span></summary><div class="spme-config-body">${plugin.description ? `<p>${escapeHTML(plugin.description)}</p>` : ""}${hooks ? `<section><h3>Hooks</h3>${hooks}</section>` : ""}${settings ? `<section><h3>Settings</h3>${settings}</section>` : '<p>No configurable settings.</p>'}<div class="spme-actions"><button type="button" data-action="save-config" data-id="${escapeHTML(plugin.id)}">Save changes</button><button type="button" data-action="reset-config" data-id="${escapeHTML(plugin.id)}">Reset stored settings</button></div><p class="spme-help">Stash plugin manifests do not declare filesystem or network permissions, compatibility ranges, or setting defaults. This page does not infer them.</p></div></details>`;
  }

  render() {
    if (!this.root || !this.inventory) return;
    const panels = {
      installed: () => this.installedHTML(),
      browse: () => this.browseHTML(),
      sources: () => this.sourcesHTML(),
      configuration: () => this.configurationHTML(),
    };
    this.root.innerHTML = `${this.headerHTML()}${this.tabsHTML()}${this.messageHTML()}${panels[this.activeTab]()}`;
  }

  packageByID(id) {
    return this.inventory.packages.find((pkg) => pkg.package_id === id);
  }

  availableByKey(key) {
    return this.available?.packages.find((pkg) => `${pkg.sourceURL}|${pkg.package_id}` === key);
  }

  async runOperation(label, fn) {
    this.busy = true;
    this.message = { type: "info", text: `${label}…` };
    this.render();
    let succeeded = false;
    try {
      const result = await fn();
      if (typeof result === "string" && this.service.waitForJob) {
        this.message = { type: "info", text: `${label}… waiting for job ${result}` };
        this.render();
        await this.service.waitForJob(result);
      }
      this.inventory = await this.service.loadInstalled({ checkUpdates: true });
      if (this.activeTab === "browse" || this.activeTab === "sources") {
        await this.loadAvailable(true);
      }
      this.message = { type: "success", text: `${label} completed.` };
      succeeded = true;
    } catch (error) {
      this.message = { type: "error", text: error instanceof Error ? error.message : String(error) };
    } finally {
      this.busy = false;
      this.render();
    }
    return succeeded;
  }

  async onClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "open-source") {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const nextURL = button.getAttribute("href");
      const currentURL = `${this.window.location.pathname}${this.window.location.search}${this.window.location.hash}`;
      if (nextURL && nextURL !== currentURL) this.window.history.pushState({}, "", nextURL);
      return this.setTab("sources", { updateURL: false });
    }
    if (action === "tab") return this.setTab(button.dataset.tab);
    if (action === "dismiss-message") {
      this.message = undefined;
      return this.render();
    }
    if (action === "set-view") {
      this.viewMode = button.dataset.viewMode === "table" ? "table" : "cards";
      this.root.dataset.viewMode = this.viewMode;
      try {
        this.storage?.setItem("spme.viewMode", this.viewMode);
      } catch {
        // Storage may be unavailable in privacy-restricted browser contexts.
      }
      return this.render();
    }
    if (action === "retry") return this.mount();
    if (action === "show-core") return this.unmount();
    if (action === "check-updates") return this.refresh({ checkUpdates: true });
    if (action === "refresh-sources") {
      this.available = undefined;
      this.browseLimit = 50;
      return this.setTab(this.activeTab);
    }
    if (action === "reload") return this.runOperation("Reloading plugin definitions", () => this.service.reloadPlugins());
    if (action === "expand-config" || action === "collapse-config") {
      this.root.querySelectorAll("details.spme-plugin-config").forEach((details) => { details.open = action === "expand-config"; });
      return;
    }
    if (action === "load-more") {
      this.browseLimit += 50;
      return this.render();
    }
    if (action === "toggle-enabled") {
      const pkg = this.packageByID(button.dataset.id);
      if (!pkg) return;
      await this.runOperation(`${pkg.enabled ? "Disabling" : "Enabling"} ${pkg.name}`, () => this.service.setEnabled(pkg.package_id, !pkg.enabled));
      return;
    }

    const installedSelected = this.inventory.packages.filter((pkg) => this.selectedInstalled.has(pkg.package_id));
    const availableSelected = this.available?.packages.filter((pkg) => this.selectedAvailable.has(`${pkg.sourceURL}|${pkg.package_id}`)) ?? [];
    if (action === "update-all") return this.runOperation("Updating all available plugins", () => this.service.update(this.inventory.packages.filter((pkg) => pkg.status === "update")));
    if (action === "update-selected") return this.runOperation("Updating selected plugins", () => this.service.update(installedSelected));
    if (action === "install-selected") return this.runOperation("Installing selected plugins", () => this.service.install(availableSelected));
    if (action === "update-one") {
      const pkg = this.packageByID(button.dataset.id);
      return this.runOperation(`Updating ${pkg.name}`, () => this.service.update([pkg]));
    }
    if (action === "install-one") {
      const pkg = this.availableByKey(button.dataset.key);
      return this.runOperation(`Installing ${pkg.name}`, () => this.service.install([pkg]));
    }
    if (action === "uninstall-one" || action === "uninstall-selected") {
      const packages = action === "uninstall-one" ? [this.packageByID(button.dataset.id)] : installedSelected;
      const names = packages.map((pkg) => pkg.name).join(", ");
      if (!this.confirm?.(`Uninstall ${names}? Stash will remove the package files. Review dependencies before continuing.`)) return;
      return this.runOperation(`Uninstalling ${plural(packages.length, "plugin")}`, () => this.service.uninstall(packages));
    }
    if (action === "add-source") {
      this.clearSourceAnchor();
      this.addingSource = true;
      this.editingSource = undefined;
      this.render();
      this.focusSourceForm();
      return;
    }
    if (action === "edit-source") {
      this.clearSourceAnchor();
      this.addingSource = false;
      this.editingSource = Number(button.dataset.index);
      this.render();
      this.focusSourceForm();
      return;
    }
    if (action === "cancel-source") {
      this.addingSource = false;
      this.editingSource = undefined;
      return this.render();
    }
    if (action === "delete-source") {
      const index = Number(button.dataset.index);
      const source = this.inventory.sources[index];
      if (!this.confirm?.(`Delete plugin source “${source.name || source.url}”? Installed plugins will remain installed.`)) return;
      const sources = this.inventory.sources.filter((_, i) => i !== index);
      await this.runOperation(`Deleting source ${source.name || source.url}`, () => this.service.saveSources(sources));
      this.inventory.sources = sources;
      this.available = undefined;
      return;
    }
    if (action === "save-config") return this.savePluginConfig(button.dataset.id);
    if (action === "reset-config") {
      const pkg = this.packageByID(button.dataset.id);
      if (!this.confirm?.(`Reset all stored settings for ${pkg.name}? Plugin defaults will apply after reload.`)) return;
      await this.runOperation(`Resetting ${pkg.name} settings`, () => this.service.configurePlugin(pkg.package_id, {}));
    }
  }

  onInput(event) {
    const kind = event.target.dataset.filter;
    if (!kind) return;
    this.filters[kind].query = event.target.value;
    if (kind === "browse") this.browseLimit = 50;
    this.render();
    const input = this.root.querySelector(`[data-filter="${kind}"]`);
    input?.focus();
    input?.setSelectionRange?.(input.value.length, input.value.length);
  }

  onChange(event) {
    const target = event.target;
    if (target.dataset.selectPackage) {
      const set = target.dataset.selectPackage === "installed" ? this.selectedInstalled : this.selectedAvailable;
      target.checked ? set.add(target.dataset.key) : set.delete(target.dataset.key);
      return this.render();
    }
    if (target.dataset.filterCheck === "updates") {
      this.filters.installed.updatesOnly = target.checked;
      return this.render();
    }
    if (target.dataset.filterSelect === "installed-sort" || target.dataset.filterSelect === "browse-sort") {
      const kind = target.dataset.filterSelect.startsWith("installed") ? "installed" : "browse";
      this.filters[kind].sort = ["last-commit", "last-commit-oldest"].includes(target.value) ? target.value : "name";
      if (kind === "browse") this.browseLimit = 50;
      return this.render();
    }
    if (target.dataset.filterSelect === "installed-enabled" || target.dataset.filterSelect === "configuration-enabled") {
      const value = target.value === "" ? undefined : target.value === "true";
      const kind = target.dataset.filterSelect.startsWith("installed") ? "installed" : "configuration";
      this.filters[kind].enabled = value;
      return this.render();
    }
    if (target.dataset.filterSelect === "browse-source") {
      this.filters.browse.source = target.value;
      this.browseLimit = 50;
      return this.render();
    }
    if (target.dataset.filterSelect === "sources-sort") {
      this.filters.sources.sort = SOURCE_SORT_OPTIONS.some(([value]) => value === target.value) ? target.value : "name";
      return this.render();
    }
  }

  onSubmit(event) {
    if (!event.target.matches("[data-source-form]")) return;
    event.preventDefault();
    this.submitSourceForm(event.target);
  }

  async savePluginConfig(pluginID) {
    const current = { ...(this.inventory.pluginConfig[pluginID] ?? {}) };
    [...this.root.querySelectorAll("[data-config-input]")]
      .filter((input) => input.dataset.plugin === pluginID)
      .forEach((input) => {
        const type = input.dataset.settingType;
        if (type === "NUMBER" && input.value.trim() === "") {
          delete current[input.dataset.setting];
          return;
        }
        current[input.dataset.setting] = input.type === "checkbox"
          ? input.checked
          : type === "NUMBER"
            ? Number(input.value)
            : input.value;
      });
    await this.runOperation(`Saving ${this.packageByID(pluginID).name} settings`, () => this.service.configurePlugin(pluginID, current));
    this.inventory.pluginConfig[pluginID] = current;
  }

  async submitSourceForm(form) {
    const values = Object.fromEntries(new FormData(form));
    const sourceURL = safeExternalUrl(values.url.trim());
    if (!sourceURL) {
      this.message = { type: "error", text: "Source URLs must use HTTP or HTTPS." };
      return this.render();
    }
    const source = { name: values.name.trim(), url: sourceURL, local_path: values.local_path.trim() || null };
    const duplicate = this.inventory.sources.some((item, index) => index !== this.editingSource && (item.name === source.name || item.url === source.url));
    if (duplicate) {
      this.message = { type: "error", text: "A source with that name or URL already exists." };
      return this.render();
    }
    const sources = this.inventory.sources.slice();
    const editing = this.editingSource !== undefined;
    if (!editing) sources.push(source);
    else sources[this.editingSource] = source;
    const saved = await this.runOperation(`${editing ? "Updating" : "Adding"} source ${source.name}`, () => this.service.saveSources(sources));
    if (!saved) return;
    this.inventory.sources = sources;
    this.addingSource = false;
    this.editingSource = undefined;
    this.render();
  }
}
