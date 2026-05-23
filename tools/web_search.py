import os
from typing import Any

from dotenv import load_dotenv

from state.research_state import WebSearchResult


load_dotenv()


def _as_result(raw: dict[str, Any]) -> WebSearchResult:
    return {
        "title": str(raw.get("title") or "Untitled"),
        "url": str(raw.get("href") or raw.get("url") or ""),
        "snippet": str(raw.get("body") or raw.get("snippet") or ""),
    }


def search_web(query: str, max_results: int | None = None) -> tuple[list[WebSearchResult], str | None]:
    """Search the web and return normalized results plus an optional error."""
    if max_results is None:
        max_results = int(os.getenv("WEB_SEARCH_MAX_RESULTS", "5"))

    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            raw_results = ddgs.text(query, max_results=max_results)
            results = [_as_result(item) for item in raw_results]
        return results, None
    except Exception as exc:
        return [], f"Web search failed: {exc}"

