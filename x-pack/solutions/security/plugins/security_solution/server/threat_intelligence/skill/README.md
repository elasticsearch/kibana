# Threat intelligence skill markdown

Shared skill content for Agent Builder (in-product) and external agents (Cursor, Claude).

## Files

| File | Role |
| --- | --- |
| `skill_common.md` | When to use, guardrails, detection model, API endpoints, shared orchestration |
| `skill_kibana.md` | Kibana execution, Canvas attachments, digest/coverage/subscription flows |
| `skill_external.md` | REST calling, `ui_hints`, Canvas/HTML fallbacks, external orchestration |

Kibana loads `skill_common.md` + `skill_kibana.md` at runtime via `load_skill_content.ts`.

## Sync (all clients)

After editing `skill_common.md` or `skill_external.md`:

```bash
yarn --cwd x-pack/solutions/security/plugins/security_solution sync:threat-intel-external-skill
```

Do not hand-edit generated `SKILL.md` files.

## Cursor Agents setup

Cursor loads skills from **personal** and **project** paths. Threat intel is not in the Elastic Cursor plugin — deploy it with sync.

### Personal skill (recommended — any workspace)

Sync copies the skill to:

| Path | Scope |
| --- | --- |
| `~/.cursor/skills/threat-intelligence-external/SKILL.md` | All Cursor projects |
| `~/Documents/cursor-skills/threat-intelligence-external/SKILL.md` | Same content, easy to open |

1. Run sync (above).
2. **Developer: Reload Window** (Cmd+Shift+P).
3. Start a **new Agent chat** (existing chats keep the old skill snapshot).
4. Digest answers render as a **Cursor Canvas** (`.canvas.tsx` in `~/.cursor/projects/<workspace>/canvases/`) — opens **beside chat** like Claude's inline preview panel, not a markdown table or workspace HTML file.
5. Confirm `syncedAt` in the skill frontmatter and `elastic-api-version: 2023-10-31` in the HTTP calling convention section.
6. Set Kibana env:

   ```bash
   export KIBANA_URL=http://localhost:5601
   export KIBANA_AUTH=elastic:changeme
   ```

   See repo skill `.agents/skills/kibana-api` for `kibana_curl`.

### Project skill (Kibana repo only)

When the workspace is the **Kibana repo root**, sync also maintains symlinks:

- `.agents/skills/threat-intelligence-external/`
- `.cursor/skills/threat-intelligence-external/`

Recreate symlinks if missing:

```bash
ln -sfn ../../x-pack/solutions/security/plugins/security_solution/.agents/skills/threat-intelligence-external \
  .agents/skills/threat-intelligence-external
```

External agents call Kibana via **public REST** (`POST /api/threat_intelligence/*`, `elastic-api-version: 2023-10-31`). See `skill_external.md` for curl conventions and rendering rules.

## Claude Desktop setup (Customize → Skills)

Claude Desktop does **not** read `~/.claude/skills/`. Upload manually:

1. Run sync (builds a ZIP).
2. **Customize → Skills → +** (Personal skills).
3. Upload `~/Documents/claude-skills/threat-intelligence-external.zip`
4. Enable the skill, **new chat**.
5. Set `KIBANA_URL`, `KIBANA_USERNAME`, `KIBANA_PASSWORD`.

## Claude Code CLI setup

1. Same sync command (writes `~/.claude/skills/threat-intelligence-external/SKILL.md`).
2. Restart Claude Code or start a new session.

## Kibana in-product

Restart Kibana after changing markdown; no sync step. Loads `skill_common.md` + `skill_kibana.md` only.

## API paths

Paths are written literally in `skill_common.md` (e.g. `/api/threat_intelligence/search_reports`).
Keep them aligned with `common/threat_intelligence/hub/constants.ts` when routes change.
