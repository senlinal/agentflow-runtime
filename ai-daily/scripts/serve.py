#!/usr/bin/env python3
"""Serve AI Signal Daily on the first available local port."""

from __future__ import annotations

import argparse
import http.server
import socket
import socketserver
import sys
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ReusableTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) != 0


def choose_port(preferred: int) -> int:
    for port in range(preferred, preferred + 50):
        if port_available(port):
            return port
    raise RuntimeError(f"No available port found from {preferred} to {preferred + 49}.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4321)
    parser.add_argument("--open", action="store_true", help="Open the site in the default browser.")
    args = parser.parse_args()

    port = choose_port(args.port)
    handler = lambda *handler_args, **handler_kwargs: http.server.SimpleHTTPRequestHandler(
        *handler_args,
        directory=str(ROOT),
        **handler_kwargs,
    )
    with ReusableTCPServer(("127.0.0.1", port), handler) as server:
        url = f"http://localhost:{port}"
        print(f"AI Signal Daily is running at {url}")
        if port != args.port:
            print(f"Port {args.port} was busy, so I used {port}.")
        if args.open:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
