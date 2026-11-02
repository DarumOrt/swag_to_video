"""Mirror pinned ONNX model files to our Hugging Face repos and generate models.json.

Run locally by the repo owner (see README.md in this folder):

    python scripts/models/publish_models.py            # download, verify, upload, write models.json
    python scripts/models/publish_models.py --dry-run  # download + verify only, no upload

Reads HF_TOKEN from the environment or from .env at the repo root. Never prints the token.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from huggingface_hub import CommitOperationAdd, CommitOperationDelete, HfApi, hf_hub_download

ROOT = Path(__file__).resolve().parents[2]
SOURCES = Path(__file__).with_name("sources.json")
CACHE = Path(__file__).with_name(".cache")
MANIFEST = ROOT / "models.json"
MANIFEST_SCHEMA_VERSION = 1

# Files the HF repo creates itself; never deleted by the sync.
KEEP_IN_TARGET = {".gitattributes", "README.md"}


@dataclass
class LocalFile:
    path: str  # path inside the repo, e.g. "onnx/encoder_model.onnx"
    local: Path
    size: int
    sha256: str
    git_sha1: str


def load_env_token() -> str | None:
    token = os.environ.get("HF_TOKEN")
    if token:
        return token.strip()
    env_file = ROOT / ".env"
    if not env_file.exists():
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() == "HF_TOKEN":
            return value.strip().strip("\"'") or None
    return None


def hash_file(path: Path) -> tuple[str, str]:
    """Returns (sha256, git blob sha1) of a file."""
    size = path.stat().st_size
    sha256 = hashlib.sha256()
    git = hashlib.sha1(f"blob {size}\0".encode())
    with path.open("rb") as f:
        while chunk := f.read(8 * 1024 * 1024):
            sha256.update(chunk)
            git.update(chunk)
    return sha256.hexdigest(), git.hexdigest()


def fetch_source(api: HfApi, model: dict) -> list[LocalFile]:
    source, revision = model["source"], model["sourceRevision"]
    info = api.model_info(source, revision=revision, files_metadata=True)
    remote = {s.rfilename: s for s in info.siblings or []}

    files: list[LocalFile] = []
    for name in model["files"]:
        if name not in remote:
            sys.exit(f"[{model['id']}] {name} not found in {source}@{revision[:8]}")
        print(f"[{model['id']}] {name} ...", flush=True)
        local = Path(
            hf_hub_download(source, name, revision=revision, local_dir=CACHE / model["id"])
        )
        sha256, git_sha1 = hash_file(local)

        expected = remote[name].lfs.sha256 if remote[name].lfs else None
        if expected and expected != sha256:
            sys.exit(f"[{model['id']}] sha256 mismatch for {name}: {sha256} != {expected}")
        if not expected and remote[name].blob_id and remote[name].blob_id != git_sha1:
            sys.exit(f"[{model['id']}] git hash mismatch for {name}")

        files.append(LocalFile(name, local, local.stat().st_size, sha256, git_sha1))
    return files


def model_card(model: dict) -> str:
    return f"""---
license: {model['license']}
base_model: {model['upstream']}
library_name: transformers.js
---

Pinned copy of selected ONNX files for [SwagToVideo](https://github.com/DarumOrt/SwagToVideo),
a non-commercial in-browser music visualizer.

- Original model: [{model['upstream']}](https://huggingface.co/{model['upstream']}) — license `{model['license']}`.
- ONNX export: [{model['source']}](https://huggingface.co/{model['source']}) at
  `{model['sourceRevision']}`.

Files are copied unchanged; SHA-256 hashes are listed in the app's `models.json`.
"""


def sync_target(api: HfApi, model: dict, files: list[LocalFile]) -> str:
    """Uploads changed files to the target repo and returns the resulting commit hash."""
    target = model["target"]
    api.create_repo(target, repo_type="model", exist_ok=True)
    info = api.model_info(target, files_metadata=True)
    remote = {s.rfilename: s for s in info.siblings or []}

    ops: list[CommitOperationAdd | CommitOperationDelete] = []
    for f in files:
        r = remote.get(f.path)
        same = r is not None and (
            (r.lfs is not None and r.lfs.sha256 == f.sha256)
            or (r.lfs is None and r.blob_id == f.git_sha1)
        )
        if not same:
            ops.append(CommitOperationAdd(path_in_repo=f.path, path_or_fileobj=str(f.local)))

    card = model_card(model).encode("utf-8")
    if card != _remote_text(api, target, "README.md", "README.md" in remote):
        ops.append(CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=card))

    wanted = {f.path for f in files} | KEEP_IN_TARGET
    ops += [CommitOperationDelete(path_in_repo=p) for p in remote if p not in wanted]

    if not ops:
        print(f"[{model['id']}] {target} is up to date")
        return info.sha or ""

    print(f"[{model['id']}] committing {len(ops)} change(s) to {target} ...", flush=True)
    commit = api.create_commit(
        target,
        operations=ops,
        commit_message=f"Sync from {model['source']}@{model['sourceRevision'][:8]}",
    )
    return commit.oid


def _remote_text(api: HfApi, repo: str, name: str, exists: bool) -> bytes | None:
    if not exists:
        return None
    path = hf_hub_download(repo, name, token=api.token)
    return Path(path).read_bytes()


def manifest_entry(model: dict, files: list[LocalFile], revision: str | None) -> dict:
    base = f"https://huggingface.co/{model['target']}/resolve/{revision}" if revision else None
    return {
        "task": model["task"],
        "repo": model["target"],
        "revision": revision,
        "license": model["license"],
        "upstream": model["upstream"],
        "source": {"repo": model["source"], "revision": model["sourceRevision"]},
        "files": [
            {
                "path": f.path,
                "size": f.size,
                "sha256": f.sha256,
                "url": f"{base}/{f.path}" if base else None,
            }
            for f in files
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="download and verify only, do not upload")
    parser.add_argument("--only", metavar="ID", help="process a single model id from sources.json")
    parser.add_argument("--sources", type=Path, default=SOURCES, help="alternative sources.json")
    args = parser.parse_args()

    token = load_env_token()
    if not token and not args.dry_run:
        sys.exit("HF_TOKEN is not set (environment or .env). Use --dry-run to test without uploading.")
    api = HfApi(token=token)

    sources = json.loads(args.sources.read_text(encoding="utf-8"))["models"]
    if args.only:
        sources = [m for m in sources if m["id"] == args.only]
        if not sources:
            sys.exit(f"unknown model id: {args.only}")

    manifest = (
        json.loads(MANIFEST.read_text(encoding="utf-8"))
        if MANIFEST.exists()
        else {"schemaVersion": MANIFEST_SCHEMA_VERSION, "models": {}}
    )

    for model in sources:
        files = fetch_source(api, model)
        revision = None if args.dry_run else sync_target(api, model, files)
        manifest["models"][model["id"]] = manifest_entry(model, files, revision)
        total = sum(f.size for f in files) / 1e6
        print(f"[{model['id']}] {len(files)} files, {total:.1f} MB, revision {revision or '(dry run)'}")

    if args.dry_run:
        print("Dry run: models.json not written.")
        return
    manifest["schemaVersion"] = MANIFEST_SCHEMA_VERSION
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
