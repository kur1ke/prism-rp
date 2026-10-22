# PRISM-RP: semantic card format and conversion map (candidate)

**Status:** Candidate for `testing`. No migration of existing RP stories, no changes to `main`.

## Design principles

1. Canonical, typed, stable fields mean the same thing independent of origin: `description` (who/what), `appearance` (physical look), `personality` (traits), `background` (history), `scenario` (starting circumstances), `firstMes`, `mesExample`, `lore`, `directives`, `image`, `customFields`.
2. Never silently promote an imported source/extension, author note or custom field into instructions. Imported custom fields are disabled, including always-on entries. Unknown source fields are retained as evidence, not executed.
3. Default exported field shape is stable and includes blank declared Prism slots (`extensions.prism_rp.fields`, `image`, `customFields`). Keep standard spec field names, types and optional semantics. Avoid app-specific keys at the Character Card `data` root.
4. Preserve original source, origin, unknown entries and exact values where possible. When a target format lacks a field, use a namespaced extension AND a backwards-compatible text representation when safe. A third party may ignore extensions: guarantee Prism round-tripping, not universal interpretation.
5. A separate Markdown guide documents the editor/schema; **never embed a guide or AI instruction inside the exported card**.

## Field correspondence

| Semantics | Prism canonical | Character Card V1/TavernAI/Pygmalion | Character Card V2/V3 | URV v2 |
| --- | --- | --- | --- | --- |
| Name | `name` | `name` / `char_name` | `data.name` | `data.profile.name` / `data.name` |
| Description | `description` | `description` / `char_persona` | `data.description` | `data.description` (+ age/sex facts) |
| Appearance | `appearance` | embedded in description (not separately standardized) | `data.description` labeled paragraph + `data.extensions.prism_rp.fields.appearance` | `data.profile.appearance` |
| Personality | `personality` | `personality` (where available) | `data.personality` | `data.profile.personality` |
| Background | `background` | typically within description | `data.description` labeled paragraph + `data.extensions.prism_rp.fields.background` | `data.profile.background` |
| Scenario | `scenario` | `scenario` / `world_scenario` | `data.scenario` | `data.profile.scenario` |
| Greeting | `firstMes` + `altGreetings` | `first_mes` / `char_greeting` | `data.first_mes` + `alternate_greetings` | `data.firstMessage` |
| Example dialogue | `mesExample` | `mes_example` / `example_dialogue` | `data.mes_example` | `data.exampleDialogue` |
| Lorebook | `lore` | not standardized | `data.character_book.entries` | `data.lorebook` |
| Author instructions | `directives` (explicit review/enable) | not standardized | `data.system_prompt`, `data.post_history_instructions` | `data.profile.systemNote`, `data.reminderMessage`, candidate `data.systemPrompt` |
| Images / LoRA | `image` | not standardized | `data.extensions.prism_rp.image` | `imageTrigger`, `imageLoras`, `outfitTags`, `imageStyleTrigger`, `nsfwTags` |
| Custom data | `customFields` | not standardized | `data.extensions.prism_rp.customFields` | preserve unknown fields, unless a deliberate adapter is added |

**Important:** Character Card V3 does *not* have a standard `appearance` or `background` field. A Prism conversion preserves their semantics via `extensions.prism_rp.fields`; the portable `data.description` necessarily combines them for clients unaware of Prism's extension.

## Compatible text fallback

For cards exported by Prism, paragraph separators exactly mark `Внешность:\n...` and `Прошлое:\n...`. If the extension is missing or became stale after an external edit, the importer may restore the fields from these **explicit** paragraphs. It must not infer a field boundary from prose or unfamiliar headings.

If parsing cannot determine ownership unambiguously, keep the original description, warn in import review, and preserve original source. Prefer a transparent ambiguity to silent relabeling.

## Custom fields authority

- `customFields: [{id,label,text,mode,enabled}]` is typed, with modes `relevant` (default) and `always` (budget permitting).
- Fields are untrusted **card facts**, never author/system instructions; they enter the existing `prism/data` escaped data layer.
- Defaults are disabled on import, and blank/inactive fields never enter the runtime context.
- Selected fields compete with other optional details under the same budget and removal policy.
- Explicit user activation is needed; a visible checkbox reflects real runtime behavior.
- Unknown third-party fields remain preserved, disabled and reported in import review.

## Editor UX and image settings

- Keep existing Card Editor tabs; use collapsible groups, not extra top-level tabs.
- Image tab: expandable Base + LoRA subsections.
- LoRA advanced checkbox genuinely gates advanced tag rules. Disabling does not clear their text.
- Instruction handbook is a separate file for people and AI card editors, not embedded metadata.

## Outstanding compatibility work

- Add explicit export adapters (rather than naming all conversions 'V3') before offering a non-V3 export UI.
- Make ambiguity/warning reporting searchable in the import preview.
- Validate arbitrary foreign cards, unknown extensions, optional V3 assets and nickname without silently dropping data.
- Improve typed labels and field validation before promoting to `main`.
- Test JSON and PNG roundtrip, backup restore, context budget and Perchance/Forge browser behavior.

References:
- Upstream V2: https://github.com/malfoyslastname/character-card-spec-v2
- Upstream V3: https://github.com/kwaroran/character-card-spec-v3
- Prism architecture: `ARCHITECTURE.md`
