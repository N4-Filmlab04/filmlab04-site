#!/usr/bin/env python3
"""Local dev server for filmlab04-site — serves the static site and gives
admin.html a small API to read/write data/products.json directly on disk.

Local-only tool: no auth, no rate limiting. Do not expose this server
beyond localhost.
"""
import json
import re
import http.server
import socketserver
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
PRODUCTS_PATH = ROOT / "data" / "products.json"
IMAGES_DIR = ROOT / "images" / "products"
PORT = 8090
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/api/products":
            self._send_json(json.loads(PRODUCTS_PATH.read_text(encoding="utf-8")))
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/products":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
            except json.JSONDecodeError as e:
                self._send_json({"error": f"Invalid JSON: {e}"}, status=400)
                return
            if not isinstance(data, list):
                self._send_json({"error": "Expected a JSON array of products"}, status=400)
                return
            PRODUCTS_PATH.write_text(
                json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
            )
            self._send_json({"ok": True})
            return
        if self.path.startswith("/api/upload"):
            self._handle_upload()
            return
        self.send_error(404)

    def _handle_upload(self):
        query = parse_qs(urlparse(self.path).query)
        original = query.get("filename", ["upload"])[0]
        ext = Path(original).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            self._send_json({"error": f"Unsupported file type: {ext or '(none)'}"}, status=400)
            return

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_UPLOAD_BYTES:
            self._send_json({"error": "File is empty or exceeds the 20MB limit"}, status=400)
            return
        data = self.rfile.read(length)

        stem = re.sub(r"[^a-z0-9-]+", "-", Path(original).stem.lower()).strip("-") or "upload"
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        candidate = IMAGES_DIR / f"{stem}{ext}"
        n = 1
        while candidate.exists():
            candidate = IMAGES_DIR / f"{stem}-{n}{ext}"
            n += 1

        candidate.write_bytes(data)
        self._send_json({"path": f"images/products/{candidate.name}"})

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving filmlab04-site (with admin API) on http://localhost:{PORT}")
        httpd.serve_forever()
