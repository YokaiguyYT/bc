#!/usr/bin/env python3
"""
Host a WebKitGTK view (Safari's engine family) and let a Node test runner drive
it over a tiny local HTTP API, so the Playwright scenarios in tests/browser/
also run in WebKit.

usage (from the repo root):
  xvfb-run -a -s "-screen 0 1400x900x24" python3 tests/webkit/bridge.py node tests/webkit/run.mjs <scenario> [outdir]

Needs: gir1.2-webkit2-4.1, python3-gi, python3-gi-cairo, xvfb (apt). On Ubuntu
24.04 the gi bindings are built for python3.12.
"""
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import gi

gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
gi.require_foreign('cairo')
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

# Record page errors and console errors/warnings from the very first script.
ERROR_HOOK = """
window.__wkErrors = [];
addEventListener('error', (e) => window.__wkErrors.push('[pageerror] ' + e.message + ' @' + e.filename + ':' + e.lineno + ':' + e.colno));
addEventListener('unhandledrejection', (e) => window.__wkErrors.push('[pageerror] unhandled rejection: ' + String(e.reason && (e.reason.stack || e.reason))));
for (const level of ['error', 'warn']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    window.__wkErrors.push('[' + (level === 'warn' ? 'warning' : 'error') + '] ' + args.map((a) => (a && a.stack) || String(a)).join(' '));
    orig(...args);
  };
}
"""


class Host:
    def __init__(self, width=1280, height=720):
        ucm = WebKit2.UserContentManager()
        ucm.add_script(WebKit2.UserScript(ERROR_HOOK, WebKit2.UserContentInjectedFrames.TOP_FRAME,
                                          WebKit2.UserScriptInjectionTime.START, None, None))
        self.view = WebKit2.WebView.new_with_user_content_manager(ucm)
        s = self.view.get_settings()
        s.set_enable_webgl(True)
        s.set_enable_developer_extras(True)
        s.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.ALWAYS)
        self.win = Gtk.Window()
        self.win.set_default_size(width, height)
        self.win.add(self.view)
        self.win.show_all()
        self.load_waiters = []
        self.view.connect('load-changed', self._on_load)
        self.view.connect('web-process-terminated', self._on_crash)

    def _on_load(self, _view, event):
        if event == WebKit2.LoadEvent.FINISHED:
            waiters, self.load_waiters = self.load_waiters, []
            for w in waiters:
                w({'value': None})

    def _on_crash(self, _view, reason):
        print('WEB PROCESS CRASHED:', reason, flush=True)
        waiters, self.load_waiters = self.load_waiters, []
        for w in waiters:
            w({'error': 'web process crashed'})

    # Each op runs on the GTK main thread and calls reply(dict) exactly once.
    def op(self, req, reply):
        kind = req.get('op')
        if kind == 'goto':
            self.load_waiters.append(reply)
            self.view.load_uri(req['url'])
        elif kind == 'eval':
            def done(view, res):
                try:
                    v = view.call_async_javascript_function_finish(res)
                    if v is None or v.is_undefined() or v.is_null():
                        reply({'value': None})
                    else:
                        reply({'value': json.loads(v.to_json(0) or 'null')})
                except Exception as e:  # noqa: BLE001
                    reply({'error': str(e)})

            self.view.call_async_javascript_function(req['body'], -1, None, None, None, None, done)
        elif kind == 'shot':
            def snap(view, res):
                try:
                    view.get_snapshot_finish(res).write_to_png(req['path'])
                    reply({'value': True})
                except Exception as e:  # noqa: BLE001
                    reply({'error': str(e)})

            self.view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, snap)
        elif kind == 'resize':
            self.win.resize(req['width'], req['height'])
            reply({'value': True})
        else:
            reply({'error': 'unknown op %s' % kind})


def main():
    host = Host()
    loop = GLib.MainLoop()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            req = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            box, ev = {}, threading.Event()

            def reply(r):
                box.update(r)
                ev.set()

            GLib.idle_add(lambda: host.op(req, reply) and False)
            ev.wait(600)
            data = json.dumps(box if box else {'error': 'bridge timeout'}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    env = dict(os.environ, WK_BRIDGE='http://127.0.0.1:%d/' % server.server_address[1],
               WK_VERSION='%d.%d.%d' % (WebKit2.get_major_version(), WebKit2.get_minor_version(), WebKit2.get_micro_version()))
    child = subprocess.Popen(sys.argv[1:], env=env)
    result = {}

    def on_exit(_pid, status):
        result['code'] = os.waitstatus_to_exitcode(status) if hasattr(os, 'waitstatus_to_exitcode') else status
        loop.quit()

    GLib.child_watch_add(GLib.PRIORITY_DEFAULT, child.pid, on_exit)
    loop.run()
    server.shutdown()
    sys.exit(result.get('code', 1))


if __name__ == '__main__':
    main()
