"""
talk.py

UI automation helpers for the EseeCloud talk button.
This file contains safe stubs and a simple pywinauto example.
Production: tune coordinates or control identifiers for your EseeCloud version.
"""

WINDOW_TITLE = "EseeCloud"


def _connect_window():
    """Connect to the EseeCloud window via pywinauto. Imports lazily so that
    server.py can be imported on non-Windows hosts without pywinauto installed.
    """
    from pywinauto import Application, findwindows  # type: ignore

    wins = findwindows.find_windows(title_re=WINDOW_TITLE)
    if not wins:
        return None, None
    hwnd = wins[0]
    app = Application(backend="uia").connect(handle=hwnd)
    win = app.window(handle=hwnd)
    return app, win


def start_talk():
    try:
        _, win = _connect_window()
        if win is None:
            return {"ok": False, "error": "EseeCloud window not found"}
        # TODO: replace with exact coords for your UI version.
        rect = win.rectangle()
        x = rect.left + 100
        y = rect.bottom - 50
        win.click_input(coords=(x, y))
        return {"ok": True}
    except Exception as exc:  # pragma: no cover - pywinauto is Windows-only
        # Log full details server-side; do not leak exception text to callers.
        import logging
        logging.getLogger("eseecloud-adapter.talk").exception("start_talk failed")
        return {"ok": False, "error": "talk_failed"}


def stop_talk():
    # For hold-to-talk, click again or release at the same coordinates.
    return start_talk()
