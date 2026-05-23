#!/usr/bin/env python3
"""Generate a real AI daily data.js from RSS sources and Kimi API."""

from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import html
import http.client
import json
import os
import re
import sys
import textwrap
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCES_PATH = ROOT / "sources.json"
DATA_PATH = ROOT / "data.js"
ARCHIVE_DIR = ROOT / "archive"
CN_TZ = dt.timezone(dt.timedelta(hours=8))


def load_sources() -> list[dict[str, str]]:
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def fetch_url(url: str, timeout: int = 20, attempts: int = 2) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "AI-Signal-Daily/0.1 (+local prototype)",
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
    )
    last_error: Exception | None = None
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except (http.client.IncompleteRead, urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
    assert last_error is not None
    raise last_error


def strip_markup(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def parse_date(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return parse_loose_date(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(CN_TZ).isoformat()


def parse_loose_date(value: str) -> str:
    for fmt in ("%Y-%m-%d", "%b %d, %Y", "%B %d, %Y"):
        try:
            parsed = dt.datetime.strptime(value[:30], fmt)
        except ValueError:
            continue
        return parsed.replace(tzinfo=CN_TZ).isoformat()
    return ""


def child_text(node: ET.Element, names: list[str]) -> str:
    for name in names:
        found = node.find(name)
        if found is not None and found.text:
            return found.text
    for child in node:
        local = child.tag.rsplit("}", 1)[-1]
        if local in names and child.text:
            return child.text
    return ""


def atom_link(node: ET.Element) -> str:
    for child in node:
        local = child.tag.rsplit("}", 1)[-1]
        if local == "link":
            href = child.attrib.get("href")
            if href:
                return href
            if child.text:
                return child.text
    return ""


def parse_feed(source: dict[str, str], payload: bytes) -> list[dict[str, str]]:
    root = ET.fromstring(payload)
    items = root.findall(".//item")
    if not items:
        items = [node for node in root.iter() if node.tag.rsplit("}", 1)[-1] == "entry"]

    parsed: list[dict[str, str]] = []
    for item in items[:20]:
        title = strip_markup(child_text(item, ["title"]))
        link = child_text(item, ["link"]) or atom_link(item)
        summary = strip_markup(child_text(item, ["description", "summary", "content"]))
        published = parse_date(child_text(item, ["pubDate", "published", "updated"]))
        if not title or not link:
            continue
        parsed.append(
            {
                "title": title[:220],
                "url": link.strip(),
                "summary": summary[:600],
                "published": published,
                "source": source["name"],
                "sourceTier": source["tier"],
                "defaultCategory": source["category"],
            }
        )
    return parsed


def parse_html_news(source: dict[str, str], payload: bytes) -> list[dict[str, str]]:
    page = payload.decode("utf-8", errors="ignore")
    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for match in re.finditer(r'<a[^>]+href="(/news/[^"#?]+)[^"]*"[^>]*>(.*?)</a>', page, re.S):
        path, inner_html = match.groups()
        if path in seen or path == "/news":
            continue
        seen.add(path)
        text = strip_markup(inner_html)
        title = cleanup_news_card_text(text)
        if not title:
            continue
        found.append(
            {
                "title": title[:220],
                "url": f"https://www.anthropic.com{path}",
                "summary": text[:600],
                "published": extract_card_date(text),
                "source": source["name"],
                "sourceTier": source["tier"],
                "defaultCategory": source["category"],
            }
        )
    return found


def cleanup_news_card_text(text: str) -> str:
    text = re.sub(r"^(Product|Announcements|Research|Policy)\s+", "", text).strip()
    text = re.sub(r"^[A-Z][a-z]{2} \d{1,2}, \d{4}\s+", "", text).strip()
    text = re.sub(r"^(Product|Announcements|Research|Policy)\s+", "", text).strip()
    text = re.sub(r"\s+(Product|Announcements|Research|Policy)\s+[A-Z][a-z]{2} \d{1,2}, \d{4}.*$", "", text).strip()
    pieces = re.split(r"\s{2,}| Today, | We | Our | A new | The ", text, maxsplit=1)
    return pieces[0].strip()


def extract_card_date(text: str) -> str:
    match = re.search(r"([A-Z][a-z]{2} \d{1,2}, \d{4})", text)
    if not match:
        return ""
    try:
        parsed = dt.datetime.strptime(match.group(1), "%b %d, %Y")
    except ValueError:
        return ""
    return parsed.replace(tzinfo=CN_TZ).isoformat()


def parse_source(source: dict[str, str]) -> list[dict[str, str]]:
    payload = fetch_url(source["url"])
    if source.get("type") == "html":
        return parse_html_news(source, payload)
    return parse_feed(source, payload)


def collect_candidates(limit_per_source: int, max_age_days: int) -> tuple[list[dict[str, str]], list[str]]:
    candidates: list[dict[str, str]] = []
    errors: list[str] = []
    seen_urls: set[str] = set()
    dropped_old = 0
    dropped_undated = 0
    for source in load_sources():
        try:
            items = parse_source(source)
        except (http.client.IncompleteRead, urllib.error.URLError, TimeoutError, ET.ParseError) as exc:
            errors.append(f"{source['name']}: {exc}")
            continue
        for item in items[:limit_per_source]:
            if item["url"] in seen_urls:
                continue
            if not item_is_fresh(item, max_age_days):
                if item.get("published"):
                    dropped_old += 1
                else:
                    dropped_undated += 1
                continue
            seen_urls.add(item["url"])
            candidates.append(item)
    if dropped_old:
        errors.append(f"Filtered out {dropped_old} stale items older than {max_age_days} days.")
    if dropped_undated:
        errors.append(f"Filtered out {dropped_undated} undated items.")
    return sort_candidates(candidates), errors


def item_is_fresh(item: dict[str, str], max_age_days: int) -> bool:
    published = item.get("published", "")
    if not published:
        return False
    try:
        published_dt = dt.datetime.fromisoformat(published)
    except ValueError:
        return False
    now = dt.datetime.now(CN_TZ)
    return dt.timedelta(days=-1) <= now - published_dt <= dt.timedelta(days=max_age_days)


def sort_candidates(candidates: list[dict[str, str]]) -> list[dict[str, str]]:
    def key(item: dict[str, str]) -> str:
        return item.get("published") or ""

    return sorted(candidates, key=key, reverse=True)


def kimi_chat(api_key: str, model: str, temperature: float, timeout: int, prompt: str) -> dict[str, Any]:
    base_url = os.environ.get("KIMI_BASE_URL", "https://api.moonshot.cn/v1").rstrip("/")
    body = {
        "model": model,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "你是严谨的 AI 行业日报编辑。只基于用户给出的候选信息源生成 JSON，不编造不存在的来源链接。",
            },
            {"role": "user", "content": prompt},
        ],
    }
    payload = request_kimi(base_url, api_key, body, timeout)
    content = payload["choices"][0]["message"]["content"]
    return parse_model_json(content)


def request_kimi(base_url: str, api_key: str, body: dict[str, Any], timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        if exc.code == 400 and "response_format" in body and "response_format" in error_body:
            retry_body = dict(body)
            retry_body.pop("response_format", None)
            return request_kimi(base_url, api_key, retry_body, timeout)
        if exc.code == 401:
            raise RuntimeError(
                "\n".join(
                    [
                        "Kimi authentication failed: HTTP 401 Unauthorized.",
                        f"Request URL: {base_url}/chat/completions",
                        "Likely causes:",
                        "- KIMI_API_KEY is incorrect, expired, disabled, or copied with extra spaces.",
                        "- The key belongs to another Kimi/Moonshot platform region.",
                        "- If this key is from platform.moonshot.cn, use KIMI_BASE_URL=https://api.moonshot.cn/v1.",
                        "- If this key is from platform.kimi.ai, use KIMI_BASE_URL=https://api.moonshot.ai/v1.",
                        f"Response body: {error_body}",
                    ]
                )
            ) from exc
        raise RuntimeError(f"Kimi API request failed: HTTP {exc.code}\n{error_body}") from exc


def parse_model_json(content: str) -> dict[str, Any]:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.S)
        if match:
            return json.loads(match.group(1))
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(content[start : end + 1])
        raise


def build_prompt(candidates: list[dict[str, str]], story_count: int, candidate_limit: int) -> str:
    candidates = diverse_candidates(candidates, candidate_limit)
    compact_candidates = [
        {
            "title": item["title"],
            "url": item["url"],
            "summary": item.get("summary", "")[:360],
            "published": item.get("published", ""),
            "source": item["source"],
            "sourceTier": item["sourceTier"],
            "defaultCategory": item["defaultCategory"],
        }
        for item in candidates
    ]
    candidate_json = json.dumps(compact_candidates, ensure_ascii=False, indent=2)
    return textwrap.dedent(
        f"""
        请从下面真实抓取的候选信息中，生成一份中文 AI 日报 JSON。

        要求：
        - 严格只使用候选信息，不要补充候选之外的旧新闻。
        - 日期必须新鲜：候选已由脚本过滤为最近几天的信息，优先选择最新发布的内容。
        - 只选择和 AI 强相关、对从业者有价值的事件。
        - 同一事件多来源报道时合并，优先保留官方或更接近源头的 URL。
        - 每条 story 的 url 必须来自候选信息里的 url，点击后能直达原始信息源。
        - 不要编造公司、论文、链接或事实。
        - 分数 score 为 0-100，综合重要性、新颖性、可信度、行动价值和传播潜力。
        - stories 控制在 {story_count} 条以内。
        - category 只能从：模型、产品、论文、开源、行业 中选择。
        - tier 优先沿用候选的 sourceTier，只能是 T1、T1.5、T2。

        输出严格 JSON，结构如下：
        {{
          "brief": "今日总体判断，120 字以内",
          "impacts": [
            {{"title": "开发者", "body": "影响判断"}},
            {{"title": "产品经理", "body": "影响判断"}},
            {{"title": "创业者", "body": "影响判断"}}
          ],
          "stories": [
            {{
              "title": "中文标题",
              "category": "模型",
              "tier": "T1",
              "source": "来源名",
              "url": "候选里的原始链接",
              "score": 92,
              "tags": ["标签1", "标签2"],
              "summary": "50-100 字摘要",
              "why": "为什么值得关注，40 字以内"
            }}
          ]
        }}

        候选信息：
        {candidate_json}
        """
    ).strip()


def normalize_daily(raw: dict[str, Any], candidates: list[dict[str, str]], errors: list[str]) -> dict[str, Any]:
    candidates_by_url = {canonical_url(item["url"]): item for item in candidates}
    stories = []
    for story in raw.get("stories", []):
        candidate = candidates_by_url.get(canonical_url(str(story.get("url", ""))))
        if not candidate:
            continue
        stories.append(
            {
                "title": str(story.get("title", ""))[:120],
                "category": story.get("category") if story.get("category") in ["模型", "产品", "论文", "开源", "行业"] else candidate["defaultCategory"],
                "tier": story.get("tier") if story.get("tier") in ["T1", "T1.5", "T2"] else candidate["sourceTier"],
                "source": str(story.get("source", "") or candidate["source"])[:60],
                "url": candidate["url"],
                "score": max(0, min(100, int(story.get("score", 0)))),
                "tags": [str(tag)[:18] for tag in story.get("tags", [])[:4]],
                "summary": str(story.get("summary", ""))[:220],
                "why": str(story.get("why", ""))[:80],
            }
        )

    if not stories:
        raw = {
            "brief": "模型没有返回可验证的来源链接，已回退到真实信源候选。",
            "impacts": raw.get("impacts", []),
            "stories": [
                {
                    "title": item["title"],
                    "category": item["defaultCategory"],
                    "tier": item["sourceTier"],
                    "source": item["source"],
                    "url": item["url"],
                    "score": 50,
                    "tags": ["真实来源"],
                    "summary": item.get("summary", ""),
                    "why": "来源真实，待进一步人工或模型复核。",
                }
                for item in diverse_candidates(candidates, 10)
            ],
        }
        return normalize_daily(raw, candidates, errors)

    now = dt.datetime.now(CN_TZ)
    date_slug = now.date().isoformat()
    return {
        "generatedAt": now.isoformat(),
        "scannedSources": len(load_sources()),
        "candidates": len(candidates),
        "brief": str(raw.get("brief", ""))[:220] or "已生成今日 AI 热点简报。",
        "categories": ["全部", "模型", "产品", "论文", "开源", "行业"],
        "impacts": normalize_impacts(raw.get("impacts", [])),
        "stories": sorted(stories, key=lambda item: item["score"], reverse=True),
        "archives": [
            {
                "date": date_slug,
                "title": "今日 AI 热点简报",
                "count": len(stories),
                "url": f"./archive/{date_slug}.json",
            }
        ],
        "weeklyHot": weekly_hot(candidates, 8),
        "sourceCatalog": source_catalog(),
        "fetchErrors": errors,
    }


def canonical_url(value: str) -> str:
    return value.strip().rstrip("/")


def source_catalog() -> list[dict[str, str]]:
    return [
        {
            "name": source["name"],
            "tier": source["tier"],
            "category": source["category"],
            "url": source["url"],
        }
        for source in load_sources()
    ]


def weekly_hot(candidates: list[dict[str, str]], limit: int) -> list[dict[str, Any]]:
    ranked = sorted(candidates, key=raw_heat_score, reverse=True)
    results: list[dict[str, Any]] = []
    seen_topics: set[str] = set()
    for item in ranked:
        topic = topic_key(item["title"])
        if topic in seen_topics:
            continue
        seen_topics.add(topic)
        results.append(
            {
                "title": item["title"],
                "source": item["source"],
                "url": item["url"],
                "heat": min(100, raw_heat_score(item)),
            }
        )
        if len(results) >= limit:
            break
    return results


def raw_heat_score(item: dict[str, str]) -> int:
    text = f"{item.get('title', '')} {item.get('summary', '')} {item.get('source', '')}".lower()
    score = 50
    source_tier = item.get("sourceTier")
    if source_tier == "T1":
        score += 16
    elif source_tier == "T1.5":
        score += 10
    else:
        score += 4

    weights = {
        "codex": 62,
        "anthropic": 36,
        "claude": 34,
        "copilot": 28,
        "agent": 22,
        "agents": 22,
        "openai": 20,
        "github": 18,
        "gemini": 18,
        "google i/o": 18,
        "model": 8,
        "benchmark": 8,
    }
    for keyword, weight in weights.items():
        if keyword in text:
            score += weight

    published = item.get("published", "")
    if published:
        try:
            published_date = dt.datetime.fromisoformat(published).date()
            age = (dt.datetime.now(CN_TZ).date() - published_date).days
            score += max(0, 14 - age * 2)
        except ValueError:
            pass
    return max(0, score)


def topic_key(title: str) -> str:
    lowered = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", " ", title.lower())
    words = [word for word in lowered.split() if len(word) > 2]
    return " ".join(words[:5]) or lowered[:40]


def write_data_js(daily: dict[str, Any]) -> None:
    payload = json.dumps(daily, ensure_ascii=False, indent=2)
    DATA_PATH.write_text(f"window.AI_DAILY_DATA = {payload};\n", encoding="utf-8")
    ARCHIVE_DIR.mkdir(exist_ok=True)
    date_slug = daily["generatedAt"][:10]
    (ARCHIVE_DIR / f"{date_slug}.json").write_text(payload + "\n", encoding="utf-8")


def write_preview_js(daily: dict[str, Any]) -> Path:
    payload = json.dumps(daily, ensure_ascii=False, indent=2)
    preview_path = ROOT / "data.preview.js"
    preview_path.write_text(f"window.AI_DAILY_DATA = {payload};\n", encoding="utf-8")
    return preview_path


def fallback_daily(candidates: list[dict[str, str]], errors: list[str], story_count: int) -> dict[str, Any]:
    stories = []
    for item in diverse_candidates(candidates, story_count):
        stories.append(
            {
                "title": item["title"],
                "category": item["defaultCategory"],
                "tier": item["sourceTier"],
                "source": item["source"],
                "url": item["url"],
                "score": 60,
                "tags": ["待模型评分"],
                "summary": item["summary"] or "已抓取到真实来源，尚未调用模型生成摘要。",
                "why": "需要配置 KIMI_API_KEY 后生成判断。",
            }
        )
    return normalize_daily(
        {
            "brief": "已抓取真实信息源，但没有调用模型生成最终日报。",
            "impacts": [
                {"title": "开发者", "body": "配置 KIMI_API_KEY 后可生成摘要、评分和判断。"},
                {"title": "产品经理", "body": "当前展示为真实来源候选，不代表最终排序。"},
                {"title": "创业者", "body": "先验证信源质量，再扩展推送渠道。"},
            ],
            "stories": stories,
        },
        candidates,
        errors,
    )


def normalize_impacts(impacts: Any) -> list[dict[str, str]]:
    defaults = [
        {"title": "开发者", "body": "关注可直接改变研发、部署和自动化工作流的更新。"},
        {"title": "产品经理", "body": "关注可转化为用户体验、增长或商业化验证的变化。"},
        {"title": "创业者", "body": "关注源头技术变化与垂直场景中的真实需求缺口。"},
    ]
    if not isinstance(impacts, list):
        return defaults
    normalized = []
    for item in impacts[:3]:
        if isinstance(item, dict):
            normalized.append(
                {
                    "title": str(item.get("title", ""))[:20] or defaults[len(normalized)]["title"],
                    "body": str(item.get("body", ""))[:120] or defaults[len(normalized)]["body"],
                }
            )
    return normalized or defaults


def diverse_candidates(candidates: list[dict[str, str]], limit: int) -> list[dict[str, str]]:
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for item in candidates:
        groups[item["source"]].append(item)

    selected: list[dict[str, str]] = []
    while len(selected) < limit and groups:
        for source in list(groups):
            if groups[source]:
                selected.append(groups[source].pop(0))
                if len(selected) >= limit:
                    break
            if not groups[source]:
                groups.pop(source, None)
    return selected


def main() -> int:
    load_env_file(ROOT / ".env")
    load_env_file(ROOT.parent / ".env")
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=os.environ.get("KIMI_MODEL", "kimi-k2.5"))
    parser.add_argument("--base-url", default=os.environ.get("KIMI_BASE_URL", "https://api.moonshot.cn/v1"))
    parser.add_argument("--temperature", type=float, default=float(os.environ.get("KIMI_TEMPERATURE", "1")))
    parser.add_argument("--timeout", type=int, default=int(os.environ.get("KIMI_TIMEOUT", "180")))
    parser.add_argument("--story-count", type=int, default=6)
    parser.add_argument("--candidate-limit", type=int, default=18)
    parser.add_argument("--limit-per-source", type=int, default=3)
    parser.add_argument("--max-age-days", type=int, default=int(os.environ.get("MAX_AGE_DAYS", "7")))
    parser.add_argument("--no-model", action="store_true", help="Only fetch real sources, skip Kimi summarization.")
    parser.add_argument("--write-fallback", action="store_true", help="Allow --no-model fallback data to overwrite data.js.")
    args = parser.parse_args()

    print("Collecting sources...", flush=True)
    candidates, errors = collect_candidates(args.limit_per_source, args.max_age_days)
    if not candidates:
        print("No candidates fetched. Check network or source URLs.", file=sys.stderr)
        for error in errors:
            print(error, file=sys.stderr, flush=True)
        return 1

    api_key = os.environ.get("KIMI_API_KEY") or os.environ.get("MOONSHOT_API_KEY")
    used_fallback = args.no_model or not api_key
    if used_fallback:
        if not api_key and not args.no_model:
            print("KIMI_API_KEY not found. Generating source-only fallback daily.", flush=True)
        daily = fallback_daily(candidates, errors, args.story_count)
    else:
        os.environ["KIMI_BASE_URL"] = args.base_url
        print(f"Calling Kimi model {args.model}...", flush=True)
        raw = kimi_chat(
            api_key.strip(),
            args.model,
            args.temperature,
            args.timeout,
            build_prompt(candidates, args.story_count, args.candidate_limit),
        )
        daily = normalize_daily(raw, candidates, errors)

    if used_fallback and not args.write_fallback:
        preview_path = write_preview_js(daily)
        print(
            f"Wrote fallback preview to {preview_path}. Formal {DATA_PATH} was not overwritten.",
            flush=True,
        )
    else:
        write_data_js(daily)
        print(f"Wrote {DATA_PATH} with {len(daily['stories'])} stories from {len(candidates)} candidates.", flush=True)
    if errors:
        print("Some sources failed:", flush=True)
        for error in errors:
            print(f"- {error}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, json.JSONDecodeError, urllib.error.URLError, TimeoutError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
