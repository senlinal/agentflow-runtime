#!/usr/bin/env python3
"""Run AI Signal Daily continuously and refresh it every day at 09:30."""

from __future__ import annotations

import argparse
import datetime as dt
import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading
import time
import traceback
from pathlib import Path

from serve import ReusableTCPServer, choose_port


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
RUNTIME_DIR = ROOT / "runtime"
STATE_PATH = RUNTIME_DIR / "daemon_state.json"
PID_PATH = RUNTIME_DIR / "daily.pid"
URL_PATH = RUNTIME_DIR / "url.txt"
CN_TZ = dt.timezone(dt.timedelta(hours=8))


def log(message: str) -> None:
    now = dt.datetime.now(CN_TZ).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] {message}", flush=True)


def load_state() -> dict[str, str]:
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_state(state: dict[str, str]) -> None:
    RUNTIME_DIR.mkdir(exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def next_run(now: dt.datetime) -> dt.datetime:
    target = now.replace(hour=9, minute=30, second=0, microsecond=0)
    if now >= target:
        target += dt.timedelta(days=1)
    return target


def should_generate_on_start(now: dt.datetime, state: dict[str, str]) -> bool:
    last_success = state.get("last_success_date")
    today = now.date().isoformat()
    is_after_daily_time = now.hour > 9 or (now.hour == 9 and now.minute >= 30)
    return is_after_daily_time and last_success != today


def run_generate(args: argparse.Namespace) -> bool:
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

    log("Refreshing daily data...")
    try:
        completed = subprocess.run(
            command,
            cwd=PROJECT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=args.refresh_timeout,
        )
    except subprocess.TimeoutExpired as exc:
        output = exc.stdout or ""
        if output:
            print(output, end="" if output.endswith("\n") else "\n", flush=True)
        log(f"Daily refresh timed out after {args.refresh_timeout} seconds. The site will keep serving the previous data.")
        return False
    except Exception as exc:
        log(f"Daily refresh crashed: {exc}")
        traceback.print_exc()
        return False

    if completed.stdout:
        print(completed.stdout, end="" if completed.stdout.endswith("\n") else "\n", flush=True)

    if completed.returncode == 0:
        state = load_state()
        state["last_success_at"] = dt.datetime.now(CN_TZ).isoformat()
        state["last_success_date"] = dt.datetime.now(CN_TZ).date().isoformat()
        save_state(state)
        log("Daily data refreshed.")
        return True

    log(f"Daily refresh failed with exit code {completed.returncode}. The site will keep serving the previous data.")
    return False


def scheduler(args: argparse.Namespace) -> None:
    while True:
        try:
            state = load_state()
            now = dt.datetime.now(CN_TZ)
            if should_generate_on_start(now, state):
                run_generate(args)
            target = next_run(dt.datetime.now(CN_TZ))
            seconds = max(1, (target - dt.datetime.now(CN_TZ)).total_seconds())
            log(f"Next refresh scheduled at {target.strftime('%Y-%m-%d %H:%M:%S')} Asia/Shanghai.")
            time.sleep(seconds)
            run_generate(args)
        except Exception as exc:
            log(f"Scheduler error: {exc}")
            traceback.print_exc()
            time.sleep(60)


def serve(args: argparse.Namespace) -> None:
    port = choose_port(args.port)
    handler = lambda *handler_args, **handler_kwargs: http.server.SimpleHTTPRequestHandler(
        *handler_args,
        directory=str(ROOT),
        **handler_kwargs,
    )
    with ReusableTCPServer(("127.0.0.1", port), handler) as server:
        url = f"http://localhost:{port}"
        RUNTIME_DIR.mkdir(exist_ok=True)
        URL_PATH.write_text(url + "\n", encoding="utf-8")
        PID_PATH.write_text(str(os.getpid()) + "\n", encoding="utf-8")
        log(f"AI Signal Daily is running at {url}")
        if port != args.port:
            log(f"Port {args.port} was busy, so I used {port}.")
        try:
            server.serve_forever()
        finally:
            log("HTTP server stopped.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4321)
    parser.add_argument("--no-model", action="store_true")
    parser.add_argument("--story-count", type=int, default=6)
    parser.add_argument("--candidate-limit", type=int, default=18)
    parser.add_argument("--limit-per-source", type=int, default=3)
    parser.add_argument("--max-age-days", type=int, default=7)
    parser.add_argument("--refresh-timeout", type=int, default=300)
    args = parser.parse_args()

    RUNTIME_DIR.mkdir(exist_ok=True)
    threading.Thread(target=scheduler, args=(args,), daemon=True).start()
    serve(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
