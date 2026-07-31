const GITHUB_URL = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:[/?#].*)?$/i;

const PLUGIN_MANAGER_TABS = new Set([
  "installed",
  "browse",
  "sources",
  "configuration",
]);

export function isPluginsSettingsRoute(value = window.location.href) {
  const url = new URL(value, "http://stash.local");
  return url.pathname.replace(/\/$/, "") === "/settings" && url.searchParams.get("tab") === "plugins";
}

export function pluginManagerTabFromURL(value = window.location.href) {
  const url = new URL(value, "http://stash.local");
  const tab = url.searchParams.get("pluginManagerTab");
  return PLUGIN_MANAGER_TABS.has(tab) ? tab : "installed";
}

export function withPluginManagerTab(value, tab) {
  const url = new URL(value, "http://stash.local");
  url.searchParams.set(
    "pluginManagerTab",
    PLUGIN_MANAGER_TABS.has(tab) ? tab : "installed"
  );
  return `${url.pathname}${url.search}${url.hash}`;
}

export function sourceAnchorID(sourceURL = "") {
  let hash = 0x811c9dc5;
  for (const character of String(sourceURL)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `spme-source-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function sourceAnchorHref(value, sourceURL) {
  const url = new URL(value, "http://stash.local");
  url.searchParams.set("pluginManagerTab", "sources");
  url.hash = sourceAnchorID(sourceURL);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function withoutPluginManagerSourceAnchor(value) {
  const url = new URL(value, "http://stash.local");
  if (/^#spme-source-[0-9a-f]{8}$/.test(url.hash)) url.hash = "";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function configurationAnchorID(pluginID = "") {
  let hash = 0x811c9dc5;
  for (const character of String(pluginID)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `spme-config-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function configurationAnchorHref(value, pluginID) {
  const url = new URL(value, "http://stash.local");
  url.searchParams.set("pluginManagerTab", "configuration");
  url.hash = configurationAnchorID(pluginID);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function withoutPluginManagerConfigurationAnchor(value) {
  const url = new URL(value, "http://stash.local");
  if (/^#spme-config-[0-9a-f]{8}$/.test(url.hash)) url.hash = "";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function installedAnchorID(packageID = "") {
  let hash = 0x811c9dc5;
  for (const character of String(packageID)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `spme-installed-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function installedAnchorHref(value, packageID) {
  const url = new URL(value, "http://stash.local");
  url.searchParams.set("pluginManagerTab", "installed");
  url.hash = installedAnchorID(packageID);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function withoutPluginManagerInstalledAnchor(value) {
  const url = new URL(value, "http://stash.local");
  if (/^#spme-installed-[0-9a-f]{8}$/.test(url.hash)) url.hash = "";
  return `${url.pathname}${url.search}${url.hash}`;
}

function normaliseGithubUrl(value) {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(GITHUB_URL);
  if (!match) return undefined;
  return `https://github.com/${match[1]}/${match[2].replace(/\.git$/i, "")}`;
}

export function deriveSourceGithubUrl(value) {
  const direct = normaliseGithubUrl(value);
  if (direct) return direct;

  let source;
  try {
    source = new URL(value);
  } catch {
    return undefined;
  }

  const parts = source.pathname.split("/").filter(Boolean);
  if (source.hostname.toLowerCase() === "raw.githubusercontent.com" && parts.length >= 2) {
    return `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
  }

  const pages = source.hostname.match(/^([^.]+)\.github\.io$/i);
  const repo = parts[0];
  if (!pages || !repo || /\.ya?ml$/i.test(repo)) return undefined;
  return `https://github.com/${pages[1]}/${repo.replace(/\.git$/i, "")}`;
}

export function deriveGithubUrl({ pluginUrl, metadata = {}, sourceUrl, packageId } = {}) {
  const candidates = [
    pluginUrl,
    metadata.repository,
    metadata.repository_url,
    metadata.repo,
    metadata.github,
    metadata.homepage,
    metadata.url,
  ];
  for (const candidate of candidates) {
    const result = normaliseGithubUrl(candidate);
    if (result) return result;
  }

  if (!sourceUrl || !packageId) return undefined;
  let source;
  try {
    source = new URL(sourceUrl);
  } catch {
    return undefined;
  }

  const hostMatch = source.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!hostMatch) return undefined;
  const owner = hostMatch[1];
  const parts = source.pathname.split("/").filter(Boolean);
  const repo = parts[0];
  if (!repo) return undefined;
  const channel = parts.length > 2 ? parts[1] : "main";
  const branch = owner.toLowerCase() === "stashapp" && repo.toLowerCase() === "communityscripts" && channel === "stable"
    ? "main"
    : channel;
  return `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}/plugins/${encodeURIComponent(packageId)}`;
}

export function requiredPluginIDs(pkg = {}) {
  const declared = Array.isArray(pkg.requires)
    ? pkg.requires
    : Array.isArray(pkg.plugin?.requires)
      ? pkg.plugin.requires
      : [];
  const ownID = String(pkg.package_id ?? pkg.id ?? "");
  return [...new Set(declared
    .map((requirement) => typeof requirement === "string" ? requirement : requirement?.package_id)
    .filter((id) => typeof id === "string" && id && id !== ownID))];
}

export function dependentPlugins(packages, dependencyID, { enabledOnly = false } = {}) {
  return (packages ?? []).filter((pkg) =>
    (!enabledOnly || pkg.enabled) && requiredPluginIDs(pkg).includes(dependencyID)
  );
}

export function orphanedDependencies(packages, dependencyIDs, { enabledOnly = false } = {}) {
  const byID = new Map((packages ?? []).map((pkg) => [pkg.package_id, pkg]));
  return [...new Set(dependencyIDs ?? [])]
    .map((id) => byID.get(id))
    .filter((dependency) => dependency && dependentPlugins(packages, dependency.package_id, { enabledOnly }).length === 0);
}

export function safeExternalUrl(value) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function sourceTrust(sourceUrl = "") {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch {
    return { level: "unverified", label: "Unverified source" };
  }
  if (
    url.hostname.toLowerCase() === "stashapp.github.io" &&
    url.pathname.toLowerCase().startsWith("/communityscripts/")
  ) {
    return { level: "official", label: "Official Stash source" };
  }
  if (
    url.hostname.toLowerCase() === "github.com" ||
    url.hostname.toLowerCase().endsWith(".github.io")
  ) {
    return { level: "community", label: "Community GitHub source" };
  }
  return { level: "unverified", label: "Unverified source" };
}

export function packageStatus(pkg = {}) {
  if (!pkg.source_package) return "unchecked";
  if (!pkg.date || !pkg.source_package.date) return "current";
  return new Date(pkg.source_package.date) > new Date(pkg.date)
    ? "update"
    : "current";
}

function searchableText(pkg) {
  return [
    pkg.name,
    pkg.package_id,
    pkg.metadata?.description,
    pkg.sourceName,
    pkg.version,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterPackages(
  packages,
  { query = "", enabled, updatesOnly = false, source } = {}
) {
  const needle = query.trim().toLowerCase();
  return packages.filter((pkg) => {
    if (needle && !searchableText(pkg).includes(needle)) return false;
    if (typeof enabled === "boolean" && pkg.enabled !== enabled) return false;
    if (updatesOnly && pkg.status !== "update") return false;
    if (source && pkg.sourceURL !== source) return false;
    return true;
  });
}

export function packageLastCommitDate(pkg = {}) {
  return [pkg.source_package?.date, pkg.date].find((value) => value && !Number.isNaN(Date.parse(value)));
}

export function sortPackages(packages, sort = "name") {
  const byName = (left, right) =>
    String(left.name || left.package_id || "").localeCompare(
      String(right.name || right.package_id || ""),
      undefined,
      { sensitivity: "base" }
    );
  return [...packages].sort((left, right) => {
    if (sort !== "last-commit" && sort !== "last-commit-oldest") return byName(left, right);
    const leftDate = packageLastCommitDate(left);
    const rightDate = packageLastCommitDate(right);
    if (!leftDate && !rightDate) return byName(left, right);
    if (!leftDate) return 1;
    if (!rightDate) return -1;
    const dateOrder = sort === "last-commit-oldest"
      ? Date.parse(leftDate) - Date.parse(rightDate)
      : Date.parse(rightDate) - Date.parse(leftDate);
    return dateOrder || byName(left, right);
  });
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function capabilitySummary(plugin = {}) {
  const result = [];
  if (plugin.hooks?.length) result.push(countLabel(plugin.hooks.length, "hook"));
  if (plugin.tasks?.length) result.push(countLabel(plugin.tasks.length, "task"));
  if (plugin.paths?.javascript?.length) result.push("UI JavaScript");
  if (plugin.paths?.css?.length) result.push("UI CSS");
  if (plugin.settings?.length)
    result.push(countLabel(plugin.settings.length, "setting"));
  result.push("Filesystem/network permissions are not declared by Stash");
  return result;
}
