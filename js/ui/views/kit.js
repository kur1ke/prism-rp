/* Prism RP — общие части представлений: пресеты, темы, повторяющиеся куски разметки.
   Представления — чистые функции «модель (m) → HTML»; действия размечены data-act
   и обрабатываются контроллерами (js/ui/controllers). */
(function (root) {
  "use strict";
  const PRP = (root.PRP = root.PRP || {});
  const R = PRP.render;
  const { esc, icon } = R;

  const SAMPLER_PRESETS = [
    { id: "precise", name: "Точный", hint: "держится карточки, меньше сюрпризов", v: { temperature: 0.7, top_p: 0.9, min_p: 0.08, top_k: 0, repetition_penalty: 1.05 } },
    { id: "balanced", name: "Сбалансированный", hint: "по умолчанию", v: { temperature: 0.9, top_p: 0.95, min_p: 0.05, top_k: 0, repetition_penalty: 1.05 } },
    { id: "lively", name: "Живой", hint: "больше инициативы и неожиданностей", v: { temperature: 1.1, top_p: 0.98, min_p: 0.03, top_k: 0, repetition_penalty: 1.08 } },
  ];
  const THEMES = [
    { id: "dusk", name: "Сумерки", c: ["#15131d", "#252233", "#b79cff", "#ff9ec7"] },
    { id: "dawn", name: "Рассвет", c: ["#f1eef7", "#ffffff", "#6b4edb", "#e05596"] },
    { id: "paper", name: "Бумага", c: ["#efe8dc", "#f8f3ea", "#7a4d9e", "#c98a2a"] },
  ];
  const WEATHER = ["ясно", "облачно", "пасмурно", "дождь", "ливень", "снег", "туман", "гроза", "жара", "мороз", "ветрено"];

  function loraRows(act, list) {
    return `<div class="lora-rows">${list.map((l, i) => `<div class="row lora-row"><input class="input" data-${act}-name="${i}" list="dl-loras" value="${esc(l.name)}" placeholder="имя LoRA" style="flex:3">
      <input class="input" type="number" step="0.05" data-${act}-w="${i}" value="${esc(String(l.weight))}" style="flex:1;max-width:90px">
      <button class="icon-btn" data-act="${act}-del" data-i="${i}" title="Убрать">${icon("x")}</button></div>`).join("")}
      <button class="btn btn-sm" data-act="${act}-add">${icon("plus")}LoRA</button></div>`;
  }

  PRP.viewKit = { SAMPLER_PRESETS, THEMES, WEATHER, loraRows };
  Object.assign((PRP.views = PRP.views || {}), { SAMPLER_PRESETS, THEMES });
})(typeof window !== "undefined" ? window : globalThis);
