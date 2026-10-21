#!/usr/bin/env python3
"""
Drive the game in WebKitGTK, the same engine family as Safari (WebCore +
JavaScriptCore), under a virtual X display.

usage:
  xvfb-run -a -s "-screen 0 1400x900x24" python3 tests/webkit/wk.py <url> <scenario.py> [outdir]

Needs: gir1.2-webkit2-4.1, python3-gi, python3-gi-cairo, xvfb (apt). The
scenario file defines run(wk) and uses the helpers on the WK class below.
"""
import os
import sys
import time
import json
import runpy

import gi

gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
gi.require_foreign('cairo')
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

# Collect page errors from the very first script (before the game boots).
ERROR_HOOK = """
window.__wkErrors = [];
addEventListener('error', (e) => window.__wkErrors.push('error: ' + e.message + ' @' + e.filename + ':' + e.lineno + ':' + e.colno));
addEventListener('unhandledrejection', (e) => window.__wkErrors.push('unhandled rejection: ' + String(e.reason && (e.reason.stack || e.reason))));
"""


class WK:
    def __init__(self, url, outdir, width=1280, height=720):
        self.outdir = outdir
        os.makedirs(outdir, exist_ok=True)
        self.ctx = GLib.MainContext.default()
        ucm = WebKit2.UserContentManager()
        ucm.add_script(WebKit2.UserScript(ERROR_HOOK, WebKit2.UserContentInjectedFrames.TOP_FRAME,
                                          WebKit2.UserScriptInjectionTime.START, None, None))
        self.view = WebKit2.WebView.new_with_user_content_manager(ucm)
        s = self.view.get_settings()
        s.set_enable_webgl(True)
        s.set_enable_developer_extras(True)
        s.set_enable_write_console_messages_to_stdout(True)
        s.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.ALWAYS)
        self.win = Gtk.Window()
        self.win.set_default_size(width, height)
        self.win.add(self.view)
        self.win.show_all()
        self.loaded = False
        self.view.connect('load-changed', self._on_load)
        self.view.connect('web-process-terminated', self._on_crash)
        self.crashed = None
        self.view.load_uri(url)
        self.pump_until(lambda: self.loaded or self.crashed, 60)
        if self.crashed:
            raise RuntimeError('web process crashed: %s' % self.crashed)

    def _on_load(self, _view, event):
        if event == WebKit2.LoadEvent.FINISHED:
            self.loaded = True

    def _on_crash(self, _view, reason):
        self.crashed = str(reason)

    def pump_until(self, cond, timeout):
        end = time.time() + timeout
        while not cond():
            if time.time() > end:
                return False
            if not self.ctx.iteration(False):
                time.sleep(0.002)
        return True

    def sleep(self, seconds):
        end = time.time() + seconds
        self.pump_until(lambda: time.time() >= end, seconds + 1)

    def js(self, code, timeout=120):
        """Evaluate JS and return its completion value (JSON-decoded)."""
        box = {}

        def done(view, res):
            try:
                v = view.evaluate_javascript_finish(res)
                box['v'] = json.loads(v.to_json(0)) if v is not None and not v.is_undefined() else None
            except Exception as e:  # noqa: BLE001
                box['err'] = str(e)

        self.view.evaluate_javascript(code, -1, None, None, None, done)
        if not self.pump_until(lambda: box or self.crashed, timeout):
            raise TimeoutError('js timed out: ' + code[:80])
        if self.crashed:
            raise RuntimeError('web process crashed: %s' % self.crashed)
        if 'err' in box:
            raise RuntimeError('js error: ' + box['err'] + '\n  in: ' + code[:200])
        return box['v']

    def wait_for(self, expr, timeout=90):
        end = time.time() + timeout
        while time.time() < end:
            if self.js('!!(' + expr + ')'):
                return True
            self.sleep(0.25)
        raise TimeoutError('wait_for timed out: ' + expr)

    def key(self, code, down=True):
        key = {'Space': ' ', 'Enter': 'Enter', 'Escape': 'Escape', 'Slash': '/'}.get(code, code)
        self.js("window.dispatchEvent(new KeyboardEvent('%s', {code: %s, key: %s, bubbles: true, cancelable: true})); 0"
                % ('keydown' if down else 'keyup', json.dumps(code), json.dumps(key)))

    def press(self, code, hold=0.08):
        self.key(code, True)
        self.sleep(hold)
        self.key(code, False)

    def click(self, selector):
        ok = self.js("(() => { const el = document.querySelector(%s); if (!el) return false; el.click(); return true; })()"
                     % json.dumps(selector))
        if not ok:
            raise RuntimeError('click: no element ' + selector)

    def shot(self, name):
        box = {}

        def done(view, res):
            try:
                box['s'] = view.get_snapshot_finish(res)
            except Exception as e:  # noqa: BLE001
                box['err'] = str(e)

        self.view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, done)
        self.pump_until(lambda: box, 30)
        if 's' in box:
            box['s'].write_to_png(os.path.join(self.outdir, name + '.png'))
        else:
            print('shot failed', name, box.get('err'))

    def errors(self):
        return self.js('window.__wkErrors || []') or []


def main():
    url, scenario = sys.argv[1], sys.argv[2]
    outdir = sys.argv[3] if len(sys.argv) > 3 else '/tmp/wk-shots'
    wk = WK(url, outdir)
    print('webkit', WebKit2.get_major_version(), WebKit2.get_minor_version(), WebKit2.get_micro_version())
    print('ua', wk.js('navigator.userAgent'))
    code = 0
    try:
        runpy.run_path(scenario)['run'](wk)
    except Exception as e:  # noqa: BLE001
        print('SCENARIO FAILED:', e)
        code = 1
    finally:
        try:
            errs = wk.errors()
        except Exception as e:  # noqa: BLE001
            errs = ['could not read errors: %s' % e]
        print('--- page errors ---')
        for e in errs[:40]:
            print(e)
    sys.exit(code)


if __name__ == '__main__':
    main()
