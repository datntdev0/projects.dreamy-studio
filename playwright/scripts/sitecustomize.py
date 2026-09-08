import importlib.abc
import importlib.machinery
import json
import os
import sys
import time

HOOK_DIR = os.path.dirname(os.path.abspath(__file__))
FAIL_FILE = os.path.join(HOOK_DIR, "start.fail")
HOLD_FILE = os.path.join(HOOK_DIR, "start.hold")
HOLD_LIMIT_S = 25

if os.path.exists(FAIL_FILE):
    sys.stderr.write("the stub refused to start the backend\n")
    sys.stderr.flush()
    os._exit(3)

deadline = time.monotonic() + HOLD_LIMIT_S
while os.path.exists(HOLD_FILE) and time.monotonic() < deadline:
    time.sleep(0.1)

SYNTH_HOLD_FILE = os.path.join(HOOK_DIR, "synth.hold")
SYNTH_FAIL_FILE = os.path.join(HOOK_DIR, "synth.fail")
SYNTH_HOLD_LIMIT_S = 120
SERVICES_MODULE = "app.features.speeches.service"
ORIGINAL = {}


def read_rule(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def applies(rule, text):
    if rule is None:
        return False
    return any(str(fragment) in text for fragment in rule.get("fragments") or [""])


def hold_synthesis(text):
    deadline = time.monotonic() + SYNTH_HOLD_LIMIT_S
    while applies(read_rule(SYNTH_HOLD_FILE), text) and time.monotonic() < deadline:
        time.sleep(0.1)


def fail_synthesis(text):
    rule = read_rule(SYNTH_FAIL_FILE)
    if applies(rule, text):
        from app.shared.errors import BackendError

        raise BackendError(503, "STUB_REFUSED", str(rule.get("message", "")))


def stub_synthesize(self, request):
    hold_synthesis(request.text)
    fail_synthesis(request.text)
    return ORIGINAL["synthesize"](self, request)


def patch_services(module):
    ORIGINAL["synthesize"] = module.SpeechService.synthesize
    module.SpeechService.synthesize = stub_synthesize


class ServicesLoader(importlib.abc.Loader):
    def __init__(self, inner):
        self.inner = inner

    def create_module(self, spec):
        return self.inner.create_module(spec)

    def exec_module(self, module):
        self.inner.exec_module(module)
        patch_services(module)


class ServicesFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, name, path, target=None):
        if name != SERVICES_MODULE:
            return None
        spec = importlib.machinery.PathFinder.find_spec(name, path)
        if spec is not None and spec.loader is not None:
            spec.loader = ServicesLoader(spec.loader)
        return spec


sys.meta_path.insert(0, ServicesFinder())
