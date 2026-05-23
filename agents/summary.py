import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from state.research_state import ResearchState, WebSearchResult


load_dotenv()


def _load_prompt() -> str:
    prompt_path = Path(__file__).resolve().parents[1] / "prompts" / "summary.md"
    return prompt_path.read_text(encoding="utf-8")


def _format_results(results: list[WebSearchResult]) -> str:
    if not results:
        return "没有可用的 Web 搜索结果。"

    lines: list[str] = []
    for index, item in enumerate(results, start=1):
        lines.append(
            "\n".join(
                [
                    f"{index}. {item['title']}",
                    f"   URL: {item['url']}",
                    f"   摘要: {item['snippet']}",
                ]
            )
        )
    return "\n\n".join(lines)


def _fallback_summary(state: ResearchState) -> str:
    goal = state.get("user_goal", "")
    results = state.get("research_results", [])
    errors = state.get("errors", [])
    source_lines = [
        f"- [{item['title']}]({item['url']}): {item['snippet']}" for item in results
    ] or ["- 暂无可用来源。"]
    error_lines = [f"- {error}" for error in errors] or ["- 暂无。"]

    return "\n".join(
        [
            "# 研究报告",
            "",
            "## 研究目标",
            goal,
            "",
            "## 关键发现",
            "当前未能调用 LLM 生成分析，以下为搜索结果的基础整理。",
            "",
            "## 来源摘要",
            *source_lines,
            "",
            "## 初步建议",
            "补充 API Key 或检查 OpenAI Compatible API 配置后重新运行，以获得完整总结。",
            "",
            "## 局限性",
            *error_lines,
        ]
    )


def summary_node(state: ResearchState) -> ResearchState:
    """Summarize web research results into a Markdown report."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "your-api-key-here":
        errors = list(state.get("errors", []))
        errors.append("OPENAI_API_KEY is missing. Used fallback summary.")
        fallback_state: ResearchState = {**state, "errors": errors}
        return {"summary_markdown": _fallback_summary(fallback_state), "errors": errors}

    llm = ChatOpenAI(
        api_key=api_key,
        base_url=os.getenv("OPENAI_BASE_URL") or None,
        model=os.getenv("OPENAI_MODEL", "deepseek-v4-pro"),
        temperature=0.2,
    )
    prompt = _load_prompt().format(
        user_goal=state.get("user_goal", ""),
        research_results=_format_results(state.get("research_results", [])),
        errors="\n".join(state.get("errors", [])) or "无",
    )

    try:
        response = llm.invoke(prompt)
        return {"summary_markdown": str(response.content)}
    except Exception as exc:
        errors = list(state.get("errors", []))
        errors.append(f"Summary LLM failed: {exc}")
        fallback_state: ResearchState = {**state, "errors": errors}
        return {"summary_markdown": _fallback_summary(fallback_state), "errors": errors}
