#!/usr/bin/env python3
"""
Release automation script.

Handles version bumping, changelog generation, and git tagging:
1. Bumps version in Cargo.toml and package.json files
2. Generates changelog from git commits
3. Creates git tag and pushes to origin
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_CARGO_TOML = ROOT / "backend" / "Cargo.toml"
FRONTEND_PACKAGE_JSON = ROOT / "frontend" / "app" / "package.json"
API_PACKAGE_JSON = ROOT / "frontend" / "api" / "package.json"
CHANGELOG_FILE = ROOT / "CHANGELOG.md"


@dataclass
class Version:
    """Semantic version representation."""
    major: int
    minor: int
    patch: int
    
    @classmethod
    def parse(cls, version_str: str) -> "Version":
        """Parse a version string like '1.2.3'."""
        match = re.match(r"(\d+)\.(\d+)\.(\d+)", version_str)
        if not match:
            raise ValueError(f"Invalid version format: {version_str}")
        return cls(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    
    def bump(self, bump_type: str) -> "Version":
        """Return a new bumped version."""
        if bump_type == "major":
            return Version(self.major + 1, 0, 0)
        elif bump_type == "minor":
            return Version(self.major, self.minor + 1, 0)
        elif bump_type == "patch":
            return Version(self.major, self.minor, self.patch + 1)
        else:
            raise ValueError(f"Invalid bump type: {bump_type}")
    
    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"


def run_command(
    command: list[str],
    cwd: Path = ROOT,
    *,
    capture: bool = False,
) -> subprocess.CompletedProcess:
    """Run a command with error handling."""
    print(f"$ {' '.join(command)}")
    return subprocess.run(
        command,
        cwd=cwd,
        capture_output=capture,
        text=True,
        check=True,
    )


def get_current_version() -> Version:
    """Get current version from Cargo.toml."""
    if not BACKEND_CARGO_TOML.exists():
        raise SystemExit(f"Cargo.toml not found: {BACKEND_CARGO_TOML}")
    
    content = BACKEND_CARGO_TOML.read_text()
    
    # Look for version in [workspace.package] or root [package]
    match = re.search(r'\[(?:workspace\.)?package\][^\[]*version\s*=\s*"([^"]+)"', content, re.DOTALL)
    if not match:
        raise SystemExit("Could not find version in Cargo.toml")
    
    return Version.parse(match.group(1))


def update_cargo_toml(new_version: str) -> None:
    """Update version in Cargo.toml."""
    if not BACKEND_CARGO_TOML.exists():
        return
    
    content = BACKEND_CARGO_TOML.read_text()
    
    # Update version in workspace.package or package section
    updated = re.sub(
        r'(\[(?:workspace\.)?package\][^\[]*version\s*=\s*)"[^"]+"',
        f'\\1"{new_version}"',
        content,
        flags=re.DOTALL,
    )
    
    if updated != content:
        BACKEND_CARGO_TOML.write_text(updated)
        print(f"  Updated: {BACKEND_CARGO_TOML}")


def update_package_json(file_path: Path, new_version: str) -> None:
    """Update version in a package.json file."""
    if not file_path.exists():
        return
    
    with open(file_path) as f:
        data = json.load(f)
    
    if "version" in data:
        data["version"] = new_version
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        print(f"  Updated: {file_path}")


def get_git_log_since_tag(tag: str | None) -> list[str]:
    """Get commit messages since the last tag."""
    if tag:
        range_spec = f"{tag}..HEAD"
    else:
        range_spec = "HEAD"
    
    try:
        result = run_command(
            ["git", "log", range_spec, "--oneline", "--no-merges"],
            capture=True,
        )
        return [line for line in result.stdout.strip().split("\n") if line]
    except subprocess.CalledProcessError:
        return []


def get_last_tag() -> str | None:
    """Get the most recent git tag."""
    try:
        result = run_command(
            ["git", "describe", "--tags", "--abbrev=0"],
            capture=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None


def categorize_commits(commits: list[str]) -> dict[str, list[str]]:
    """Categorize commits by conventional commit type."""
    categories: dict[str, list[str]] = {
        "Features": [],
        "Bug Fixes": [],
        "Documentation": [],
        "Other": [],
    }
    
    for commit in commits:
        # Remove commit hash
        message = commit.split(" ", 1)[1] if " " in commit else commit
        
        if message.startswith("feat"):
            categories["Features"].append(message)
        elif message.startswith("fix"):
            categories["Bug Fixes"].append(message)
        elif message.startswith("docs"):
            categories["Documentation"].append(message)
        else:
            categories["Other"].append(message)
    
    return categories


def generate_changelog(new_version: str, commits: list[str]) -> str:
    """Generate changelog entry for the new version."""
    date = datetime.now().strftime("%Y-%m-%d")
    categories = categorize_commits(commits)
    
    lines = [f"## [{new_version}] - {date}", ""]
    
    for category, messages in categories.items():
        if messages:
            lines.append(f"### {category}")
            for msg in messages:
                lines.append(f"- {msg}")
            lines.append("")
    
    return "\n".join(lines)


def update_changelog(new_content: str) -> None:
    """Prepend new content to the changelog file."""
    if CHANGELOG_FILE.exists():
        existing = CHANGELOG_FILE.read_text()
        # Insert after the header
        if existing.startswith("# Changelog"):
            header_end = existing.find("\n\n") + 2
            content = existing[:header_end] + new_content + "\n" + existing[header_end:]
        else:
            content = new_content + "\n" + existing
    else:
        content = "# Changelog\n\n" + new_content
    
    CHANGELOG_FILE.write_text(content)
    print(f"  Updated: {CHANGELOG_FILE}")


def create_git_tag(version: str, *, push: bool = True) -> None:
    """Create and optionally push a git tag."""
    tag = f"v{version}"
    
    # Stage all changes
    run_command(["git", "add", "-A"])
    
    # Commit
    run_command(["git", "commit", "-m", f"chore: release {version}"])
    
    # Create tag
    run_command(["git", "tag", "-a", tag, "-m", f"Release {version}"])
    
    print(f"  Created tag: {tag}")
    
    if push:
        run_command(["git", "push", "origin", "HEAD"])
        run_command(["git", "push", "origin", tag])
        print(f"  Pushed to origin")


def check_working_directory_clean() -> bool:
    """Check if the working directory is clean."""
    result = run_command(["git", "status", "--porcelain"], capture=True)
    return not result.stdout.strip()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "bump_type",
        choices=["major", "minor", "patch"],
        help="Type of version bump",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    parser.add_argument(
        "--no-push",
        action="store_true",
        help="Don't push to origin after tagging",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Proceed even with uncommitted changes",
    )
    args = parser.parse_args()

    # Check for clean working directory
    if not args.force and not args.dry_run and not check_working_directory_clean():
        print("Error: Working directory has uncommitted changes.")
        print("Commit or stash changes first, or use --force to proceed anyway.")
        sys.exit(1)

    # Get versions
    current = get_current_version()
    new = current.bump(args.bump_type)
    
    print(f"\nVersion: {current} → {new}")
    print()

    # Get commits for changelog
    last_tag = get_last_tag()
    commits = get_git_log_since_tag(last_tag)
    
    if args.dry_run:
        print("Dry run mode - no changes will be made.\n")
        print("Would update:")
        print(f"  - {BACKEND_CARGO_TOML}")
        if FRONTEND_PACKAGE_JSON.exists():
            print(f"  - {FRONTEND_PACKAGE_JSON}")
        if API_PACKAGE_JSON.exists():
            print(f"  - {API_PACKAGE_JSON}")
        print(f"  - {CHANGELOG_FILE}")
        
        print(f"\nWould create tag: v{new}")
        
        if commits:
            print(f"\nChangelog ({len(commits)} commits):")
            changelog = generate_changelog(str(new), commits)
            print(changelog)
        
        return

    print("Updating version files...")
    update_cargo_toml(str(new))
    update_package_json(FRONTEND_PACKAGE_JSON, str(new))
    update_package_json(API_PACKAGE_JSON, str(new))

    print("\nGenerating changelog...")
    if commits:
        changelog = generate_changelog(str(new), commits)
        update_changelog(changelog)
    else:
        print("  No commits since last tag, skipping changelog.")

    print("\nCreating git tag...")
    create_git_tag(str(new), push=not args.no_push)

    print(f"\n[OK] Release {new} complete!")


if __name__ == "__main__":
    main()