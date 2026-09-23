from email.message import EmailMessage

import httpx
import pytest

from app import config
from app.services.senders import (
    EmailSender,
    FeishuSender,
    WeComSender,
    configured_senders,
    dispatch_message,
)


@pytest.mark.asyncio
async def test_webhook_senders_use_channel_contracts():
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if "wecom" in str(request.url):
            return httpx.Response(200, json={"errcode": 0})
        return httpx.Response(200, json={"code": 0})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await WeComSender("https://example.test/wecom").send("标题", "内容", http)
        await FeishuSender("https://example.test/feishu").send("标题", "内容", http)

    assert requests[0].read().decode().find('"msgtype":"markdown"') > 0
    assert requests[1].read().decode().find('"msg_type":"text"') > 0


@pytest.mark.asyncio
async def test_dispatch_is_opt_in_and_isolates_channel_failures():
    class FakeSender:
        def __init__(self, name, fails=False):
            self.name = name
            self.fails = fails

        async def send(self, subject, content, http):
            if self.fails:
                raise RuntimeError("down")

    channels = [FakeSender("ok"), FakeSender("bad", fails=True)]
    assert await dispatch_message("s", "c", senders=channels, enabled=False) == {
        "enabled": False, "results": [],
    }
    result = await dispatch_message("s", "c", senders=channels, enabled=True)
    assert result["results"] == [
        {"channel": "ok", "status": "sent"},
        {"channel": "bad", "status": "failed", "error": "down"},
    ]


def test_email_sender_uses_tls_login_and_message(monkeypatch):
    calls = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls.append(("connect", host, port, timeout))

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def starttls(self):
            calls.append(("starttls",))

        def login(self, username, password):
            calls.append(("login", username, password))

        def send_message(self, message: EmailMessage):
            calls.append(("send", message["To"], message.get_content().strip()))

    monkeypatch.setattr("app.services.senders.smtplib.SMTP", FakeSMTP)
    sender = EmailSender(
        "smtp.test", 587, "user", "secret", "from@test", ("to@test",), use_ssl=False
    )
    message = EmailMessage()
    message["From"] = "from@test"
    message["To"] = "to@test"
    message.set_content("body")
    sender._send_sync(message)

    assert calls == [
        ("connect", "smtp.test", 587, 20),
        ("starttls",),
        ("login", "user", "secret"),
        ("send", "to@test", "body"),
    ]


def test_configured_senders_expose_only_complete_channels(monkeypatch):
    monkeypatch.setattr(config, "WECOM_WEBHOOK_URL", "https://wecom.test")
    monkeypatch.setattr(config, "FEISHU_WEBHOOK_URL", "")
    monkeypatch.setattr(config, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(config, "SMTP_FROM", "from@test")
    monkeypatch.setattr(config, "SMTP_TO", ("to@test",))
    assert [sender.name for sender in configured_senders()] == ["wecom", "email"]
