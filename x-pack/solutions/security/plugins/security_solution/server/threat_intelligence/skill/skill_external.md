Orchestration skill for **Cursor**, **Claude Code**, or any HTTP client connected to
**Kibana Security Solution**. Execution is always server-side in Kibana; this file is instructions only.

**Cursor:** skill path `.agents/skills/threat-intelligence-external/SKILL.md` at the Kibana repo root (symlink to this plugin). See `common/threat_intelligence/skill/README.md`.

**Canonical markdown:** `common/threat_intelligence/skill/skill_common.md` + this file.
**Sync Cursor skill:** `yarn --cwd x-pack/solutions/security/plugins/security_solution sync:threat-intel-external-skill`

## Prerequisites

| Requirement | Notes |
| --- | --- |
| Running Kibana | `threatIntelligenceSkillEnabled` on `xpack.securitySolution.enableExperimental` |
| Auth | API key or session with `threatIntelligence_read`; `threatIntelligence_write_subscriptions` for ingest/subscriptions |
| Space | Requests are space-scoped (default space unless user specifies another) |
| GenAI connector | Required for `hunt_behavior`, `synthesize_advisory`, `generalize_from_telemetry`; routes return **503** or `no_inference` without it |

## HTTP calling convention

Every route below is **`POST`**, **`access: public`**, API version **`2023-10-31`**.

```bash
curl -sS -X POST "$KIBANA_URL/api/threat_intelligence/search_reports" \
  -H "Authorization: ApiKey $API_KEY" \
  -H "Content-Type: application/json" \
  -H "kbn-xsrf: true" \
  -H "elastic-api-version: 2023-10-31" \
  -d '{"query":"ransomware","time_range":{"from":"now-7d","to":"now"},"sort_by":"rank","size":10}'
```

Use the project's `kibana_curl` helper when available (see repo `scripts/kibana_api_common.sh`).

**Do not** send `x-elastic-internal-origin` — these are public routes.

## Response enrichment: `ui_hints`

Supported routes (`search_reports`, `coverage_gap`, `hunt_behavior`, `generalize_from_telemetry`) return:

```json
{
  "total": 10,
  "reports": [],
  "ui_hints": [{ "type": "threat-intel-report-table", "payload": { "reports": [] } }]
}
```

| Field | Purpose |
| --- | --- |
| `ui_hints[]` | Typed payloads mirroring Agent Builder attachment types (`common/threat_intelligence/hub/attachment_payloads.ts`). Use as the data source for Canvas, HTML, or markdown fallbacks. |

**`threat-intel-report-table` layout:** a **card grid** (not a flat table) — filter chips for severity/category counts, then a two-column grid of report cards with severity accent, category pills, source, and techniques. Match in-product `ThreatReportFeed` when rendering externally.

**Rendering priority (by host):**

| Host | Priority |
| --- | --- |
| **Kibana Agent Builder** | `<render_attachment>` from tool `renderTag` |
| **Cursor** | **Cursor Canvas** (`.canvas.tsx` beside chat — see **Cursor Canvas digest** below) |
| **Claude.ai** | `show_widget` HTML digest (inline preview panel — see **HTML digest widget**) |
| **Claude Code** | Standalone `.html` file in the working directory |
| **All** | Legacy `attachment_hints[]` on hunt/coverage when `ui_hints` absent |

**Do not** default to a markdown table when the host can render a card grid (Canvas, `show_widget`, or HTML file).

## REST API quick reference

Base: `/api/threat_intelligence`

| Action | Path suffix | Privilege | Notes |
| --- | --- | --- | --- |
| Search reports | `/search_reports` | read | `ui_hints[]` (report table when results) |
| Ingest paste | `/ingest_report` | write_subscriptions | |
| Hunt behavior | `/hunt_behavior` | read | `ui_hints[]` (finding cards) |
| Hunt environment | `/hunt_for_threat` | read | `report_id` or `iocs`/`techniques` |
| Orchestrated hunt | `/hunt_orchestrated` | read | Tier 1 + Tier 2 |
| Advisory synthesis | `/synthesize_advisory` | read | |
| Coverage gap | `/coverage_gap` | read | `ui_hints[]` (MITRE heatmap) |
| Generalize alerts | `/generalize_from_telemetry` | write_subscriptions | `ui_hints[]` (finding cards) |
| Extract IOCs | `/extract_iocs` | read | No LLM |
| Analyse environment | `/analyse_environment` | read | |
| Submit subscription | `/subscriptions/submit` | write_subscriptions | |
| List subscriptions | `/subscriptions/list` | read | |
| Delete subscription | `/subscriptions/delete` | write_subscriptions | |

**Categories** (optional filter): `ransomware`, `phishing`, `malware`, `data-breach`, `vulnerability`, `nation-state`, `supply-chain`, `insider-threat`, …

**Severity** (optional `min_severity`): `low`, `medium`, `high`, `critical`

**Sort:** `relevance` (default hybrid RRF), `rank` (digest), `severity`, `recency`

## Output rules (external — no Kibana Canvas)

There is **no** Agent Builder `<render_attachment>` runtime in Cursor or Claude Code.

- **Never** emit `<render_attachment ... />` or call `attachments.add` from Cursor / Claude Code.
- Prefer **`ui_hints`** (or top-level `reports[]` for digests) as the data source; render via **Cursor Canvas** (Cursor), **`show_widget` HTML** (Claude.ai), or **HTML file** (Claude Code) — not a flat markdown table.
- **Never** use in-product-only subscription confirmation cards; show a markdown summary and POST `subscriptions/submit` only after the user confirms parameters.

### `ui_hints` type → render target

| `ui_hints[].type` | Render as |
| --- | --- |
| `threat-intel-report-table` | **Cursor:** Canvas digest (below). **Claude.ai:** HTML `show_widget`. **Claude Code:** `.html` file. Map `payload.reports[]` into report rows. |
| `threat-intel-mitre-heatmap` | HTML table or prose with coverage column when `mode: "coverage"` |
| `threat-intel-finding-card` | Finding template (below) |
| `threat-intel-severity-timeline` | Bullet list by severity bucket |
| `threat-intel-subscription-confirmation` | Parameter summary + confirm before `subscriptions/submit` |

### Kibana iframe parity (optional)

To show **native** EUI renderers without reimplementing them:

1. Run the flow in **Kibana Agent Builder chat** (skill loads attachments + Canvas).
2. Or `POST /api/agent_builder/conversations/{id}/attachments` then open Kibana with that conversation.
3. List attachments: `GET /api/agent_builder/conversations/{conversation_id}/attachments`

### Cursor Canvas digest (MANDATORY for Cursor — inline beside chat)

Cursor does **not** support Claude's `show_widget` or Kibana's `<render_attachment>`. For digest parity with Claude's inline preview panel, render digests as a **Cursor Canvas** — a `.canvas.tsx` file the user opens **beside the chat** (same intent as Claude's Launch preview).

**Read** `~/.cursor/skills-cursor/canvas/SKILL.md` for Canvas rules (location, `cursor/canvas` imports only, `useHostTheme()`, no `fetch`, default export).

**After `search_reports` with `total > 0`:**

1. **Always** write **`~/.cursor/projects/<workspace>/canvases/threat-intel-digest-report-feed.canvas.tsx`** (fixed filename — overwrite on every digest). **Do not** vary layout, colors, or chrome by topic; the canvas must mirror in-product `ThreatReportFeed` (see `report_feed/` in Security Solution).
2. Replace **`REPORT_ITEMS`** (and **`TIME_RANGE_LABEL`**) from `ui_hints[0].payload.reports[]` or top-level `reports[]`. Map API fields to `ThreatReportItem`: `report_id` → `reportId`, `source.name` → `sourceName`, `source.url` → `sourceUrl`, `published_at` → `publishedAt`, `extracted.categories` or `categories` → `categories`, `severity` string or `.level`.
3. In chat, add **one short sentence** pointing to the canvas file path (clickable). Example: *"Open the threat intel digest canvas beside chat — filter chips and report cards are there."*
4. Add a **brief executive summary** in chat (2–4 sentences) — do **not** duplicate the full card grid as a markdown table.
5. Optional: call `synthesize_advisory` — put narrative in chat only; **do not** add a separate summary card or change canvas chrome for it.

**Do not** ask permission before writing the canvas. **Do not** use a workspace `.html` file as the primary Cursor deliverable.

**Canvas path:** only `canvases/<name>.canvas.tsx` under the workspace's Cursor project dir (list `~/.cursor/projects/` if the workspace slug is unknown). Subfolders are not detected.

#### Canvas field mapping

| API field | Canvas constant |
| --- | --- |
| `report_id` | `id` |
| `title` | `title` |
| `source.url` | `url` |
| `source.name` | `source` |
| `published_at` (relative, e.g. `21h ago`) | `publishedLabel` |
| `severity` | `severity` (`low` \| `medium` \| `high` \| `critical`) |
| `categories[]` (first 3 keys) | `categories` (e.g. `ransomware`, `supply-chain`) |
| `categories.length - 3` | `extraCategories` |
| `techniques[]` | `techniques` |

Infer `categories` from title keywords when API `categories` is empty. **Styling:** mirror in-product `ThreatReportFeed` — page `#f8f7f4`, title links `#185FA5`, **`4px` left severity bar** (`SEVERITY_HEX` from `report_feed/constants.ts`), category pills from `THREAT_CATEGORY_BADGE_STYLES` in `hub/threat_category_labels.ts` (uppercase), white filter panel with `#e0ddd6` border, severity chips with dot + count, category chips, sort row (Relevance / Date / Severity), `{shown} of {total}`. Use `useCanvasState` for filter/sort. Inline styles only for the light digest shell (do not restyle per query).

#### Canvas template

Reference: **`canvases/threat-intel-digest-report-feed.canvas.tsx`** in the Cursor project dir. Preserve structure and constants; update **`REPORT_ITEMS`** + **`TIME_RANGE_LABEL`** only.

**Layout checklist (must match Agent Builder / Claude HTML digest):**

- Header: `Threat reports` + time range subtitle (not a custom digest title in H1)
- Filter row: `Filter:` label, severity chips with **colored dot** + count, category chips with counts, sort buttons, `{shown} of {total}`
- Cards: white panel, `#e0ddd6` border, **4px left bar = severity hex**, blue title link, meta `source | relative time | severity` (severity uses `SEVERITY_HEX`), uppercase category pills (max 3 + `+N`)
- Grid: 2 columns, gap 12

### HTML digest widget (Claude.ai `show_widget` and Claude Code file)

Render digests as an **interactive HTML card grid** matching the in-product `threat-intel-report-table` attachment (filter chips, two-column cards, severity accent, category pills). Use this template for **Claude.ai** (`show_widget`, inline preview) and **Claude Code** (write `.html` to disk). **Not** the primary path for **Cursor** — use **Cursor Canvas** above.

#### When to use HTML vs Canvas

| Client | Render as |
| --- | --- |
| **Cursor** | **Cursor Canvas** `.canvas.tsx` (beside chat) — not HTML file |
| Claude.ai web / desktop | `show_widget` with HTML below (inline preview panel) |
| Claude Code | `threat-intel-digest-YYYY-MM-DD.html` in working directory |
| Kibana Agent Builder | Native `<render_attachment>` from tool `renderTag` |
| Read-only terminal (no file tools) | Markdown digest (last resort — see **Markdown fallback**) |

**Claude Code HTML artifact — MANDATORY (Claude Code only):** After `search_reports` with `total > 0`, write `threat-intel-digest-YYYY-MM-DD.html`, then print:

```
✓ Digest written → threat-intel-digest-YYYY-MM-DD.html
  Open with: open threat-intel-digest-YYYY-MM-DD.html
```

Map API fields into `REPORTS_DATA` from `ui_hints[0].payload.reports[]` or top-level `reports[]`:

| API field | `REPORTS_DATA` field |
| --- | --- |
| `report_id` | `id` |
| `title` | `title` |
| `source.url` | `url` |
| `source.name` | `source` |
| `published_at` (formatted) | `date` |
| `severity` | `severity` (`low` \| `medium` \| `high` \| `critical`) |
| `categories[]` (first 3 keys, lowercased) | `tags` |
| `categories.length - 3` | `extra` |
| `techniques[]` | `techniques` |

Fill `SUMMARY_DATA` from `synthesize_advisory` when called; otherwise write a 2–4 sentence executive summary and 2–3 recommended actions from the reports.

Use the exact HTML template below, substituting only the `REPORTS_DATA` and `SUMMARY_DATA` JavaScript constants.

#### HTML template (copy verbatim, fill constants only)

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Threat Intel Digest — Ransomware</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8f7f4; color: #1a1a1a; padding: 2rem; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 20px; font-weight: 500; margin-bottom: 4px; }
  .sub { font-size: 13px; color: #666; margin-bottom: 1.5rem; }
  .summary-box { background: #fff; border: 0.5px solid #e0ddd6; border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
  .summary-box h2 { font-size: 15px; font-weight: 500; margin-bottom: 8px; }
  .summary-box p { font-size: 14px; line-height: 1.7; color: #333; margin-bottom: 10px; }
  .actions { list-style: none; padding: 0; }
  .actions li { font-size: 13px; color: #444; padding: 3px 0 3px 18px; position: relative; }
  .actions li::before { content: "→"; position: absolute; left: 0; color: #BA7517; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
  .filter-label { font-size: 12px; color: #888; }
  .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 999px; border: 0.5px solid #ccc; cursor: pointer; background: #fff; color: #555; transition: background 0.12s; }
  .chip.active { background: #f0ece4; color: #1a1a1a; border-color: #999; }
  .chip .dot { width: 7px; height: 7px; border-radius: 50%; background: #EF9F27; display: inline-block; }
  .sort-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .sort-btns { display: flex; gap: 4px; }
  .sort-btn { font-size: 12px; padding: 4px 10px; border-radius: 8px; border: 0.5px solid #ddd; background: transparent; color: #666; cursor: pointer; }
  .sort-btn.active { background: #f0ece4; color: #1a1a1a; border-color: #aaa; font-weight: 500; }
  .count { font-size: 12px; color: #888; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 12px; }
  .card { background: #fff; border: 0.5px solid #e0ddd6; border-left: 3px solid #EF9F27; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
  .card:hover { border-color: #bbb; border-left-color: #BA7517; }
  .card-title { font-size: 14px; font-weight: 500; color: #185FA5; line-height: 1.4; text-decoration: none; display: block; }
  .card-title:hover { text-decoration: underline; }
  .card-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #777; flex-wrap: wrap; }
  .sev { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px; }
  .sev-medium { background: #FAEEDA; color: #633806; }
  .sev-high { background: #FCEBEB; color: #501313; }
  .sev-critical { background: #FCEBEB; color: #501313; }
  .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag { font-size: 11px; font-weight: 500; padding: 2px 7px; border-radius: 4px; }
  .tag-ransomware { background:#FAEEDA; color:#854F0B; }
  .tag-phishing { background:#E6F1FB; color:#185FA5; }
  .tag-malware { background:#FCEBEB; color:#A32D2D; }
  .tag-cybercrime { background:#EEEDFE; color:#3C3489; }
  .tag-supply { background:#EAF3DE; color:#3B6D11; }
  .tag-cloud { background:#E1F5EE; color:#0F6E56; }
  .tag-apt { background:#FBEAF0; color:#72243E; }
  .tag-vuln { background:#F1EFE8; color:#5F5E5A; }
  .tag-databreach { background:#E6F1FB; color:#0C447C; }
  .tag-more { background:#f0ece4; color:#666; }
  .techs { display: flex; flex-wrap: wrap; gap: 4px; }
  .tech { font-size: 10px; font-family: monospace; padding: 2px 6px; border-radius: 4px; background: #f0ece4; color: #555; }
  .card-footer { display: flex; gap: 8px; margin-top: 4px; padding-top: 8px; border-top: 0.5px solid #eee; }
  .btn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 5px 10px; border-radius: 8px; border: 0.5px solid #ccc; background: transparent; color: #1a1a1a; cursor: pointer; flex: 1; justify-content: center; text-decoration: none; transition: background 0.12s; }
  .btn:hover { background: #f5f3ee; }
  .btn-primary { background: #E6F1FB; color: #185FA5; border-color: #b5d4f4; }
  .btn-primary:hover { background: #d0e6f7; }
</style>
</head>
<body>
<div class="container">
  <h1>Threat reports</h1>
  <p class="sub" id="time-range">Last 7 days</p>

  <div class="summary-box" id="summary-box"></div>

  <div class="filters" id="filters">
    <span class="filter-label">Filter:</span>
  </div>

  <div class="sort-bar">
    <div class="sort-btns">
      <button class="sort-btn active" onclick="setSort('relevance',this)">Relevance</button>
      <button class="sort-btn" onclick="setSort('date',this)">Date</button>
      <button class="sort-btn" onclick="setSort('severity',this)">Severity</button>
    </div>
    <span class="count" id="count-label"></span>
  </div>

  <div class="grid" id="grid"></div>
</div>

<script>
// ─── FILL THESE TWO CONSTANTS FROM API RESPONSES ──────────────────────────────

const SUMMARY_DATA = {
  title: "REPLACE WITH synthesize_advisory headline",
  narrative: "REPLACE WITH synthesize_advisory narrative (2-3 sentences).",
  actions: [
    "REPLACE with recommended action 1",
    "REPLACE with recommended action 2",
  ]
};

const REPORTS_DATA = [
  // One object per report from search_reports response. Example shape:
  // {
  //   id: "rpt-001",
  //   title: "Report title here",
  //   url: "https://source.example.com/report",
  //   source: "Source Name",
  //   date: "May 18, 2026",
  //   severity: "medium",
  //   tags: ["ransomware","phishing","malware"],
  //   extra: 2,
  //   techniques: ["T1486","T1566"],
  // },
];

// ─── END OF FILL ZONE — do not edit below ─────────────────────────────────────

const TAG_MAP = {
  ransomware:  { cls:"tag-ransomware",  label:"RANSOMWARE" },
  phishing:    { cls:"tag-phishing",    label:"PHISHING" },
  malware:     { cls:"tag-malware",     label:"MALWARE" },
  cybercrime:  { cls:"tag-cybercrime",  label:"CYBERCRIME" },
  supply:      { cls:"tag-supply",      label:"SUPPLY CHAIN" },
  cloud:       { cls:"tag-cloud",       label:"CLOUD SECURITY" },
  apt:         { cls:"tag-apt",         label:"APT" },
  vuln:        { cls:"tag-vuln",        label:"VULNERABILITY" },
  databreach:  { cls:"tag-databreach",  label:"DATA BREACH" },
};

const sb = document.getElementById("summary-box");
sb.innerHTML = `<h2>${SUMMARY_DATA.title}</h2><p>${SUMMARY_DATA.narrative}</p>`
  + (SUMMARY_DATA.actions.length ? `<ul class="actions">${SUMMARY_DATA.actions.map(a=>`<li>${a}</li>`).join("")}</ul>` : "");

const tagCounts = {};
REPORTS_DATA.forEach(r => r.tags.forEach(t => { tagCounts[t] = (tagCounts[t]||0)+1; }));
const filtersEl = document.getElementById("filters");
const allChip = document.createElement("span");
allChip.className = "chip active"; allChip.dataset.cat = "all";
allChip.innerHTML = `<span class="dot"></span>All (${REPORTS_DATA.length})`;
filtersEl.appendChild(allChip);
Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).forEach(([tag, count]) => {
  const c = document.createElement("span");
  c.className = "chip"; c.dataset.cat = tag;
  c.textContent = `${TAG_MAP[tag]?.label || tag} (${count})`;
  filtersEl.appendChild(c);
});
filtersEl.querySelectorAll(".chip").forEach(ch => ch.addEventListener("click", () => {
  filtersEl.querySelectorAll(".chip").forEach(c=>c.classList.remove("active"));
  ch.classList.add("active");
  renderCards(ch.dataset.cat);
}));

let currentSort = "relevance";
function setSort(s, btn) {
  currentSort = s;
  document.querySelectorAll(".sort-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  const active = filtersEl.querySelector(".chip.active");
  renderCards(active ? active.dataset.cat : "all");
}

function renderCards(cat) {
  let list = cat === "all" ? [...REPORTS_DATA] : REPORTS_DATA.filter(r=>r.tags.includes(cat));
  if (currentSort === "severity") list.sort((a,b)=>["critical","high","medium"].indexOf(a.severity)-["critical","high","medium"].indexOf(b.severity));
  else if (currentSort === "date") list.sort((a,b)=>new Date(b.date)-new Date(a.date));
  document.getElementById("count-label").textContent = `${list.length} of ${REPORTS_DATA.length}`;
  document.getElementById("grid").innerHTML = list.map(r => {
    const tagPills = r.tags.slice(0,3).map(t=>`<span class="tag ${TAG_MAP[t]?.cls||'tag-more'}">${TAG_MAP[t]?.label||t.toUpperCase()}</span>`).join("");
    const extra = r.extra > 0 ? `<span class="tag tag-more">+${r.extra}</span>` : "";
    const techs = (r.techniques||[]).map(t=>`<span class="tech">${t}</span>`).join("");
    const huntMsg = `Run hunt_orchestrated for report "${r.title}" (id: ${r.id}) — techniques: ${(r.techniques||[]).join(", ")}. Check my environment for hits and propose behavioral detection rules.`;
    const covMsg  = `Check detection coverage gap for report "${r.title}" (id: ${r.id}) — techniques: ${(r.techniques||[]).join(", ")}. Show covered, enable-existing, and create-rule items.`;
    return `<div class="card">
      <a class="card-title" href="${r.url||'#'}" target="_blank">${r.title}</a>
      <div class="card-meta">
        <i class="ti ti-news" style="font-size:14px"></i><span>${r.source}</span>
        <i class="ti ti-clock" style="font-size:13px"></i><span>${r.date}</span>
        <span class="sev sev-${r.severity}">${r.severity.charAt(0).toUpperCase()+r.severity.slice(1)}</span>
      </div>
      <div class="tags">${tagPills}${extra}</div>
      ${techs ? `<div class="techs">${techs}</div>` : ""}
      <div class="card-footer">
        <button class="btn btn-primary" onclick='navigator.clipboard.writeText(${JSON.stringify(huntMsg)}).then(()=>this.textContent="✓ Copied")'>
          <i class="ti ti-radar" style="font-size:13px"></i> Hunt in my env
        </button>
        <button class="btn" onclick='navigator.clipboard.writeText(${JSON.stringify(covMsg)}).then(()=>this.textContent="✓ Copied")'>
          <i class="ti ti-shield-check" style="font-size:13px"></i> Coverage gap
        </button>
      </div>
    </div>`;
  }).join("");
}
renderCards("all");
</script>
</body>
</html>
```

> **Hunt buttons:** In the HTML file, buttons copy a follow-up prompt to the clipboard (user pastes into Cursor / Claude to execute `hunt_orchestrated` or `coverage_gap`).

#### Markdown fallback (read-only — last resort only)

Only when neither Canvas (Cursor), `show_widget` / HTML file (Claude), nor file write is possible. If Cursor can write to `canvases/`, **always** prefer the Canvas digest above:

```markdown
## Threat intel digest: {topic} ({time_range})

### Executive summary
{2–4 sentences}

### Recommended actions
- …

### Reports

| Sev | Title | Source | Date | Techniques |
| --- | --- | --- | --- | --- |
| … | … | … | … | … |
```

### Finding template (after `hunt_behavior` / `hunt_orchestrated`)

For each behavior in `behaviors[]` (or each `attachment_hints[]` entry):

```markdown
### {technique_name} ({technique_id})
- **Severity:** {severity} · **Tactics:** {tactics}
- **Evidence:** "{evidence_quote}"
- **Proposed ES|QL rule:**
\`\`\`esql
{proposed_esql_rule}
\`\`\`
```

Use `ui_hints` finding-card payloads when present.

## Orchestration Rules (external)

### For digest queries ("what's new on X this week?")

1. `POST /api/threat_intelligence/search_reports` — `query` = topic, `time_range` last 7d, `sort_by: "rank"`, `size: 10`; optional `categories` on first try only.
2. If `total > 0`: **Cursor** → overwrite **`canvases/threat-intel-digest-report-feed.canvas.tsx`** (fixed layout — see Cursor Canvas digest section); **Claude.ai** → `show_widget` HTML; **Claude Code** → `threat-intel-digest-YYYY-MM-DD.html`. Use `ui_hints[0].payload.reports[]` or top-level `reports[]`. Add brief summary prose in chat only (no markdown card table).
3. Optional: `POST /api/threat_intelligence/synthesize_advisory` for executive lede when `total >= 3`.
4. Optional: high/critical only → `POST /api/threat_intelligence/hunt_behavior` (do not block digest on it).
5. If `total === 0` after retry without categories: offer `ingest_report`, feed setup, or subscription.

### For coverage-gap queries ("what's hot that we don't cover?")

1. `POST /api/threat_intelligence/coverage_gap` with the user's `time_range` / filters.
2. Render `ui_hints` heatmap payload (or legacy `attachment_hint`); table: technique, `coverage_recommendation`, matching rules.
3. Per row:
   - `enable_existing` → recommend enabling `matching_disabled_rule_ids` (no new rule)
   - `create_rule` → `hunt_behavior` then `create_detection_rule` if available
   - `covered` → no action

### For subscriptions ("weekly digest of ransomware")

1. Propose parameters in chat: `tags`, `severity_threshold`, `schedule_rrule`, `delivery` (`email` \| `slack`, `target`, `connector_id`)
2. Ask the user to confirm
3. On confirm: `POST /api/threat_intelligence/subscriptions/submit` with the final payload
4. List/delete: `/api/threat_intelligence/subscriptions/list` / `/api/threat_intelligence/subscriptions/delete`
