"""Сквозной тест Prism RP в headless Chromium.
Запуск: python3 tests/e2e.py <папка для скриншотов>
Поднимает статический сервер для dist/, мок OpenAI-сервера и проходит основные сценарии,
включая сборку для Perchance с заглушкой ai-text-plugin."""
import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright
import base64, struct


def png_card_lora(png):
    """Имя первой LoRA из extensions.prism_rp в чанке chara экспортированного PNG."""
    i = 8
    while i < len(png):
        n = struct.unpack(">I", png[i:i + 4])[0]
        t = png[i + 4:i + 8]
        if t == b"tEXt":
            k, _, v = png[i + 8:i + 8 + n].partition(b"\0")
            if k == b"chara":
                d = json.loads(base64.b64decode(v).decode("utf8"))["data"]
                try:
                    return d["extensions"]["prism_rp"]["image"]["loras"][0]["name"]
                except Exception:
                    return None
        i += 12 + n
    return None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
os.makedirs(OUT, exist_ok=True)
CARD = os.path.join(OUT, "himeh.png")
subprocess.run(["node", os.path.join(ROOT, "tests/make_card.js"), CARD], check=True)

static = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", os.path.join(ROOT, "dist")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
mock = subprocess.Popen([sys.executable, os.path.join(ROOT, "tests/mock_server.py"), "8766"])
time.sleep(1.0)

results = []
def check(name, cond):
    results.append((name, bool(cond)))
    print(("✓ " if cond else "✗ ") + name)

def wait_text(page, sel, sub, absent=False, timeout=6000):
    try:
        page.wait_for_function("([s,t,a]) => { const e=document.querySelector(s); return !!e && (a ? !e.innerText.includes(t) : e.innerText.includes(t)); }", arg=[sel, sub, absent], timeout=timeout)
        return True
    except Exception:
        return False

def idle(page, timeout=15000):
    page.wait_for_function("!document.querySelector('#app').classList.contains('generating')", timeout=timeout)

def shot(page, name):
    page.wait_for_timeout(350)
    page.screenshot(path=os.path.join(OUT, name))

AI_STUB = """
window.__aiCalls = [];
window.ai = function (opts) {
  if (opts && opts.getMetaObject) return { countTokens: s => Math.ceil(String(s).length / 4), idealMaxContextTokens: 6000 };
  if (opts && opts.preload) return;
  const ins = typeof opts.instruction === 'function' ? opts.instruction() : opts.instruction;
  const sw = typeof opts.startWith === 'function' ? opts.startWith() : opts.startWith;
  window.__aiCalls.push({ instruction: ins, startWith: sw });
  const text = ' Привет из Perchance! *смеётся*\\n\\n[scene: Химэ.mood=весёлая]';
  let stopped = false, resolveFn;
  const p = new Promise(r => resolveFn = r);
  (async () => {
    opts.onChunk && opts.onChunk({ textChunk: sw, isFromStartWith: true });
    let acc = '';
    for (let i = 0; i < text.length && !stopped; i += 5) {
      const ch = text.slice(i, i + 5); acc += ch;
      opts.onChunk && opts.onChunk({ textChunk: ch, fullTextSoFar: sw + acc, isFromStartWith: false });
      await new Promise(r => setTimeout(r, 10));
    }
    resolveFn({ text: sw + acc, generatedText: acc });
  })();
  p.stop = () => { stopped = true; return p; };
  return p;
};
window.__imgCalls = [];
window.image = async function (opts) {
  window.__imgCalls.push(opts);
  await new Promise(r => setTimeout(r, 50));
  const c = document.createElement('canvas'); c.width = 4; c.height = 6;
  const g = c.getContext('2d'); g.fillStyle = '#a080c0'; g.fillRect(0, 0, 4, 6);
  const out = new String(c.toDataURL('image/png')); out.dataUrl = String(out); out.canvas = c; return out;
};
"""

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "net::ERR_" not in m.text else None)
        page.goto("http://127.0.0.1:8765/standalone/index.html")
        page.wait_for_selector(".home")
        check("главный экран: приветствие с шагами", page.locator(".step").count() == 3)
        shot(page, "01-welcome.png")

        # Импорт карточки
        page.set_input_files("#file-card", CARD)
        page.wait_for_selector(".imp-modal")
        rv = page.inner_text(".imp-modal")
        check("импорт PNG: экран проверки до сохранения", "Character Card V3" in rv and "Химэ" in rv and page.locator(".tile").count() == 0)
        page.click("[data-act=import-confirm]")
        page.wait_for_selector(".tile")
        check("импорт PNG: плитка персонажа после подтверждения", "Химэ" in page.inner_text(".gallery"))

        # Создание персонажа через редактор
        page.click(".home-tools [data-act=new-card]")
        page.wait_for_selector(".modal")
        page.fill("#cf-name", "Юки")
        page.fill("#cf-desc", "Тихая библиотекарша.")
        check("редактор: подписи полей по CCv2", all(k in page.inner_text(".modal-body") for k in ["description", "personality", "scenario"]))
        page.click("[data-act=card-section][data-section=greet]")
        page.click("[data-act=alt-add]")
        page.fill("[data-alt='0']", "Второе приветствие.")
        page.click("[data-act=card-section][data-section=lore]")
        page.click("[data-act=lore-add]")
        page.fill("[data-lore='0'][data-k=comment]", "Библиотека")
        page.fill("[data-lore='0'][data-k=keys]", "библиотека")
        page.check("[data-lore='0'][data-k=selective]")
        page.wait_for_selector("[data-lore='0'][data-k=secondary_keys]")
        page.fill("[data-lore='0'][data-k=secondary_keys]", "вечер")
        page.fill("[data-lore='0'][data-k=content]", "Библиотека закрывается в девять.")
        page.click("[data-act=card-section][data-section=meta]")
        page.fill("#cf-creator", "tester")
        page.fill("#cf-version", "1.2")
        page.click("[data-act=card-section][data-section=main]")
        check("редактор: поля сохраняются при смене раздела", page.input_value("#cf-name") == "Юки")
        page.click("[data-act=card-save]")
        page.wait_for_selector(".modal", state="detached")
        check("создание персонажа", page.locator(".tile").count() == 3)
        page.locator(".tile", has_text="Юки").locator(".tile-edit").click()
        page.wait_for_selector(".modal")
        check("кнопка «Изменить» на плитке открывает карточку", page.input_value("#cf-name") == "Юки")
        page.click("[data-act=card-section][data-section=greet]")
        check("альтернативное приветствие сохранено", page.input_value("[data-alt='0']") == "Второе приветствие.")
        page.click("[data-act=card-section][data-section=lore]")
        check("лорбук: доп. ключи и название сохранены", page.input_value("[data-lore='0'][data-k=secondary_keys]") == "вечер" and page.input_value("[data-lore='0'][data-k=comment]") == "Библиотека")
        page.click("[data-act=card-section][data-section=meta]")
        check("создатель и версия сохранены", page.input_value("#cf-creator") == "tester" and page.input_value("#cf-version") == "1.2")
        page.click("[data-act=modal-close]")
        page.wait_for_selector(".modal", state="detached")
        shot(page, "02-home.png")

        # Модель
        page.click("[data-act=settings]")
        page.wait_for_selector(".modal")
        page.click("[data-act=prov-add][data-preset=custom]")
        page.fill("#prov-url", "http://127.0.0.1:8766/v1")
        page.click("[data-act=prov-models]")
        check("загрузка списка моделей", wait_text(page, ".modal", "Доступно моделей: 2"))
        check("первая модель выбрана автоматически", page.input_value("#prov-model") == "mock-rp-7b")
        shot(page, "03-settings.png")
        page.click("[data-act=prov-save]")
        page.click("[data-act=settings][data-section=gen]")
        check("настройка «не передавать инструкции после истории» выключена по умолчанию", page.locator("[data-set=noPostHistory]").count() == 1 and not page.is_checked("[data-set=noPostHistory]"))
        page.click(".preset[data-id=lively]")
        try:
            page.wait_for_function("document.querySelector('[data-sampler=temperature]') && document.querySelector('[data-sampler=temperature]').value === '1.1'", timeout=5000)
            check("пресет «Живой» применён", True)
        except Exception:
            check("пресет «Живой» применён", False)
        page.click("[data-act=modal-close]")

        # Открыть Химэ: новый чат-сцена с приветствием
        page.locator(".tile", has_text="Химэ").locator(".tile-body").click()
        page.wait_for_selector(".turn.assistant")
        check("приветствие с подстановкой {{user}}", "«Пользователь! Ты пришёл.»" in page.inner_text("#feed"))
        check("строка сцены в шапке", wait_text(page, ".chat-head", "Кафе у кампуса"))
        check("счётчик контекста в композере", page.locator(".composer .meter").count() == 1)

        # Отправка
        page.fill("#input", "Привет, как ты? Пойдём в кафе?")
        page.keyboard.press("Enter")
        page.wait_for_function("document.querySelectorAll('.turn').length === 3")
        idle(page)
        txt = page.inner_text("#feed")
        check("ответ получен, директива вырезана", "Садись" in txt and "[scene:" not in txt)
        check("плашки изменений сцены", page.locator(".turn.last .delta").count() == 4)
        req = json.load(urllib.request.urlopen("http://127.0.0.1:8766/v1/last"))
        sys0 = req["messages"][0]["content"]
        check("Prism: склонности, сцена, лорбук", "не диктуют поступки" in sys0 and "Место: Кафе у кампуса" in sys0 and "до полуночи" in sys0)
        check("пресет «Живой» ушёл в запрос", req.get("temperature") == 1.1)
        check("строка сцены обновилась", wait_text(page, ".chat-head", "Кафе, терраса"))

        # Продолжение
        page.click(".turn.last [data-act=continue]")
        page.wait_for_timeout(200)
        idle(page)
        req = json.load(urllib.request.urlopen("http://127.0.0.1:8766/v1/last"))
        check("продолжение: инструкция и дописанный текст", "Продолжи последнее сообщение" in req["messages"][-1]["content"] and page.inner_text(".turn.last .prose").count("Садись") == 2)

        # Панель сцены — формы
        page.click("[data-act=drawer]")
        page.wait_for_selector(".drawer.open #sc-date")
        check("сцена: время из дельт", page.input_value("#sc-time") == "18:20" and page.input_value("#sc-date") == "14.05")
        page.click("[data-act=sc-shift][data-v='+1h']")
        check("сцена: +1 час", wait_text(page, ".chat-head", "19:20"))
        page.fill("[data-sc-top=weather]", "дождь")
        page.keyboard.press("Enter")
        check("сцена: погода из формы", wait_text(page, ".chat-head", "дождь"))
        page.locator("[data-person='Химэ'] .chip-add").fill("шарф")
        page.locator("[data-person='Химэ'] .chip-add").press("Enter")
        check("гардероб: надеть", wait_text(page, "[data-person='Химэ']", "шарф"))
        page.locator("[data-person='Химэ'] [data-act=sc-remove][data-item='худи']").click()
        check("гардероб: снять", wait_text(page, "[data-person='Химэ'] .chips", "худи", absent=True))
        page.locator("[data-sc-rel='Химэ']").fill("5")
        page.locator("[data-sc-rel='Химэ']").dispatch_event("change")
        check("отношение: ползунок", wait_text(page, "#rel-out", "близко"))
        shot(page, "04-chat-scene.png")
        page.click("[data-act=prism-preview]") if page.locator("[data-act=prism-preview]").count() else None

        # Свайпы
        page.click(".turn.last [data-act=regen]")
        page.wait_for_timeout(200)
        idle(page)
        check("новый вариант 2/2", wait_text(page, ".turn.last .swipes", "2/2"))
        page.click(".turn.last [data-act=swipe][data-dir='-1']")
        check("назад к 1/2", wait_text(page, ".turn.last .swipes", "1/2"))

        # Опыт
        page.click(".turn.last [data-act=to-exp]")
        page.wait_for_selector("#x-event")
        check("время сцены в черновике опыта", wait_text(page, "#drawer-body", "14.05"))
        page.fill("#x-event", "Кира соврал Химэ о деньгах")
        page.fill("#x-interp", "Решила, что он считает её наивной")
        page.click("[data-act=x-val][data-v='-2']")
        check("значения формы опыта переживают перерисовку", page.input_value("#x-event") == "Кира соврал Химэ о деньгах")
        page.fill("#x-domain-add", "деньги, доверие, кафе")
        page.keyboard.press("Enter")
        check("темы-чипы", wait_text(page, "#x-domains", "доверие"))
        page.click("[data-act=exp-save]")
        check("событие сохранено", wait_text(page, "#drawer-body", "соврал Химэ о деньгах"))
        check("опыт из сообщения помечен как опыт ветки", wait_text(page, "#drawer-body", "ветка"))
        shot(page, "05-memory.png")
        # Ветки: другой вариант ответа скрывает запись, возврат восстанавливает (PRISM1-2/3 в интерфейсе)
        page.click(".turn.last [data-act=swipe][data-dir='1']")
        check("ветка: в другом варианте запись скрыта", wait_text(page, ".turn.last .swipes", "2/2") and "соврал Химэ о деньгах" not in page.inner_text("#drawer-body") and "В других ветках этого чата ещё 1" in page.inner_text("#drawer-body"))
        page.click(".turn.last [data-act=swipe][data-dir='-1']")
        check("ветка: возврат восстанавливает запись", wait_text(page, "#drawer-body", "соврал Химэ о деньгах"))

        # Prism
        page.click("[data-act=tab][data-tab=prism]")
        check("Prism: память с интерпретацией", wait_text(page, "#drawer-body", "тогда понял(а) это так: Решила"))
        check("Prism: строгий бюджет в отчёте", "помещается" in page.inner_text("#drawer-body"))
        check("Prism: таблица отбора опыта", page.locator(".exp-debug tr.sel").count() == 1)
        check("Prism: полоса слоёв", page.locator(".bar-meter i").count() >= 5)
        shot(page, "06-prism.png")


        # Изображения: Forge/A1111 (мок)
        page.click("[data-act=settings]")
        page.click("[data-act=settings][data-section=images]")
        page.click("[data-act=img-backend][data-id=a1111]")
        page.fill("[data-imgcfg=url]", "http://127.0.0.1:8766")
        page.dispatch_event("[data-imgcfg=url]", "change")
        page.click("[data-act=img-lists]")
        ok_lists = wait_text(page, ".modal", "Модели: 1, LoRA: 2")
        check("изображения: списки с сервера", ok_lists)
        if not ok_lists:
            print("    toast:", page.inner_text("#toast"), "| modal:", page.inner_text(".modal-body")[:300].replace("\n", " "))
        check("изображения: модель выбрана из списка", page.input_value("[data-imgcfg=model]") == "illustriousXL_v01.safetensors")
        page.fill("[data-imgcfg=fixedPrompt]", "masterpiece, best quality")
        page.dispatch_event("[data-imgcfg=fixedPrompt]", "change")
        check("изображения: общих LoRA в настройках нет", page.locator("[data-act=img-lora-add]").count() == 0)
        shot(page, "12-images-settings.png")
        page.click("[data-act=modal-close]")
        page.click(".chat-head .head-card")
        page.wait_for_selector(".modal")
        check("имя в шапке чата открывает карточку", page.input_value("#cf-name") == "Химэ")
        page.click("[data-act=card-section][data-section=images]")
        page.fill("[data-ci=trigger]", "orihime inoue, long orange hair")
        page.click("[data-act=card-lora-add]")
        page.fill("[data-card-lora-name='0']", "Orihime_IL")
        page.fill("[data-card-lora-w='0']", "0.8")
        page.fill("[data-ci=wardrobe]", "джинсы | jeans: blue denim jeans")
        page.fill("[data-ci=negative]", "short hair")
        page.click("[data-act=card-save]")
        page.wait_for_selector(".modal", state="detached")
        page.fill("#input", "Нарисуй себя, пожалуйста")
        page.keyboard.press("Enter")
        try:
            page.wait_for_selector(".turn.last .shot img", timeout=15000)
            check("авто-рисование по [draw:]", True)
        except Exception:
            check("авто-рисование по [draw:]", False)
        check("директива [draw:] скрыта", "[draw:" not in page.inner_text("#feed"))
        img = json.load(urllib.request.urlopen("http://127.0.0.1:8766/img-last"))
        pr = img.get("prompt", "")
        check("промпт: LoRA персонажа", "<lora:Orihime_IL:0.8>" in pr and pr.count("<lora:") == 1)
        ok_tw = ("orihime inoue" in pr or "orihime_inoue" in pr) and "long orange hair" in pr and "blue denim jeans" in pr
        check("промпт: триггер и гардероб из сцены", ok_tw)
        if not ok_tw: print("    prompt:", pr)
        check("промпт: блок качества один раз", pr.count("masterpiece") == 1)
        check("размер 2:3 → 832×1216", img.get("width") == 832 and img.get("height") == 1216)
        check("негатив персонажа", "short hair" in img.get("negative_prompt", ""))
        check("модель передана серверу", img.get("override_settings", {}).get("sd_model_checkpoint") == "illustriousXL_v01.safetensors")
        page.locator(".turn.last .shot").hover()
        page.click(".turn.last [data-act=img-info]")
        check("сведения о картинке", wait_text(page, ".pop", "Seed"))
        page.keyboard.press("Escape")
        page.click(".turn.last [data-act=img-pin]")
        check("закрепление seed", wait_text(page, "#toast", "закреплён"))
        page.click(".turn.last .shot img")
        check("просмотр картинки", page.locator(".lightbox img").count() == 1)
        shot(page, "13-lightbox.png")
        page.click(".lightbox [data-act=modal-close]")
        seed_pinned = img.get("seed")
        page.click(".turn.last [data-act=img-regen]")
        page.wait_for_timeout(300)
        page.wait_for_selector(".turn.last .shot img", timeout=15000)
        img2 = json.load(urllib.request.urlopen("http://127.0.0.1:8766/img-last"))
        check("«заново» — новый seed", img2.get("seed") != seed_pinned)
        # Ручное рисование русского сообщения → перевод сцены
        page.locator(".turn.assistant >> nth=0").locator("[data-act=draw]").click()
        page.wait_for_function("document.querySelectorAll('.turn.assistant')[0].querySelector('.shot img')", timeout=15000)
        req = json.load(urllib.request.urlopen("http://127.0.0.1:8766/v1/last"))
        check("перевод сцены текстовой моделью", "Rewrite the scene" in req["messages"][-1]["content"])
        img3 = json.load(urllib.request.urlopen("http://127.0.0.1:8766/img-last"))
        check("переведённая сцена в промпте", "smiling, waving, cafe terrace" in img3.get("prompt", ""))
        check("закреплённый seed применён", img3.get("seed") == seed_pinned)
        shot(page, "14-chat-images.png")

        # Поиск
        page.keyboard.press("Control+f")
        page.fill("#find-q", "садись")
        check("поиск: совпадения подсвечены", wait_text(page, "#find-count", "из"))
        page.keyboard.press("Escape")

        # Переписка
        page.click("[data-act=chat-menu]")
        page.click(".pop [data-act=new-chat][data-mode=messenger]")
        page.wait_for_selector(".app.messenger")
        page.fill("#input", "привет, ты где?")
        page.keyboard.press("Enter")
        page.wait_for_function("document.querySelectorAll('.msg-row.them .bub').length >= 2")
        idle(page)
        check("переписка: пузыри", page.locator(".msg-row.them .bub").count() == 2)
        check("переписка: статус из сцены", wait_text(page, ".chat-head", "идёт к метро"))
        req = json.load(urllib.request.urlopen("http://127.0.0.1:8766/v1/last"))
        check("переписка: рамка", "переписывается с Пользователь" in req["messages"][0]["content"])
        check("PRISM1-1: опыт другого чата не попадает в модель", "соврал Химэ" not in json.dumps(req["messages"], ensure_ascii=False))
        page.click("[data-act=drawer]") if not page.locator(".drawer.open").count() else None
        page.click("[data-act=tab][data-tab=memory]")
        check("PRISM1-1: вкладка опыта другого чата пуста", "соврал Химэ" not in page.inner_text("#drawer-body"))
        page.click("[data-act=tab][data-tab=scene]")
        shot(page, "07-messenger.png")

        # Модель из композера
        page.click("[data-act=model-pop]")
        check("поповер моделей", page.locator(".pop [data-act=pick-model]").count() == 2)
        page.click(".pop [data-act=pick-model][data-model=mock-rp-13b]")
        check("быстрая смена модели", wait_text(page, ".composer", "mock-rp-13b"))

        # Перезагрузка
        page.reload()
        page.wait_for_selector(".msg-row")
        check("после перезагрузки открыт тот же чат", "ты как?" in page.inner_text("#feed"))

        # Тема
        page.click("[data-act=settings]")
        page.click("[data-act=settings][data-section=look]")
        page.click("[data-act=theme][data-id=paper]")
        check("тема «Бумага»", page.evaluate("document.documentElement.dataset.theme") == "paper")
        page.click("[data-act=modal-close]")
        page.click(".rail-chat >> nth=1")
        page.wait_for_selector(".turn")
        if not page.locator(".drawer.open").count(): page.click("[data-act=drawer]")
        page.click("[data-act=tab][data-tab=memory]")
        check("PRISM1-1: в своём чате опыт на месте", wait_text(page, "#drawer-body", "соврал Химэ о деньгах"))
        shot(page, "08-paper.png")

        # Бэкап
        page.click("[data-act=settings]")
        page.click("[data-act=settings][data-section=data]")
        with page.expect_download() as dl:
            page.click("[data-act=backup]")
        data = json.load(open(dl.value.path()))
        check("бэкап со всеми коллекциями", all(len(data[k]) > 0 for k in ["cards", "chats", "messages", "experience", "settings"]))
        page.click("[data-act=modal-close]")

        # Ассистент: разговор с моделью вне игры
        page.click("[data-act=chat-menu]")
        page.click(".pop [data-act=assist-about-chat]")
        page.wait_for_selector(".assist-empty")
        check("ассистент: открыт с карточкой и чатом", "Химэ + чат" in page.inner_text(".assist-head"))
        page.click(".starter:has-text('Разбери поведение')")
        try:
            page.wait_for_selector(".aturn.assistant .tools", timeout=10000)
            ok = True
        except Exception:
            ok = False
        check("ассистент: ответ с разметкой", ok)
        md_txt = page.inner_text(".aturn.assistant .md") if ok else ""
        check("ассистент: модель видит карточку и чат", "карточка: да, чат: да" in md_txt)
        if "карточка: да, чат: да" not in md_txt: print("    md:", repr(md_txt[:300]), page.locator(".aturn").count())
        check("ассистент: списки и блок кода", page.locator(".aturn.assistant .md li").count() == 2 and page.locator(".aturn.assistant .md pre").count() == 1)
        shot(page, "15-assistant.png")
        page.click("[data-act=assist-new]")
        page.wait_for_selector(".assist-empty")
        page.click("[data-act=assist-ctx]")
        page.click(".pop [data-act=assist-pick-card][data-id='']")
        check("ассистент: можно отключить персонажа", "Без персонажа" in page.inner_text(".assist-head"))
        page.fill("#input", "Как написать хорошую карточку?")
        page.keyboard.press("Enter")
        try:
            page.wait_for_function("document.querySelector('.aturn.assistant .md') && document.querySelector('.aturn.assistant .md').innerText.includes('карточка: нет')", timeout=10000)
            check("ассистент: без персонажа карточка не уходит", True)
        except Exception:
            check("ассистент: без персонажа карточка не уходит", False)
        page.click("[data-act=assist-list]")
        check("ассистент: список разговоров", page.locator(".pop [data-act=assist-open]").count() == 2)
        page.keyboard.press("Escape")
        page.click("[data-act=assist-regen]")
        page.wait_for_timeout(800)
        check("ассистент: «Другой ответ» заменяет ответ", page.locator(".aturn.assistant").count() == 1)
        page.reload()
        page.wait_for_selector(".assist-head")
        check("ассистент: после перезагрузки открыт тот же разговор", page.locator(".aturn").count() == 2)
        page.click(".rail-chat")
        page.wait_for_selector(".chat-head .head-card")

        # Экспорт карточки
        page.click("[data-act=chat-menu]")
        page.click(".pop [data-act=edit-card]")
        page.click("[data-act=card-section][data-section=meta]")
        with page.expect_download() as dl:
            page.click("[data-act=card-png]")
        png = open(dl.value.path(), "rb").read()
        check("экспорт PNG", png[:8] == b"\x89PNG\r\n\x1a\n")
        check("экспорт: LoRA едут внутри карточки", png_card_lora(png) == "Orihime_IL")
        page.click("[data-act=modal-close]")

        # Миграция старого опыта: без надёжного чата — в карантин, не угадываем (PRISM1-6/7/24)
        page.evaluate("""async () => {
          const S = window.PRP.app.S;
          await window.PRP.store.put('experience', { id: 'legacy1', owner: S.cardId, event: 'Старое событие без чата', interpretation: '', consequences: '', domains: [], about: ['user'], valence: 0, weight: 3, status: 'active', createdAt: 1, source: { messageIds: [] } });
        }""")
        page.reload()
        page.wait_for_selector(".chat-head")
        if not page.locator(".drawer.open").count(): page.click("[data-act=drawer]")
        page.click("[data-act=tab][data-tab=memory]")
        check("миграция: непривязанная запись в отдельном разделе", wait_text(page, "#drawer-body", "Без привязки к чату"))
        page.click("[data-act=tab][data-tab=prism]")
        check("миграция: непривязанная не идёт в модель", "Старое событие без чата" not in page.inner_text(".code") and "Без привязки" in page.inner_text("#drawer-body"))
        exp_all = page.evaluate("window.PRP.store.all('experience')")
        check("PRISM1-24: опыт пишется только вручную (2 записи: своя и внесённая)", len(exp_all) == 2 and any(r.get("legacyUnscoped") for r in exp_all))
        page.click("[data-act=tab][data-tab=memory]")
        page.once("dialog", lambda d: d.accept())
        page.click("[data-act=exp-assign][data-id=legacy1]")
        try:
            page.wait_for_selector(".legacy-block", state="detached", timeout=8000)
            assigned = "Старое событие без чата" in page.inner_text("#drawer-body")
        except Exception:
            assigned = False
        check("миграция: ручная привязка к чату", assigned)
        page.click("[data-act=tab][data-tab=scene]")

        # OVERFLOW: заведомо непомещающийся контекст не меняет дерево и не уходит в модель (new / regen / continue)
        if not page.locator(".drawer.open").count(): page.click("[data-act=drawer]")
        page.click("[data-act=tab][data-tab=scene]")
        page.fill("[data-sc-top=loc]", "Огромное место " + "очень длинное описание места " * 120)
        page.dispatch_event("[data-sc-top=loc]", "change")
        page.wait_for_timeout(300)
        res = page.evaluate("""async () => {
          const A = window.PRP.app, S = A.S, DB = window.PRP.store;
          const chatNow = () => S.chats.find((c) => c.id === S.chatId);
          const snap = async () => JSON.stringify({
            mem: S.messages.map((m) => JSON.stringify(m)).sort(),
            db: (await DB.byIndex('messages', 'chatId', S.chatId)).map((m) => JSON.stringify(m)).sort(),
            leaf: chatNow().leafId, leafDb: (await DB.get('chats', S.chatId)).leafId,
          });
          const count = async () => (await (await fetch('http://127.0.0.1:8766/count')).json()).chat;
          // последний ответ модели на активном пути
          let m = S.messages.find((x) => x.id === chatNow().leafId);
          while (m && m.role !== 'assistant') m = S.messages.find((x) => x.id === m.parentId);
          const keep = { ctx: S.settings.contextTokens, auto: S.settings.autoContext, mt: S.settings.sampler.max_tokens };
          S.settings.contextTokens = 600; S.settings.autoContext = false; S.settings.sampler.max_tokens = 300;
          const before = await snap(), c0 = await count();
          const out = {};
          for (const mode of ['new', 'regen', 'continue']) {
            await A.generate(mode === 'new' ? undefined : m.id, mode);
            out[mode] = { same: (await snap()) === before, overflow: !!(S.lastPrism && S.lastPrism.report.overflow), gen: !!S.gen };
          }
          out.calls = (await count()) - c0;
          Object.assign(S.settings, { contextTokens: keep.ctx, autoContext: keep.auto }); S.settings.sampler.max_tokens = keep.mt;
          return out;
        }""")
        for mode in ["new", "regen", "continue"]:
            check(f"OVERFLOW {mode}: дерево не изменилось, отчёт Prism показывает переполнение", res[mode]["same"] and res[mode]["overflow"] and not res[mode]["gen"])
        check("OVERFLOW: модель не вызывалась", res["calls"] == 0)
        check("OVERFLOW: ошибка показана вне истории", "не помещается" in page.inner_text("#toast") and "не помещается" not in page.inner_text("#feed"))
        check("OVERFLOW: открыта вкладка Prism с переполнением", "Не помещается" in page.inner_text("#drawer-body"))
        page.click("[data-act=tab][data-tab=scene]")
        page.fill("[data-sc-top=loc]", "Кафе, терраса")
        page.dispatch_event("[data-sc-top=loc]", "change")
        page.wait_for_timeout(300)

        # Мобильная ширина
        page.set_viewport_size({"width": 390, "height": 820})
        page.wait_for_timeout(400)
        if page.locator(".drawer.open").count():
            page.click("[data-act=drawer-close]")
            page.wait_for_timeout(350)
        check("мобильная ширина без горизонтальной прокрутки", page.evaluate("document.documentElement.scrollWidth <= 390"))
        shot(page, "09-mobile-chat.png")
        page.click("[data-act=drawer]")
        shot(page, "10-mobile-drawer.png")
        page.click("[data-act=drawer-close]")
        page.click("[data-act=rail]")
        page.click(".rail [data-act=home] >> nth=0")
        shot(page, "11-mobile-home.png")

        # FOUNDATION-A: импорт → проверка → подтверждение; ошибки; карантин указаний
        page.set_viewport_size({"width": 1440, "height": 900})
        page.wait_for_timeout(300)
        page.wait_for_selector(".home")
        fx = os.path.join(OUT, "fa")
        os.makedirs(fx, exist_ok=True)
        def fx_file(name, text):
            pth = os.path.join(fx, name)
            with open(pth, "w", encoding="utf-8") as f: f.write(text)
            return pth
        unknown = fx_file("unknown.json", json.dumps({"foo": 1, "bar": [1, 2]}))
        broken = fx_file("broken.json", "{ \"spec\": \"chara_card_v2\", ")
        dircard = fx_file("directive.json", json.dumps({"spec": "chara_card_v2", "spec_version": "2.0", "data": {
            "name": "Директа", "description": "Проверка указаний.", "personality": "", "scenario": "", "first_mes": "Здравствуй.", "mes_example": "",
            "system_prompt": "E2E-SYS-MARK", "post_history_instructions": "E2E-POST-MARK", "alternate_greetings": [], "tags": [], "extensions": {}}}, ensure_ascii=False))
        urv = os.path.join(ROOT, "tests/fixtures/urv-orihime.json")
        tiles0 = page.locator(".tile").count()
        page.set_input_files("#file-card", [unknown, broken])
        page.wait_for_selector(".imp-modal")
        rv = page.inner_text(".imp-modal")
        check("FA: неизвестный и битый файл — ошибки на проверке", page.locator(".imp-item.bad").count() == 2 and "Формат не распознан" in rv and "корректным JSON" in rv)
        check("FA: импортировать нечего — кнопка выключена", page.is_disabled("[data-act=import-confirm]"))
        page.click(".modal-foot [data-act=import-cancel]")
        page.wait_for_selector(".imp-modal", state="detached")
        page.reload()
        page.wait_for_selector(".home")
        check("FA: после ошибок карточка не создана (и после перезагрузки)", page.locator(".tile").count() == tiles0 and "Без имени" not in page.inner_text(".gallery"))

        page.set_input_files("#file-card", urv)
        page.wait_for_selector(".imp-modal")
        rv = page.inner_text(".imp-modal")
        check("FA: URV — формат, поля, собранный промпт не включается", "URV v2" in rv and "Собранный промпт" in rv and "userOverride" in rv)
        check("FA: URV — указания выключены по умолчанию", page.locator("[data-imp-dir]").count() == 2 and not any(page.is_checked(f"[data-imp-dir='0'][data-k={k}]") for k in ["system", "postHistory"]))
        page.click("[data-act=import-cancel] >> nth=-1")
        page.wait_for_selector(".imp-modal", state="detached")
        check("FA: отмена — ничего не сохранено", page.locator(".tile").count() == tiles0)
        page.set_input_files("#file-card", urv)
        page.wait_for_selector(".imp-modal")
        page.click("[data-act=import-confirm]")
        page.wait_for_selector(".imp-modal", state="detached")
        check("FA: URV импортирован", page.locator(".tile").count() == tiles0 + 1)
        page.locator(".tile", has_text="Орихимэ").locator(".tile-edit").click()
        page.wait_for_selector(".modal")
        check("FA: редактор — внешность и прошлое отдельными полями", page.input_value("#cf-app").strip() != "" and page.input_value("#cf-bg").strip() != "")
        page.click("[data-act=card-section][data-section=prompts]")
        check("FA: редактор — импортированное указание с пометкой и выключено", "из файла" in page.inner_text(".modal-body") and not page.is_checked("[data-cf-dir=system][type=checkbox]"))
        page.click("[data-act=card-section][data-section=meta]")
        check("FA: редактор — сведения об исходнике", "URV v2" in page.inner_text(".modal-body"))
        page.click("[data-act=card-save]")
        page.wait_for_selector(".modal", state="detached")
        page.locator(".tile", has_text="Орихимэ").locator(".tile-edit").click()
        page.wait_for_selector(".modal")
        page.click("[data-act=card-section][data-section=prompts]")
        check("FA: сохранение в редакторе не включает импортированное", not page.is_checked("[data-cf-dir=system][type=checkbox]") and not page.is_checked("[data-cf-dir=postHistory][type=checkbox]"))
        page.click("[data-act=modal-close]")
        page.wait_for_selector(".modal", state="detached")

        page.set_input_files("#file-card", dircard)
        page.wait_for_selector(".imp-modal")
        page.click("[data-act=import-confirm]")
        page.wait_for_selector(".imp-modal", state="detached")
        page.locator(".tile", has_text="Директа").locator(".tile-body").click()
        page.wait_for_selector(".turn.assistant")
        n0 = json.load(urllib.request.urlopen("http://127.0.0.1:8766/v1/count"))["chat"]
        page.fill("#input", "Проверка.")
        page.keyboard.press("Enter")
        page.wait_for_function("document.querySelectorAll('.turn').length === 3")
        idle(page)
        req = json.load(urllib.request.urlopen("http://127.0.0.1:8766/v1/last"))
        body = json.dumps(req, ensure_ascii=False)
        check("FA: выключенное указание не уходит в модель", json.load(urllib.request.urlopen("http://127.0.0.1:8766/v1/count"))["chat"] == n0 + 1 and "E2E-SYS-MARK" not in body and "E2E-POST-MARK" not in body and "Проверка указаний" in body)
        page.click("[data-act=rail]") if page.locator("[data-act=rail]").is_visible() else None
        page.click("[data-act=home] >> nth=0")
        page.wait_for_selector(".home")
        page.locator(".tile", has_text="Директа").locator(".tile-edit").click()
        page.wait_for_selector(".modal")
        page.click("[data-act=card-section][data-section=prompts]")
        page.check("[data-cf-dir=system][type=checkbox]")
        page.click("[data-act=card-save]")
        page.wait_for_selector(".modal", state="detached")
        page.locator(".tile", has_text="Директа").locator(".tile-body").click()
        page.wait_for_selector("#input")
        turns = page.locator(".turn").count()
        page.fill("#input", "Ещё раз.")
        page.keyboard.press("Enter")
        page.wait_for_function(f"document.querySelectorAll('.turn').length >= {turns + 2}")
        idle(page)
        body = json.dumps(json.load(urllib.request.urlopen("http://127.0.0.1:8766/v1/last")), ensure_ascii=False)
        check("FA: включённое указание уходит в модель, выключенное — нет", "E2E-SYS-MARK" in body and "E2E-POST-MARK" not in body)
        shot(page, "12-foundation-a.png")

        check("нет ошибок JS (standalone)", not errors)
        if errors: print("   ", errors[:5])

        # Сборка для Perchance с заглушкой плагина
        p2 = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
        errors2 = []
        p2.on("pageerror", lambda e: errors2.append(str(e)))
        src = open(os.path.join(ROOT, "dist/perchance/html.html"), encoding="utf-8").read()
        with open(os.path.join(ROOT, "dist/perchance/_test.html"), "w", encoding="utf-8") as f:
            f.write("<!doctype html><html><head><meta charset='utf-8'><script>" + AI_STUB + "</script></head><body>" + src + "</body></html>")
        p2.goto("http://127.0.0.1:8765/perchance/_test.html")
        p2.wait_for_selector(".home")
        p2.set_input_files("#file-card", CARD)
        p2.click("[data-act=import-confirm]")
        p2.wait_for_selector(".tile")
        p2.click(".tile")
        p2.wait_for_selector(".turn.assistant")
        check("Perchance: выбран по умолчанию", "Perchance" in p2.inner_text(".composer"))
        p2.fill("#input", "Как дела?")
        p2.keyboard.press("Enter")
        p2.wait_for_function("document.querySelectorAll('.turn').length === 3")
        idle(p2)
        t2 = p2.inner_text("#feed")
        check("Perchance: стриминг ответа", "Привет из Perchance!" in t2 and "[scene:" not in t2)
        call = p2.evaluate("window.__aiCalls[0]")
        check("Perchance: инструкция содержит Prism и историю", "не диктуют поступки" in call["instruction"] and "Пользователь: Как дела?" in call["instruction"])
        p2.click(".turn.last [data-act=continue]")
        p2.wait_for_timeout(200)
        idle(p2)
        call = p2.evaluate("window.__aiCalls[1]")
        check("Perchance: продолжение через startWith", call["startWith"].startswith("Химэ: Привет из Perchance!"))
        p2.click(".turn.last [data-act=draw]")
        try:
            p2.wait_for_selector(".turn.last .shot img", timeout=15000)
            check("Perchance: рисование через image()", True)
        except Exception:
            check("Perchance: рисование через image()", False)
        ic = p2.evaluate("window.__imgCalls[0]")
        check("Perchance: разрешение и без LoRA", ic["resolution"] == "768x768" and "<lora:" not in ic["prompt"])
        p2.click("[data-act=open-prism]")
        check("Perchance: контекст из плагина", wait_text(p2, "#drawer-body", "из 5300"))
        check("нет ошибок JS (perchance)", not errors2)
        if errors2: print("   ", errors2[:5])
        os.remove(os.path.join(ROOT, "dist/perchance/_test.html"))
        b.close()
finally:
    static.terminate(); mock.terminate()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)} из {len(results)} проверок пройдено")
sys.exit(1 if failed else 0)
