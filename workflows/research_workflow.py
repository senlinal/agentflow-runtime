from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agents.summary import summary_node
from agents.supervisor import route_from_supervisor, supervisor_node
from agents.web_research import web_research_node
from state.research_state import ResearchState


def build_research_workflow(checkpointer=None):
    """Build the minimal supervisor research workflow."""
    graph = StateGraph(ResearchState)

    graph.add_node("supervisor", supervisor_node)
    graph.add_node("web_research", web_research_node)
    graph.add_node("summary", summary_node)

    graph.add_edge(START, "supervisor")
    graph.add_edge("web_research", "supervisor")
    graph.add_edge("summary", "supervisor")
    graph.add_conditional_edges(
        "supervisor",
        route_from_supervisor,
        {
            "web_research": "web_research",
            "summary": "summary",
            "ask_human": "supervisor",
            "end": END,
        },
    )

    return graph.compile(checkpointer=checkpointer or MemorySaver())
