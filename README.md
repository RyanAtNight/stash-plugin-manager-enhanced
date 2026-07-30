# Stash Plugin Manager Enhanced

A client-side Stash UI plugin that progressively replaces **Settings → Plugins** with a wider, accessible interface while leaving Stash core unchanged.

## Why this is possible

Stash UI plugins may load JavaScript and CSS globally. This plugin watches Stash SPA navigation for `/settings?tab=plugins`, hides the three stock plugin sections, mounts the enhanced interface, and restores the stock sections when navigating away or when the enhancement is dismissed.

The integration is intentionally progressive because Stash's `SettingsPluginsPanel` is not currently exposed as a named patchable component. Stash's UI plugin API is experimental, so DOM integration may need adjustment after future Stash UI changes.

## Features

- Separate **Installed**, **Browse**, **Sources**, and **Configuration** views
- Subtab URLs such as `?tab=plugins&pluginManagerTab=configuration` survive refresh and browser history
- Browse renders 50 packages initially with progressive **Load more** controls
- No nested package-list scroll areas
- Responsive, wider layout with sticky actions
- Table descriptions wrap naturally instead of being truncated
- Search by name, ID, description, version, and source
- Per-plugin last-commit dates with name or newest-commit sorting
- Enabled, disabled, source, and updates-only filters
- Visible installed/enabled/update counts
- Individual and bulk installation, updating, and uninstalling
- Per-plugin enable/disable controls
- Runtime-only plugins appear only when present, with enable/disable controls and package operations safely unavailable
- Source health, package counts, trust labels, last-check time, and repository-root GitHub links
- Temporary top-of-list source creation, source deletion, and in-place card editing with duplicate checks
- Installed and Browse source labels link to stable, URL-addressable cards in **Sources**, including refresh and browser-history restoration
- Collapsed-by-default plugin configuration with expand/collapse all
- Explicit hook names and trigger events
- Manifest-derived capability summaries
- Accessible selection labels and contextual search labels
- Operation feedback, package-job completion polling, and destructive confirmations
- Blank numeric settings are omitted from saved configuration instead of being coerced to `0`
- Clickable GitHub links for installed and available plugins

## GitHub URL resolution

Repository buttons open in a new tab with `noopener noreferrer`. Resolution order:

1. Loaded plugin `url`
2. Package metadata keys such as `repository`, `repository_url`, `repo`, `github`, `homepage`, or `url`
3. Conventional GitHub Pages package indexes

For example:

```text
https://stashapp.github.io/CommunityScripts/stable/index.yml
```

and package `VideoScrollWheel` resolve to:

```text
https://github.com/stashapp/CommunityScripts/tree/stable/plugins/VideoScrollWheel
```

If no defensible GitHub URL can be found, the UI displays **Repository unavailable** rather than guessing.

## Development

```bash
npm install
npm test
npm run build
npm run check
```

The packaged plugin is written to `dist/`.

## Local installation

Copy the three files in `dist/` to a directory beneath the Stash configuration's `plugins` directory, then choose **Reload plugins** in Stash or restart Stash.

Expected layout:

```text
plugins/
└── stash-plugin-manager-enhanced/
    ├── stash-plugin-manager-enhanced.yml
    ├── stash-plugin-manager-enhanced.js
    └── stash-plugin-manager-enhanced.css
```

## Honest client-side limitations

Stash does not currently expose enough package metadata to implement every desirable package-manager feature safely:

- **Rollback:** package history and previous archives are not exposed.
- **Compatibility ranges:** plugin manifests do not declare a supported Stash version range.
- **Permissions:** filesystem and network permissions are not declared by manifests.
- **Setting defaults/effective values:** manifests expose type and description but not machine-readable universal defaults or validation ranges. The UI therefore leaves absent numeric values blank and omits them when saved; it does not parse prose descriptions and guess defaults.
- **Cryptographic publisher identity:** indexes provide package hashes, but Stash does not expose a signed publisher identity to the UI.

The interface states these limitations instead of inferring potentially misleading values. Official/community labels describe the package **source**, not a security audit of the plugin.

## Security model

- GraphQL requests are same-origin and use the active Stash session.
- Package/source strings are HTML-escaped before rendering.
- Only HTTP(S) package-source URLs become clickable links; unsafe schemes are displayed as text and rejected by the source form.
- External links use `noopener noreferrer`.
- Non-GitHub source URLs are never converted into invented GitHub links.
- Destructive operations require confirmation.

## Status

Initial local development version: `0.1.0`.
