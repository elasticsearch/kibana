/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PassThrough } from 'stream';
import { schema } from '@kbn/config-schema';
import type { IRouter, CoreSetup, IUiSettingsClient, KibanaRequest } from '@kbn/core/server';
import { ChatCompletionEventType, MessageRole } from '@kbn/inference-common';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR } from '@kbn/management-settings-ids';
import { runEsqlQuery, sanitizeCellValue } from '../utils/esql_query';
import type { EsqlColumn } from '../utils/esql_query';
import { columnNamesToKeys } from '../../common/utils';

const SOCKET_TIMEOUT_MS = 5 * 60 * 1000;
const NO_DEFAULT_CONNECTOR = 'NO_DEFAULT_CONNECTOR';
const MAX_HTML_BYTES = 500_000;

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">`;

type ColorMode = 'LIGHT' | 'DARK';

function colorSection(colorMode: ColorMode): string {
  if (colorMode === 'DARK') {
    return `VISUAL DESIGN — DARK MODE (apply these colors exactly, do not substitute):
- IMPORTANT: body background MUST be #1D1E24. Text color: #D4DAE5.
- Required body reset: body { margin: 0; padding: 16px; box-sizing: border-box; font-family: Inter, system-ui, sans-serif; color: #D4DAE5; background: #1D1E24; }
- Card/surface backgrounds: #25262E. Borders: #3C3D4A.
- Accent colors: #36A2EF (blue), #2EC4B6 (teal), #FF6B9D (pink), #FFD166 (yellow), #5BC0F8, #E87DA8.
- Clean, modern design. Comfortable padding. No harsh borders.`;
  }
  return `VISUAL DESIGN — LIGHT MODE (apply these colors exactly, do not substitute):
- IMPORTANT: body background MUST be transparent — do NOT set background on <html> or <body>. Text color: #343741.
- Required body reset: body { margin: 0; padding: 16px; box-sizing: border-box; font-family: Inter, system-ui, sans-serif; color: #343741; }
- Accent colors: #0077CC (blue), #00BFB3 (teal), #F04E98 (pink), #FEC514 (yellow), #1BA9F5, #D36086.
- Card/surface backgrounds: #FFFFFF. Borders: #D3DAE6.
- Clean, modern design. Comfortable padding. No harsh borders.`;
}

function buildSystemPromptStatic(colorMode: ColorMode): string {
  return `You are a data visualization assistant embedded in a Kibana dashboard panel.

Your job is to generate a single self-contained HTML document that presents the user's data or answers their prompt in the most appropriate visual form.

OUTPUT RULES — follow these exactly:
- Output ONLY valid HTML. No markdown fences, no explanation, no commentary before or after.
- The HTML must be fully self-contained: all CSS inline in <style> tags.
- CRITICAL: Do NOT include ANY <script> tags or JavaScript whatsoever. No inline scripts, no external scripts, no event handlers. Pure HTML + CSS only.
- Do NOT use <a> anchor tags or href attributes of any kind.
- Do NOT load any external resources. No CDN scripts, no Google Fonts, no images from URLs.
- For charts and diagrams, use pure CSS (bar charts with div widths, progress bars, etc.) or inline SVG.

${colorSection(colorMode)}

CONTENT RULES:
- Pick the visualization type that best fits the data and the prompt. Do NOT default to charts when a table, list, KPI card, or status board is more appropriate.
- Fill the full panel width. Height should fit the content naturally.
- Do not add a title — the dashboard panel has its own title.
- For bar charts: use a div with a colored background and width set to the percentage value inline style.
- For status indicators: use colored badges/pills with CSS background-color.`;
}

function buildSystemPromptTemplate(colorMode: ColorMode): string {
  return `You are a data visualization assistant embedded in a Kibana dashboard panel.

Generate a reusable HTML template using Liquid template syntax. The template is filled with real ES|QL query results at render time — do NOT embed literal data values.

DATA MODEL available in the template:
- rows: array of row objects. Column names are normalized: dots/special chars → underscores, @ → at_.
  e.g. category.keyword → row.category_keyword, @timestamp → row.at_timestamp
- _pct variants: pre-computed percentage of each numeric column's max value (0–100).
  e.g. row.total_revenue_pct
- max: object of column max values. e.g. max.total_revenue

LIQUID SYNTAX:
- Loop rows:     {% for row in rows %}...{% endfor %}
- Empty state:   {% if rows.size == 0 %}...{% endif %}
- Conditionals:  {% if row.revenue >= 10000 %}...{% elsif row.revenue >= 5000 %}...{% else %}...{% endif %}
- Output value:  {{ row.column_name }}
- Bar width:     <div style="width: {{ row.column_name_pct }}%; ..."></div>
- Filters:       {{ row.value | round: 2 }}

REQUIRED: Your output MUST begin with exactly this comment on the very first line (nothing before it):
<!--ai-template-->

OUTPUT RULES:
- Output ONLY the HTML template starting with <!--ai-template-->. No markdown fences, no explanation.
- All CSS inline in <style> tags.
- CRITICAL: No <script> tags or JavaScript. No <a> anchor tags or href attributes. Pure HTML + CSS only.
- No external resources (no CDN, no Google Fonts, no image URLs).
- For charts use pure CSS or inline SVG.

${colorSection(colorMode)}

CONTENT RULES:
- Pick the best visualization for the schema and prompt. Full panel width; height fits content naturally. No title.
- Status board example:
  {% for row in rows %}
  <div class="card {% if row.revenue >= 10000 %}card-green{% elsif row.revenue >= 5000 %}card-yellow{% else %}card-red{% endif %}">
    <span>{{ row.category }}</span><span>{{ row.revenue }}</span>
  </div>
  {% endfor %}`;
}

function formatSampleTable(columns: EsqlColumn[], rows: unknown[][]): string {
  const header = columns.map((c) => c.name.replace(/[<>]/g, '')).join(' | ');
  const separator = columns.map(() => '---').join(' | ');
  const dataRows = rows
    .slice(0, 3)
    .map((row) => row.map(sanitizeCellValue).join(' | '))
    .join('\n');
  return `${header}\n${separator}\n${dataRows}`;
}

interface StartDeps {
  inference: InferenceServerStart;
}

async function resolveConnectorId({
  uiSettingsClient,
  inference,
  request,
}: {
  uiSettingsClient: IUiSettingsClient;
  inference: InferenceServerStart;
  request: KibanaRequest;
}): Promise<string | undefined> {
  try {
    const defaultSetting = await uiSettingsClient.get<string>(GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR);
    if (defaultSetting && defaultSetting !== NO_DEFAULT_CONNECTOR) {
      return defaultSetting;
    }
  } catch {
    // UI setting may not be registered
  }
  try {
    const connector = await inference.getDefaultConnector(request);
    return connector?.connectorId;
  } catch {
    // no connectors available
  }
  return undefined;
}

export function registerGenerateRoute(
  router: IRouter,
  getStartServices: CoreSetup<StartDeps>['getStartServices']
) {
  router.post(
    {
      path: '/internal/ai_panel/generate',
      security: {
        authz: { enabled: false, reason: 'Delegates auth to the inference plugin' },
      },
      options: {
        access: 'internal',
        timeout: { idleSocket: SOCKET_TIMEOUT_MS },
      },
      validate: {
        body: schema.object({
          prompt: schema.string({ minLength: 1, maxLength: 10_000 }),
          esqlQuery: schema.maybe(schema.string({ maxLength: 1_000_000 })),
          timeRange: schema.maybe(schema.object({ from: schema.string(), to: schema.string() })),
          colorMode: schema.oneOf([schema.literal('LIGHT'), schema.literal('DARK')], {
            defaultValue: 'LIGHT',
          }),
        }),
      },
    },
    async (context, request, response) => {
      const [, { inference }] = await getStartServices();
      const { prompt, esqlQuery, timeRange, colorMode } = request.body;
      const core = await context.core;

      const connectorId = await resolveConnectorId({
        uiSettingsClient: core.uiSettings.client,
        inference,
        request,
      });
      if (!connectorId) {
        return response.badRequest({ body: 'No inference connector configured' });
      }

      const passThrough = new PassThrough();
      const abortController = new AbortController();
      const abortSub = request.events.aborted$.subscribe(() => abortController.abort());

      let userMessage: string;
      let systemPrompt: string;

      if (esqlQuery) {
        systemPrompt = buildSystemPromptTemplate(colorMode);

        let columns: EsqlColumn[] = [];
        let sampleRows: unknown[][] = [];
        try {
          const result = await runEsqlQuery(
            core.elasticsearch.client.asCurrentUser,
            esqlQuery,
            timeRange
          );
          columns = result.columns;
          sampleRows = result.rows;
        } catch {
          /* non-fatal — generate template from prompt + partial schema */
        }

        if (columns.length > 0) {
          const columnKeys = columnNamesToKeys(columns.map((c) => c.name));
          const schemaLines = columns
            .map(
              (c, i) =>
                `  - ${sanitizeCellValue(c.name)} (${sanitizeCellValue(c.type)}) → placeholder: {{${
                  columnKeys[i]
                }}}`
            )
            .join('\n');
          const sampleSection =
            sampleRows.length > 0
              ? `\n\nSample rows:\n${formatSampleTable(columns, sampleRows)}`
              : '\n\nNote: no rows available for the current time range.';
          userMessage = `${prompt}\n\nData schema:\n${schemaLines}${sampleSection}\n\nGenerate an HTML template using the placeholder names shown above.`;
        } else {
          userMessage = `${prompt}\n\nNote: schema unavailable. Generate a suitable template based on the prompt.`;
        }
      } else {
        systemPrompt = buildSystemPromptStatic(colorMode);
        userMessage = prompt;
      }

      // For static panels, prepend CSP as the first token so the iframe gets it immediately.
      // Template panels skip this — CSP is injected client-side after placeholder fill.
      if (!esqlQuery) {
        passThrough.write(JSON.stringify({ token: CSP_META }) + '\n');
      }

      const client = inference.getClient({ request });
      const events$ = client.chatComplete({
        connectorId,
        system: systemPrompt,
        messages: [{ role: MessageRole.User, content: userMessage }],
        stream: true,
        abortSignal: abortController.signal,
      });

      let accHtml = '';
      let sizeLimitExceeded = false;
      events$.subscribe({
        next: (event) => {
          if (sizeLimitExceeded) return;
          if (event.type === ChatCompletionEventType.ChatCompletionChunk && event.content) {
            accHtml += event.content;
            if (accHtml.length > MAX_HTML_BYTES) {
              sizeLimitExceeded = true;
              abortController.abort();
              abortSub.unsubscribe();
              if (!passThrough.writableEnded) {
                passThrough.write(
                  JSON.stringify({ error: 'Generated content exceeded size limit' }) + '\n'
                );
                passThrough.end();
              }
              return;
            }
            if (!passThrough.writableEnded)
              passThrough.write(JSON.stringify({ token: event.content }) + '\n');
          }
        },
        error: (err) => {
          abortSub.unsubscribe();
          if (!passThrough.writableEnded) {
            passThrough.write(JSON.stringify({ error: err.message }) + '\n');
            passThrough.end();
          }
        },
        complete: () => {
          abortSub.unsubscribe();
          if (sizeLimitExceeded) return;
          if (!passThrough.writableEnded) passThrough.end();
        },
      });

      return response.ok({
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: passThrough,
      });
    }
  );
}
