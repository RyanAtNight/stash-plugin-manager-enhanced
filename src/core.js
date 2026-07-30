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

function normaliseGithubUrl(value) {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(GITHUB_URL);
  if (!match) return undefined;
  return `https://github.com/${match[1]}/${match[2].replace(/\.git$/i, "")}`;
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
  const branch = parts.length > 2 ? parts[1] : "main";
  return `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}/plugins/${encodeURIComponent(packageId)}`;
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
