# Git commits and displayed version

- Commit completed changes after relevant checks pass. Make a separate commit
  for each coherent fix or feature, stage only your work, and preserve unrelated
  changes. Report the commit hash when finished. Do not push unless asked.
- For every commit you make in this project, the Plugin Manager Enhanced UI
  must display the base version followed by a hyphen and that commit's short
  Git ID: `Version 0.1.0-<commit id>` (for example, `Version 0.1.0-c0da0a2`).
- Derive the suffix from `git rev-parse --short HEAD` when building the committed
  revision. Replace the previous suffix rather than accumulating commit IDs.
  Keep the base release version in the package and plugin manifests unchanged
  unless a release version change is requested.
- Build after committing so the displayed suffix identifies the new commit,
  not its parent. Verify the displayed version before reporting a deployed
  change as complete. Do not hard-code a commit's own hash into tracked files
  or create an extra commit solely to update the suffix.
