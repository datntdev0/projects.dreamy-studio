import sys

CREATE_NO_WINDOW = 0x08000000
NO_WINDOW_FLAGS = CREATE_NO_WINDOW if sys.platform == "win32" else 0
