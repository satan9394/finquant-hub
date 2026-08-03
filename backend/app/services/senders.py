"""Opt-in outbound notification senders for market-review summaries."""

import asyncio
import logging
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Any, Protocol

import httpx

from .. import config

LOGGER = logging.getLogger(__name__)


class Sender(Protocol):
    name: str

    async def send(self, subject: str, content: str, http: httpx.AsyncClient) -> None: ...


@dataclass
class WeComSender:
    webhook_url: str = field(repr=False)
    name: str = "wecom"

    async def send(self, subject: str, content: str, http: httpx.AsyncClient) -> None:
        response = await http.post(
            self.webhook_url,
            json={"msgtype": "markdown", "markdown": {"content": f"## {subject}\n{content}"[:4096]}},
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("errcode") not in (None, 0):
            raise RuntimeError(f"企微返回错误：{payload.get('errmsg') or payload['errcode']}")


@dataclass
class FeishuSender:
    webhook_url: str = field(repr=False)
    name: str = "feishu"

    async def send(self, subject: str, content: str, http: httpx.AsyncClient) -> None:
        response = await http.post(
            self.webhook_url,
            json={"msg_type": "text", "content": {"text": f"{subject}\n\n{content}"[:20_000]}},
        )
        response.raise_for_status()
        payload = response.json()
        code = payload.get("code", payload.get("StatusCode"))
        if code not in (None, 0):
            raise RuntimeError(f"飞书返回错误：{payload.get('msg') or payload.get('StatusMessage') or code}")


@dataclass
class EmailSender:
    host: str
    port: int
    username: str
    password: str = field(repr=False)
    from_address: str
    recipients: tuple[str, ...]
    use_ssl: bool = True
    name: str = "email"

    async def send(self, subject: str, content: str, _http: httpx.AsyncClient) -> None:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = self.from_address
        message["To"] = ", ".join(self.recipients)
        message.set_content(content)
        await asyncio.to_thread(self._send_sync, message)

    def _send_sync(self, message: EmailMessage) -> None:
        smtp_type = smtplib.SMTP_SSL if self.use_ssl else smtplib.SMTP
        with smtp_type(self.host, self.port, timeout=20) as smtp:
            if not self.use_ssl:
                smtp.starttls()
            if self.username:
                smtp.login(self.username, self.password)
            smtp.send_message(message)


def configured_senders() -> list[Sender]:
    senders: list[Sender] = []
    if config.WECOM_WEBHOOK_URL:
        senders.append(WeComSender(config.WECOM_WEBHOOK_URL))
    if config.FEISHU_WEBHOOK_URL:
        senders.append(FeishuSender(config.FEISHU_WEBHOOK_URL))
    if config.SMTP_HOST and config.SMTP_FROM and config.SMTP_TO:
        senders.append(EmailSender(
            host=config.SMTP_HOST,
            port=config.SMTP_PORT,
            username=config.SMTP_USERNAME,
            password=config.SMTP_PASSWORD,
            from_address=config.SMTP_FROM,
            recipients=config.SMTP_TO,
            use_ssl=config.SMTP_USE_SSL,
        ))
    return senders


async def dispatch_message(
    subject: str,
    content: str,
    *,
    senders: list[Sender] | None = None,
    enabled: bool | None = None,
) -> dict[str, Any]:
    """Dispatch independently; one channel failure never hides another result."""
    is_enabled = config.EXTERNAL_SENDERS_ENABLED if enabled is None else enabled
    channels = configured_senders() if senders is None else senders
    if not is_enabled:
        return {"enabled": False, "results": []}
    if not channels:
        return {"enabled": True, "results": []}

    results = []
    async with httpx.AsyncClient(timeout=20, follow_redirects=True, trust_env=True) as http:
        for sender in channels:
            try:
                await sender.send(subject, content, http)
                results.append({"channel": sender.name, "status": "sent"})
            except Exception as exc:
                LOGGER.exception("External sender failed: %s", sender.name)
                results.append({"channel": sender.name, "status": "failed", "error": str(exc)[:300]})
    return {"enabled": True, "results": results}
