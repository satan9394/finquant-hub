"""Normalized multi-provider news search with explicit provenance."""
from __future__ import annotations

import asyncio
import html
import os
import re
from collections.abc import Awaitable, Callable

import httpx

_PROVIDERS = ("tavily", "serpapi", "bocha", "brave", "searxng", "sina")
_TIMEOUT = httpx.Timeout(12.0, connect=5.0)


def _text(value: object) -> str:
    return re.sub(r"<[^>]+>", "", html.unescape(str(value or ""))).strip()


class NewsSearchService:
    """Query configured providers in fallback or aggregate mode without provider SDKs."""

    def __init__(
        self,
        http: httpx.AsyncClient | None = None,
        providers: tuple[str, ...] | None = None,
    ) -> None:
        configured = providers or tuple(
            item.strip().lower()
            for item in os.getenv("NEWS_SEARCH_PROVIDERS", ",".join(_PROVIDERS)).split(",")
            if item.strip()
        )
        unknown = set(configured) - set(_PROVIDERS)
        if unknown:
            raise ValueError(f"未知新闻源：{', '.join(sorted(unknown))}")
        self.providers = configured
        self.http = http or httpx.AsyncClient(timeout=_TIMEOUT, trust_env=False)
        self._owns_http = http is None

    async def aclose(self) -> None:
        if self._owns_http:
            await self.http.aclose()

    def _enabled(self, provider: str) -> bool:
        requirements = {
            "tavily": "TAVILY_API_KEY",
            "serpapi": "SERPAPI_API_KEY",
            "bocha": "BOCHA_API_KEY",
            "brave": "BRAVE_SEARCH_API_KEY",
            "searxng": "SEARXNG_BASE_URL",
        }
        key = requirements.get(provider)
        return key is None or bool(os.getenv(key, "").strip())

    async def search(
        self,
        keyword: str,
        *,
        max_results: int = 5,
        strategy: str = "fallback",
    ) -> dict:
        keyword = keyword.strip()
        if not keyword:
            raise ValueError("keyword 不能为空")
        if strategy not in {"fallback", "aggregate"}:
            raise ValueError("strategy 必须是 fallback 或 aggregate")
        limit = min(20, max(1, int(max_results)))
        available = [provider for provider in self.providers if self._enabled(provider)]
        if not available:
            raise ValueError("没有可用的新闻搜索源")

        results: list[dict] = []
        errors: dict[str, str] = {}
        attempted: list[str] = []
        used: list[str] = []
        if strategy == "aggregate":
            responses = await asyncio.gather(
                *(self._call(provider, keyword, limit) for provider in available),
                return_exceptions=True,
            )
            for provider, response in zip(available, responses):
                attempted.append(provider)
                if isinstance(response, BaseException):
                    errors[provider] = str(response)
                elif response:
                    used.append(provider)
                    results.extend(response)
        else:
            for provider in available:
                attempted.append(provider)
                try:
                    response = await self._call(provider, keyword, limit)
                except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
                    errors[provider] = str(exc)
                    continue
                if response:
                    used.append(provider)
                    results.extend(response)
                    break

        deduped: list[dict] = []
        seen: set[str] = set()
        for item in results:
            key = (item.get("url") or item.get("title") or "").strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            deduped.append(item)
            if len(deduped) >= limit:
                break
        return {
            "keyword": keyword,
            "news": deduped,
            "strategy": strategy,
            "providers_attempted": attempted,
            "providers_used": used,
            "errors": errors,
        }

    async def _call(self, provider: str, keyword: str, limit: int) -> list[dict]:
        handlers: dict[str, Callable[[str, int], Awaitable[list[dict]]]] = {
            "tavily": self._tavily,
            "serpapi": self._serpapi,
            "bocha": self._bocha,
            "brave": self._brave,
            "searxng": self._searxng,
            "sina": self._sina,
        }
        return await handlers[provider](keyword, limit)

    async def _tavily(self, keyword: str, limit: int) -> list[dict]:
        response = await self.http.post(
            "https://api.tavily.com/search",
            json={"api_key": os.environ["TAVILY_API_KEY"], "query": keyword, "topic": "news", "max_results": limit},
        )
        response.raise_for_status()
        return self._normalize("tavily", response.json().get("results", []))

    async def _serpapi(self, keyword: str, limit: int) -> list[dict]:
        response = await self.http.get(
            "https://serpapi.com/search.json",
            params={"api_key": os.environ["SERPAPI_API_KEY"], "engine": "google", "tbm": "nws", "q": keyword, "num": limit},
        )
        response.raise_for_status()
        return self._normalize("serpapi", response.json().get("news_results", []))

    async def _bocha(self, keyword: str, limit: int) -> list[dict]:
        response = await self.http.post(
            "https://api.bochaai.com/v1/web-search",
            headers={"Authorization": f"Bearer {os.environ['BOCHA_API_KEY']}"},
            json={"query": keyword, "freshness": "oneMonth", "summary": True, "count": limit},
        )
        response.raise_for_status()
        items = ((response.json().get("data") or {}).get("webPages") or {}).get("value", [])
        return self._normalize("bocha", items)

    async def _brave(self, keyword: str, limit: int) -> list[dict]:
        response = await self.http.get(
            "https://api.search.brave.com/res/v1/news/search",
            headers={"X-Subscription-Token": os.environ["BRAVE_SEARCH_API_KEY"], "Accept": "application/json"},
            params={"q": keyword, "count": limit},
        )
        response.raise_for_status()
        return self._normalize("brave", response.json().get("results", []))

    async def _searxng(self, keyword: str, limit: int) -> list[dict]:
        response = await self.http.get(
            f"{os.environ['SEARXNG_BASE_URL'].rstrip('/')}/search",
            params={"q": keyword, "format": "json", "categories": "news"},
        )
        response.raise_for_status()
        return self._normalize("searxng", response.json().get("results", [])[:limit])

    async def _sina(self, keyword: str, limit: int) -> list[dict]:
        response = await self.http.get(
            "https://searchapi.sina.com.cn/",
            headers={"Referer": "https://finance.sina.com.cn"},
            params={"c": "news", "q": keyword, "range": "all", "num": limit, "ie": "utf-8"},
        )
        response.raise_for_status()
        payload = response.json()
        items = payload.get("result", []) if isinstance(payload, dict) else payload
        return self._normalize("sina", items if isinstance(items, list) else [])

    @staticmethod
    def _normalize(provider: str, items: list[dict]) -> list[dict]:
        normalized = []
        for item in items:
            title = _text(item.get("title") or item.get("name"))
            if not title:
                continue
            normalized.append({
                "title": title,
                "source": _text(item.get("source") or item.get("profile") or provider),
                "published_at": _text(item.get("published_at") or item.get("date") or item.get("ctime") or item.get("age")),
                "url": str(item.get("url") or item.get("link") or "").strip(),
                "snippet": _text(item.get("content") or item.get("snippet") or item.get("description") or item.get("summary")),
                "provider": provider,
            })
        return normalized
