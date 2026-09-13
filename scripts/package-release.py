"""Build the Stash source index and reproducible install ZIP (standard library only)."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
from datetime import datetime, timezone
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_ID = "stash-plugin-manager-enhanced"
REPOSITORY = f"https://github.com/RyanAtNight/{PACKAGE_ID}"


def package_release():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    version = package["version"]
    manifest = (ROOT / "dist" / f"{PACKAGE_ID}.yml").read_text(encoding="utf-8")
    if f"version: {version}\n" not in manifest:
        raise ValueError("Manifest and package.json versions must match")
    tag = os.environ.get("GITHUB_REF", "")
    if tag.startswith("refs/tags/") and tag != f"refs/tags/v{version}":
        raise ValueError("Release tag must match package.json version")
    timestamp = int(subprocess.check_output(
        ["git", "log", "-1", "--format=%ct"], cwd=ROOT, text=True).strip())
    date = datetime.fromtimestamp(timestamp, timezone.utc)
    output = ROOT / "_site"
    output.mkdir(exist_ok=True)
    archive = output / f"{PACKAGE_ID}.zip"
    filenames = ["LICENSE", f"{PACKAGE_ID}.yml", f"{PACKAGE_ID}.js",
                 f"{PACKAGE_ID}.js.map", f"{PACKAGE_ID}.css"]
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for filename in filenames:
            info = zipfile.ZipInfo(filename, date.timetuple()[:6])
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, (ROOT / "dist" / filename).read_bytes())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    # JSON string literals are valid YAML scalars.
    index = f'''- id: {PACKAGE_ID}
  name: Stash Plugin Manager Enhanced
  version: {json.dumps(version)}
  date: {json.dumps(date.strftime("%Y-%m-%d %H:%M:%S"))}
  path: {PACKAGE_ID}.zip
  sha256: {digest}
  metadata:
    description: {json.dumps(package["description"])}
    repository: {REPOSITORY}
'''
    (output / "index.yml").write_text(index, encoding="utf-8", newline="\n")
    (output / "SHA256SUMS").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    (output / "index.html").write_text(f'''<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Stash Plugin Manager Enhanced</title>
<h1>Stash Plugin Manager Enhanced</h1>
<p>Add this source in Stash Settings &gt; Plugins:</p>
<p><a href="index.yml">https://ryanatnight.github.io/{PACKAGE_ID}/index.yml</a></p>
<p><a href="{REPOSITORY}#installation">Installation instructions and screenshots</a></p>
<p><a href="{archive.name}">Download v{version}</a> · <a href="SHA256SUMS">SHA-256</a></p>
</html>''', encoding="utf-8")
    print(f"Packaged {archive.name} v{version}: {digest}")


if __name__ == "__main__":
    package_release()
