"""PERF-01 — сквозная проверка в headless Chromium (настоящий IndexedDB, настоящий интерфейс поля ввода).
Запуск: python3 tests/e2e-perf.py <папка для скриншотов>
Поднимает статический сервер dist/ (8775) и мок OpenAI-сервера (8776) с управляемой задержкой служебного разбора.
Настройка (провайдер, персонаж, чат) — через сервисы приложения, проверки — через интерфейс:
  • ответ показан, разбор ещё идёт — поле ввода принимает реплику, видно «отправится автоматически»;
  • реплика не появляется в ленте и в базе, пока разбор не закончен; затем уходит сама, без дублей;
  • «Отменить» возвращает текст в поле и ничего не пишет;
  • переход в другой чат во время ожидания — реплика не пишется, текст сохраняется для своего чата;
  • Debug → «Тайминги» (режим разработчика) показывает замеры, без текста сообщений;
  • 390 px: строка статуса без горизонтальной прокрутки."""
import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
os.makedirs(OUT, exist_ok=True)
MOCK = "http://127.0.0.1:8776"
static = subprocess.Popen([sys.executable, "-m", "http.server", "8775", "-d", os.path.join(ROOT, "dist")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
mock = subprocess.Popen([sys.executable, os.path.join(ROOT, "tests/mock_server.py"), "8776"])
time.sleep(1.0)

results = []
def check(name, cond):
    results.append((name, bool(cond)))
    print(("✓ " if cond else "✗ ") + name)
def get(path):
    return json.load(urllib.request.urlopen(MOCK + path))

SETUP = """async () => {
  const A = PRP.app, S = A.S, ctx = A.ctx;
  S.settings.providers.push({ id: 'p-mock', name: 'Mock', kind: 'openai', baseUrl: 'http://127.0.0.1:8776/v1', apiKey: '', model: 'mock-rp-7b', models: ['mock-rp-7b'] });
  S.settings.activeProvider = 'p-mock';
  S.settings.developerMode = true;
  S.settings.images.enabled = false;
  await ctx.saveSettings();
  const d = ctx.svc.cards.draft(null); d.name = 'Химэ'; d.description = 'Студентка.';
  const r = await ctx.svc.cards.save(d);
  await ctx.nav.newChat('rp', r.card.id);
  return { card: r.card.id, chat: S.chatId };
}"""
user_msgs = lambda page: page.evaluate("async () => (await PRP.app.ctx.DB.byIndex('messages', 'chatId', PRP.app.S.chatId)).filter((m) => m.role === 'user').map((m) => m.swipes[0].text)")

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_context(viewport={"width": 1280, "height": 860}).new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "net::ERR_" not in m.text else None)
        page.goto("http://127.0.0.1:8775/standalone/index.html")
        page.wait_for_function("window.PRP && PRP.app && PRP.app.S.settings")
        ids = page.evaluate(SETUP)
        page.wait_for_selector(".composer #input")
        get("/state-delay?ms=2500")

        # Первый ход: разбор реплики и ответа — по 2,5 с.
        page.fill("#input", "Я сижу в кафе у окна.")
        page.keyboard.press("Enter")
        page.wait_for_function("document.querySelectorAll('.turn.assistant').length >= 1 && !PRP.app.S.gen", timeout=20000)
        t_shown = time.time()
        busy = page.evaluate("({ tracking: PRP.app.S.tracking, turn: PRP.app.S.turn })")
        check("PERF-E1: ответ показан, разбор ответа ещё идёт, хода нет — ввод свободен", busy["tracking"] is True and busy["turn"] is None
              and page.locator(".turn-status.quiet").count() == 1)
        page.fill("#input", "Я снял шарф и сел ближе.")
        page.keyboard.press("Enter")
        page.wait_for_timeout(200)
        accepted = page.evaluate("PRP.app.S.turn && PRP.app.S.turn.phase")
        check("PERF-E2: реплика принята сразу (поле очищено, статус «отправится автоматически»)",
              accepted == "waiting-state" and page.input_value("#input") == "" and "отправится автоматически" in page.inner_text(".turn-status"))
        check("PERF-E3: до конца разбора реплики нет ни в ленте, ни в IndexedDB", "Я снял шарф" not in page.inner_text("#feed-inner")
              and user_msgs(page) == ["Я сижу в кафе у окна."])
        page.keyboard.press("Enter")  # повторное нажатие с пустым полем и повтор той же реплики — без дублей
        page.fill("#input", "Я снял шарф и сел ближе.")
        page.keyboard.press("Enter")
        check("PERF-E4: повторная отправка во время ожидания не принимается, текст остаётся в поле", page.input_value("#input") == "Я снял шарф и сел ближе.")
        page.fill("#input", "")
        page.screenshot(path=os.path.join(OUT, "perf-01-waiting.png"))
        page.wait_for_function("document.querySelectorAll('.turn.assistant').length >= 2 && !PRP.app.S.gen && !PRP.app.S.turn", timeout=30000)
        check("PERF-E5: после разбора реплика ушла сама, ровно одна, ответ получен", user_msgs(page) == ["Я сижу в кафе у окна.", "Я снял шарф и сел ближе."]
              and page.locator(".turn.user", has_text="Я снял шарф").count() == 1)

        # Отмена: текст возвращается в поле, ничего не пишется.
        page.wait_for_function("PRP.app.S.tracking === true", timeout=5000)
        page.fill("#input", "Отменяемая реплика.")
        page.keyboard.press("Enter")
        page.wait_for_selector("[data-act=send-cancel]")
        page.click("[data-act=send-cancel]")
        page.wait_for_timeout(200)
        check("PERF-E6: «Отменить» — текст в поле, хода нет", page.input_value("#input") == "Отменяемая реплика." and page.evaluate("PRP.app.S.turn") is None)
        page.wait_for_function("PRP.app.S.tracking === false", timeout=10000)
        check("PERF-E6: отменённая реплика не записана", "Отменяемая реплика." not in user_msgs(page))
        page.fill("#input", "")

        # Смена чата во время ожидания: реплика не пишется, текст возвращается своему чату.
        get("/state-delay?ms=1500")
        page.fill("#input", "Я встал.")
        page.keyboard.press("Enter")
        page.wait_for_function("document.querySelectorAll('.turn.assistant').length >= 3 && !PRP.app.S.gen", timeout=30000)
        page.fill("#input", "Это не должно уйти в другой чат.")
        page.keyboard.press("Enter")
        page.wait_for_function("PRP.app.S.turn && PRP.app.S.turn.phase === 'waiting-state'")
        first_chat = ids["chat"]
        page.evaluate(f"PRP.app.ctx.nav.newChat('rp', '{ids['card']}')")
        page.wait_for_function(f"PRP.app.S.chatId !== '{first_chat}'")
        second_chat = page.evaluate("PRP.app.S.chatId")
        page.wait_for_selector(".composer #input")
        page.fill("#input", "Текст второго чата.")  # пользователь уже пишет во втором чате, пока первый ход ждёт
        page.wait_for_function("!PRP.app.S.turn", timeout=10000)
        page.wait_for_timeout(300)
        b_input = page.input_value("#input")
        n_other = page.evaluate("async () => (await PRP.app.ctx.DB.byIndex('messages', 'chatId', PRP.app.S.chatId)).length")
        page.evaluate(f"PRP.app.ctx.nav.openChat('{first_chat}')")
        page.wait_for_function(f"PRP.app.S.chatId === '{first_chat}'")
        page.wait_for_timeout(300)
        check("PERF-E7: смена чата — реплика не записана ни туда, ни сюда; текст вернулся в поле своего чата, а не в поле второго",
              n_other == 0 and "Это не должно уйти в другой чат." not in user_msgs(page) and page.input_value("#input") == "Это не должно уйти в другой чат."
              and b_input == "Текст второго чата.")
        # Поле ввода принадлежит своему чату: набранное не переносится в другой чат и возвращается при возврате.
        page.fill("#input", "Черновик первого чата.")
        page.evaluate(f"PRP.app.ctx.nav.openChat('{second_chat}')")
        page.wait_for_function(f"PRP.app.S.chatId === '{second_chat}'")
        page.wait_for_timeout(200)
        in_b = page.input_value("#input")
        page.evaluate(f"PRP.app.ctx.nav.openChat('{first_chat}')")
        page.wait_for_function(f"PRP.app.S.chatId === '{first_chat}'")
        page.wait_for_timeout(200)
        in_a = page.input_value("#input")
        page.evaluate("PRP.app.ctx.nav.goHome()")
        page.evaluate(f"PRP.app.ctx.nav.openChat('{second_chat}')")
        page.wait_for_function(f"PRP.app.S.chatId === '{second_chat}'")
        page.wait_for_timeout(200)
        in_b2 = page.input_value("#input")
        check("PERF-E7b: черновики по чатам — текст первого не попадает во второй, у каждого свой после переходов (в т. ч. через главный экран)",
              in_b == "Текст второго чата." and in_a == "Черновик первого чата." and in_b2 == "Текст второго чата.")
        page.fill("#input", "")
        page.evaluate(f"PRP.app.ctx.nav.openChat('{first_chat}')")
        page.wait_for_function(f"PRP.app.S.chatId === '{first_chat}'")
        page.wait_for_timeout(200)
        # Уход из чата в «Персонажи» (кнопка в боковой панели) и обратно — черновик своего чата сохраняется.
        page.fill("#input", "Черновик перед «Персонажами».")
        if not page.locator(".rail [data-act=characters]").is_visible():
            page.evaluate("PRP.app.ctx.nav.goCharacters()")
        else:
            page.click(".rail [data-act=characters]")
        page.wait_for_function("PRP.app.S.view === 'characters'")
        page.wait_for_timeout(200)
        on_chars = page.locator("#input").count()
        page.evaluate(f"PRP.app.ctx.nav.openChat('{first_chat}')")
        page.wait_for_function(f"PRP.app.S.chatId === '{first_chat}' && PRP.app.S.view === 'chat'")
        page.wait_for_timeout(200)
        check("PERF-E7c: чат → «Персонажи» → тот же чат — черновик не потерян",
              on_chars == 0 and page.input_value("#input") == "Черновик перед «Персонажами».")
        page.fill("#input", "")
        page.dispatch_event("#input", "input")

        # Тайминги в Debug
        page.click("[data-act=debug-open]")
        page.click("[data-act=debug-section][data-section=timing]")
        tm = page.inner_text(".debug-modal")
        check("PERF-E8: Debug → «Тайминги» — этапы хода есть, текста сообщений нет",
              all(k in tm for k in ["readyAfterReplyMs", "roleplayMs", "assistantStateMs", "userStateMs", "sendToRoleplayMs"]) and "шарф" not in tm and "кафе" not in tm)
        perf = page.evaluate("PRP.app.S.perf")
        ready = [x["ms"] for x in perf if x["metric"] == "readyAfterReplyMs"]
        ast = [x["ms"] for x in perf if x["metric"] == "assistantStateMs"]
        print("    perf readyAfterReplyMs:", ready, "assistantStateMs:", ast)
        check("PERF-E9: ввод освобождается сразу после ответа (readyAfterReplyMs < 300 мс при разборе 1,5–2,5 с)", ready and max(ready) < 300 and ast and min(ast) >= 1400)
        page.screenshot(path=os.path.join(OUT, "perf-02-timing.png"))
        page.click("[data-act=modal-close]")

        # 390 px: строка статуса помещается
        page.set_viewport_size({"width": 390, "height": 820})
        page.wait_for_timeout(200)
        get("/state-delay?ms=2000")
        page.fill("#input", "Я посмотрел в окно.")
        page.keyboard.press("Enter")
        page.wait_for_function("document.querySelectorAll('.turn.assistant').length >= 4 && !PRP.app.S.gen", timeout=30000)
        page.fill("#input", "Очень длинная реплика, чтобы проверить перенос строки статуса на узком экране без горизонтальной прокрутки страницы.")
        page.keyboard.press("Enter")
        page.wait_for_selector(".turn-status [data-act=send-cancel]")
        check("PERF-E10: 390 px — статус ожидания без горизонтальной прокрутки",
              page.evaluate("document.documentElement.scrollWidth <= window.innerWidth && (() => { const r = document.querySelector('.turn-status').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; })()"))
        page.screenshot(path=os.path.join(OUT, "perf-03-mobile.png"))
        page.wait_for_function("!PRP.app.S.turn && !PRP.app.S.gen", timeout=30000)
        check("PERF-E11: нет ошибок JS", not errors)
        if errors: print("   ", errors[:5])

        # Perchance-сборка с заглушкой ai-text-plugin: служебный разбор идёт через тот же плагин (1,2 с), RP — сразу.
        STUB = """
window.__calls = [];
window.ai = function (opts) {
  if (opts && opts.getMetaObject) return { countTokens: s => Math.ceil(String(s).length / 4), idealMaxContextTokens: 6000 };
  if (opts && opts.preload) return;
  const ins = typeof opts.instruction === 'function' ? opts.instruction() : opts.instruction;
  const sw = typeof opts.startWith === 'function' ? opts.startWith() : (opts.startWith || '');
  const service = /извлекатель ДОКАЗАННЫХ ИЗМЕНЕНИЙ/.test(ins || '');
  window.__calls.push({ service, at: Date.now() });
  const text = service ? '{"events": []}' : ' Привет из Perchance! Я сижу у окна.';
  let resolveFn; const p = new Promise(r => resolveFn = r);
  (async () => {
    await new Promise(r => setTimeout(r, service ? 1200 : 30));
    opts.onChunk && opts.onChunk({ textChunk: text, fullTextSoFar: sw + text, isFromStartWith: false });
    resolveFn({ text: sw + text, generatedText: text });
  })();
  p.stop = () => p;
  return p;
};
"""
        src = open(os.path.join(ROOT, "dist/perchance/html.html"), encoding="utf-8").read()
        tp = os.path.join(ROOT, "dist/perchance/_perf_test.html")
        with open(tp, "w", encoding="utf-8") as f:
            f.write("<!doctype html><html><head><meta charset='utf-8'><script>" + STUB + "</script></head><body>" + src + "</body></html>")
        try:
            p2 = b.new_context(viewport={"width": 1280, "height": 860}).new_page()
            errors2 = []
            p2.on("pageerror", lambda e: errors2.append(str(e)))
            p2.goto("http://127.0.0.1:8775/perchance/_perf_test.html")
            p2.wait_for_function("window.PRP && PRP.app && PRP.app.S.settings")
            p2.evaluate("""async () => { const ctx = PRP.app.ctx; PRP.app.S.settings.images.enabled = false;
              const d = ctx.svc.cards.draft(null); d.name = 'Химэ'; const r = await ctx.svc.cards.save(d); await ctx.nav.newChat('rp', r.card.id); }""")
            p2.wait_for_selector(".composer #input")
            check("PERF-P1: Perchance выбран по умолчанию", "Perchance" in p2.inner_text(".composer"))
            p2.fill("#input", "Я сижу в кафе.")
            p2.keyboard.press("Enter")
            p2.wait_for_function("document.querySelectorAll('.turn.assistant').length >= 1 && !PRP.app.S.gen", timeout=20000)
            p2.fill("#input", "Я снял шарф.")
            p2.keyboard.press("Enter")
            p2.wait_for_timeout(150)
            waiting = p2.evaluate("PRP.app.S.turn && PRP.app.S.turn.phase")
            p2.wait_for_function("document.querySelectorAll('.turn.assistant').length >= 2 && !PRP.app.S.gen && !PRP.app.S.turn", timeout=20000)
            calls = p2.evaluate("window.__calls.map((c) => c.service ? 'S' : 'R').join('')")
            check("PERF-P2: Perchance — реплика принята во время разбора и ушла после него; порядок вызовов разбор→RP→разбор→разбор→RP", waiting == "waiting-state" and calls.startswith("SRSSR"))
            print("    perchance calls:", calls)
            check("PERF-P3: нет ошибок JS (Perchance)", not errors2)
            if errors2: print("   ", errors2[:5])
        finally:
            os.remove(tp)
        b.close()
finally:
    static.terminate(); mock.terminate()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)} из {len(results)} проверок пройдено")
sys.exit(1 if failed else 0)
