"""Local dev server: static files + POST /__save?name=x.png to write a data-URL image
into art/review/captures/ (used for visual testing of the animation debugger).

Usage: python tools/devserver.py [port]
"""
import base64
import http.server
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "review" / "captures"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/__save":
            self.send_error(404)
            return
        name = Path(parse_qs(u.query).get("name", ["capture.png"])[0]).name
        body = self.rfile.read(int(self.headers["Content-Length"])).decode()
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / name).write_bytes(base64.b64decode(body.split(",", 1)[1]))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8722
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
