import io
import json

import pytest

try:  # the API module builds the agent at import, which needs the local data files
    from support_agent import api
except Exception as e:  # noqa: BLE001
    pytest.skip(f"API needs local data: {e}", allow_module_level=True)


def fake_ollama(monkeypatch, tags=None, ps=None, down=False):
    def urlopen(url, timeout=None):
        if down:
            raise OSError("connection refused")
        body = {"models": tags} if url.endswith("/api/tags") else {"models": ps or []}
        return io.BytesIO(json.dumps(body).encode())

    monkeypatch.setattr(api.urllib.request, "urlopen", urlopen)
    api._agent_status.update(at=0.0, value=None)


def test_offline_when_ollama_is_unreachable(monkeypatch):
    fake_ollama(monkeypatch, down=True)
    assert api.agent_status()["agent"] == "offline"


def test_offline_when_the_agent_model_is_missing(monkeypatch):
    fake_ollama(monkeypatch, tags=[{"name": "qwen2.5:3b"}])
    assert api.agent_status()["agent"] == "offline"


def test_ready_when_installed_but_not_loaded(monkeypatch):
    fake_ollama(monkeypatch, tags=[{"name": api.AGENT_MODEL}])
    assert api.agent_status()["agent"] == "ready"


def test_slow_when_the_model_is_partly_on_cpu(monkeypatch):
    fake_ollama(monkeypatch, tags=[{"name": api.AGENT_MODEL}],
                ps=[{"name": api.AGENT_MODEL, "size": 100, "size_vram": 40}])
    assert api.agent_status()["agent"] == "slow"


def test_ready_when_fully_on_gpu(monkeypatch):
    fake_ollama(monkeypatch, tags=[{"name": api.AGENT_MODEL}],
                ps=[{"name": api.AGENT_MODEL, "size": 100, "size_vram": 100}])
    assert api.agent_status()["agent"] == "ready"


def test_warm_runs_at_most_once_a_minute(monkeypatch):
    started = []
    monkeypatch.setattr(api.threading, "Thread", lambda target, daemon: type(
        "T", (), {"start": lambda self: started.append(target)})())
    monkeypatch.setattr(api, "_last_warm", 0.0)
    monkeypatch.setattr(api.time, "monotonic", lambda: 1000.0)
    assert api.warm_agent_model() is True
    assert api.warm_agent_model() is False      # within the minute
    monkeypatch.setattr(api.time, "monotonic", lambda: 1061.0)
    assert api.warm_agent_model() is True
    assert len(started) == 2


def test_warm_skips_a_model_that_is_already_loaded(monkeypatch):
    calls = []

    def urlopen(req, timeout=None):
        url = req if isinstance(req, str) else req.full_url
        calls.append(url)
        return io.BytesIO(json.dumps({"models": [{"name": api.AGENT_MODEL}]}).encode())

    monkeypatch.setattr(api.urllib.request, "urlopen", urlopen)
    api._warm()
    assert len(calls) == 1 and calls[0].endswith("/api/ps")
