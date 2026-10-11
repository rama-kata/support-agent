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
