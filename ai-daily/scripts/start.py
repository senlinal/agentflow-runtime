#!/usr/bin/env python3
"""One-command daily generation and local server startup."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent


def run_generate(args: argparse.Namespace) -> int:
    command = [
        sys.executable,
        str(ROOT / "scripts" / "generate_daily.py"),
        "--story-count",
        str(args.story_count),
        "--candidate-limit",
        str(args.candidate_limit),
        "--limit-per-source",
        str(args.limit_per_source),
        "--max-age-days",
        str(args.max_age_days),
    ]
    if args.no_model:
        command.append("--no-model")
    print("Generating today's AI daily...")
    return subprocess.run(command, cwd=PROJECT).returncode


def run_server(args: argparse.Namespace) -> int:
    command = [
        sys.executable,
        str(ROOT / "scripts" / "serve.py"),
        "--port",
        str(args.port),
    ]
    if args.open:
        command.append("--open")
    print("Starting local website...")
    return subprocess.run(command, cwd=PROJECT).returncode


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4321)
    parser.add_argument("--open", action="store_true", help="Open the website in your default browser.")
    parser.add_argument("--no-generate", action="store_true", help="Serve existing data.js without regenerating.")
    parser.add_argument("--no-model", action="store_true", help="Fetch real sources but skip Kimi summarization.")
    parser.add_argument("--story-count", type=int, default=6)
    parser.add_argument("--candidate-limit", type=int, default=18)
    parser.add_argument("--limit-per-source", type=int, default=3)
    parser.add_argument("--max-age-days", type=int, default=7)
    args = parser.parse_args()

    if not args.no_generate:
        code = run_generate(args)
        if code != 0:
            print("Generation failed. Fix the error above, or run with --no-generate to view existing data.", file=sys.stderr)
            return code
    return run_server(args)


if __name__ == "__main__":
    raise SystemExit(main())
