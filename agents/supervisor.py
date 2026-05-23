from langgraph.types import interrupt

from state.research_state import ResearchState


MIN_GOAL_LENGTH = 12


def ask_human(prompt: str) -> str:
    """Pause the graph and request clarification from the user."""
    return interrupt(prompt)


def supervisor_node(state: ResearchState) -> ResearchState:
    """Route the workflow based on current state."""
    iteration_count = state.get("iteration_count", 0) + 1
    user_goal = (state.get("user_goal") or "").strip()

    if len(user_goal) < MIN_GOAL_LENGTH:
        human_feedback = ask_human(
            "请补充一个更具体的研究目标，例如研究对象、时间范围、输出用途或关注问题。"
        )
        return {
            "user_goal": human_feedback.strip(),
            "human_feedback": human_feedback.strip(),
            "next_agent": "web_research",
            "iteration_count": iteration_count,
        }

    if not state.get("research_results"):
        return {"next_agent": "web_research", "iteration_count": iteration_count}

    if not state.get("summary_markdown"):
        return {"next_agent": "summary", "iteration_count": iteration_count}

    return {"next_agent": "end", "iteration_count": iteration_count}


def route_from_supervisor(state: ResearchState) -> str:
    return state.get("next_agent", "end")

