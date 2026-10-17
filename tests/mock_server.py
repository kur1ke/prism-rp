"""Мок OpenAI-совместимого сервера для e2e-тестов Prism RP: /v1/models и стриминг /v1/chat/completions с CORS."""
import json, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG = []
IMG_LOG = []
# Детерминированный ответ на проверку инициативы (FOUNDATION-D): message | decline | error | slow — задаётся GET /initiative?mode=…
INITIATIVE = {"mode": "message"}
# 2×3 PNG (серый) — достаточно, чтобы браузер его показал
import base64, struct, zlib
def tiny_png(w=2, h=3):
    raw = b"".join(b"\x00" + b"\x80\x70\xa0" * w for _ in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
PNG_B64 = base64.b64encode(tiny_png()).decode()
LISTS = {
    "sd-models": [{"title": "illustriousXL_v01.safetensors", "model_name": "illustriousXL_v01"}],
    "sd-vae": [{"model_name": "sdxl_vae.safetensors"}],
    "samplers": [{"name": "Euler a"}, {"name": "DPM++ 2M"}],
    "schedulers": [{"name": "karras", "label": "Karras"}],
    "upscalers": [{"name": "R-ESRGAN 4x+ Anime6B"}],
    "loras": [{"name": "Orihime_IL", "alias": "training_123"}, {"name": "detail_slider"}],
}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code); self.cors(); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        for k, v in LISTS.items():
            if self.path.endswith("/sdapi/v1/" + k):
                return self.json(v)
        if "/initiative?mode=" in self.path:
            INITIATIVE["mode"] = self.path.split("mode=", 1)[1]
            return self.json(INITIATIVE)
        if self.path.endswith("/count"):
            return self.json({"chat": len(LOG), "img": len(IMG_LOG)})
        if self.path.endswith("/img-last"):
            return self.json(IMG_LOG[-1] if IMG_LOG else {})
        if self.path.endswith("/models"):
            body = json.dumps({"data": [{"id": "mock-rp-7b"}, {"id": "mock-rp-13b"}]}).encode()
            self.send_response(200); self.cors(); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)
        elif self.path.endswith("/last"):
            body = json.dumps(LOG[-1] if LOG else {}).encode()
            self.send_response(200); self.cors(); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)
        else:
            self.send_response(404); self.cors(); self.end_headers()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n) or b"{}")
        if self.path.endswith("/sdapi/v1/txt2img"):
            IMG_LOG.append(req)
            time.sleep(0.3)
            info = {"seed": req.get("seed", 1), "sampler_name": req.get("sampler_name", "Euler a"), "sd_model_name": "illustriousXL_v01", "width": req.get("width"), "height": req.get("height")}
            return self.json({"images": [PNG_B64], "info": json.dumps(info)})
        LOG.append(req)
        user_last = next((m["content"] for m in reversed(req.get("messages", [])) if m["role"] == "user"), "")
        if "Rewrite the scene" in user_last:
            text, reasoning = "1girl, orihime inoue, smiling, waving, cafe terrace, evening", ""
            self.send_response(200); self.cors(); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            self.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": text}}]}) + "\n\ndata: [DONE]\n\n").encode()); self.wfile.flush()
            return
        system = " ".join(m["content"] for m in req.get("messages", []) if m["role"] == "system")
        if "Проверка инициативы" in system:
            mode = INITIATIVE["mode"]
            if mode == "error":
                return self.json({"error": {"message": "mock initiative failure"}}, 500)
            if mode == "slow":
                time.sleep(1.5)
            text = "[no-message]" if mode == "decline" else "INI-OK: привет! давно не писал(а)\n\nскучаю немного"
            reasoning = ""
        elif "ассистент внутри Prism RP" in system:
            card = "карточка: да" if "### Карточка персонажа" in system else "карточка: нет"
            chat = "чат: да" if "### Выдержка из ролевого чата" in system else "чат: нет"
            text = "## Совет\n\n**Коротко:** " + card + ", " + chat + ".\n\n- первый пункт\n- второй пункт\n\n```\nописание: тихая\n```"
            reasoning = ""
        elif "мессенджере" in system:
            text = "привет!) только с пар вышла\n\nты как?\n\n[scene: Химэ.pose=идёт к метро]"
            reasoning = ""
        else:
            text = "*Химэ улыбается и отодвигает стул.* «Привет! Садись.»\n\n[scene: time=+10m; loc=Кафе, терраса; Химэ.wear=худи, джинсы; Химэ.rel=+1 рада встрече]"
            reasoning = "Она помнит прошлую встречу."
            if "нарисуй" in user_last.lower():
                text = "*Химэ позирует.* «Ну как?»\n\n[draw: 1girl, orihime_inoue, smiling, posing, cafe terrace, 2:3]\n[scene: Химэ.pose=позирует]"
        self.send_response(200); self.cors()
        self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        def send(obj):
            self.wfile.write(("data: " + json.dumps(obj, ensure_ascii=False) + "\n\n").encode()); self.wfile.flush()
        if reasoning:
            send({"choices": [{"delta": {"reasoning_content": reasoning}}]})
        for i in range(0, len(text), 7):
            send({"choices": [{"delta": {"content": text[i:i + 7]}}]})
            time.sleep(0.01)
        send({"choices": [{"delta": {}, "finish_reason": "stop"}]})
        self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8766), H).serve_forever()
