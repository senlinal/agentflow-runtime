from state.research_state import ResearchState
from tools.web_search import search_web


def web_research_node(state: ResearchState) -> ResearchState:
    """Run a minimal web search for the current research goal."""
    goal = (state.get("user_goal") or "").strip()
    results, error = search_web(goal)

    errors = list(state.get("errors", []))
    if error:
        errors.append(error)

    return {
        "research_results": results,
        "errors": errors,
    }

