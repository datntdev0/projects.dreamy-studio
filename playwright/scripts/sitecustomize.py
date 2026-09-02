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
