from __future__ import annotations

import argparse
from contextlib import AbstractContextManager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command

from workflows.research_workflow import build_research_workflow


NODE_LABELS = {
    "supervisor": "[Supervisor]",
    "web_research": "[WebAgent]",
    "summary": "[SummaryAgent]",
}


class OpenCodeResearchRuntime:
    """Terminal runtime that owns lifecycle, input, streaming, and sessions."""

    def __init__(self, session_id: str, db_path: Path) -> None:
        self.session_id = session_id
        self.db_path = db_path
        self._checkpointer_context: AbstractContextManager[Any] | None = None
        self._checkpointer: Any | None = None
        self._app: Any | None = None

    def __enter__(self) -> "OpenCodeResearchRuntime":
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._checkpointer_context = SqliteSaver.from_conn_string(str(self.db_path))
        self._checkpointer = self._checkpointer_context.__enter__()
        self._app = build_research_workflow(checkpointer=self._checkpointer)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._checkpointer_context is not None:
            self._checkpointer_context.__exit__(exc_type, exc, tb)

    @property
    def config(self) -> dict[str, Any]:
        return {"configurable": {"thread_id": self.session_id}}

    @property
    def app(self):
        if self._app is None:
            raise RuntimeError("Runtime is not started. Use it as a context manager.")
        return self._app

    def run_forever(self) -> None:
        print("[Supervisor] OpenCode Runtime started.")
        print("[Supervisor] Type a research goal, /state, /resume, /reset, or /exit.")
        while True:
            try:
                user_input = input("\n> ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\n[Supervisor] Runtime stopped.")
                return

            if not user_input:
                continue
            if user_input in {"/exit", "/quit"}:
                print("[Supervisor] Runtime stopped.")
                return
            if user_input == "/state":
                self.print_state()
                continue
            if user_input == "/resume":
                self.resume_interrupted()
                continue
            if user_input == "/reset":
                self.reset_session()
                continue

            self.start_workflow(user_input)

    def start_workflow(self, user_goal: str) -> None:
        print("[Supervisor] Received research goal.")
        self._drive({"user_goal": user_goal})

    def resume_interrupted(self) -> None:
        snapshot = self.app.get_state(self.config)
        interrupts = getattr(snapshot, "interrupts", None) or ()
        if not interrupts:
            print("[Supervisor] No pending interrupt for this session.")
            return
        prompt = getattr(interrupts[0], "value", interrupts[0])
        print(f"[Supervisor] {prompt}")
        human_feedback = input("> ").strip()
        self._drive(Command(resume=human_feedback))

    def print_state(self) -> None:
        snapshot = self.app.get_state(self.config)
        values = snapshot.values or {}
        print("[Supervisor] Session state:")
        for key in (
            "user_goal",
            "next_agent",
            "human_feedback",
            "iteration_count",
            "errors",
        ):
            if key in values:
                print(f"[Supervisor] {key}: {values[key]}")
        if values.get("research_results"):
            print(f"[WebAgent] results: {len(values['research_results'])}")
        if values.get("summary_markdown"):
            print("[SummaryAgent] summary_markdown: ready")

    def reset_session(self) -> None:
        print("[Supervisor] Reset starts a new logical run in this runtime.")
        print("[Supervisor] Use a new --session-id if you need a fully separate persisted thread.")

    def _drive(self, payload: dict[str, Any] | Command) -> None:
        for event in self.app.stream(payload, config=self.config, stream_mode="updates"):
            if "__interrupt__" in event:
                interrupt_payload = event["__interrupt__"][0]
                prompt = getattr(interrupt_payload, "value", interrupt_payload)
                print(f"[Supervisor] ask_human: {prompt}")
                human_feedback = input("> ").strip()
                self._drive(Command(resume=human_feedback))
                return

            for node_name, update in event.items():
                self._print_update(node_name, update)

    def _print_update(self, node_name: str, update: dict[str, Any] | Any) -> None:
        label = NODE_LABELS.get(node_name, f"[{node_name}]")
        if not isinstance(update, dict):
            print(f"{label} {update}")
            return

        if node_name == "supervisor":
            next_agent = update.get("next_agent")
            if next_agent:
                print(f"{label} route -> {next_agent}")
            return

        if node_name == "web_research":
            results = update.get("research_results") or []
            print(f"{label} collected {len(results)} result(s).")
            for item in results[:3]:
                print(f"{label} - {item.get('title', 'Untitled')} ({item.get('url', '')})")
            for error in update.get("errors") or []:
                print(f"{label} error: {error}")
            return

        if node_name == "summary":
            summary = update.get("summary_markdown")
            if summary:
                print(f"{label} Markdown report ready:\n")
                print(summary)
            for error in update.get("errors") or []:
                print(f"{label} note: {error}")


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(
        description="OpenCode-style long-running runtime for the LangGraph research supervisor."
    )
    parser.add_argument("--session-id", default="research-runtime")
    parser.add_argument(
        "--db",
        default=".runtime/research_sessions.sqlite",
        help="SQLite checkpoint database for persistent LangGraph session state.",
    )
    parser.add_argument("goal", nargs="*", help="Optional first research goal.")
    args = parser.parse_args()

    with OpenCodeResearchRuntime(args.session_id, Path(args.db)) as runtime:
        if args.goal:
            runtime.start_workflow(" ".join(args.goal))
        runtime.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

