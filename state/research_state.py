from typing import Literal, TypedDict


class WebSearchResult(TypedDict):
    title: str
    url: str
    snippet: str


NextAgent = Literal["web_research", "summary", "ask_human", "end"]


class ResearchState(TypedDict, total=False):
    user_goal: str
    next_agent: NextAgent
    research_results: list[WebSearchResult]
    summary_markdown: str
    human_feedback: str
    errors: list[str]
    iteration_count: int

