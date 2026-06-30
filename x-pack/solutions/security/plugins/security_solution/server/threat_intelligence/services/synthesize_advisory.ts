/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ScopedModel } from '@kbn/agent-builder-server';
import { z } from '@kbn/zod/v4';
import {
  GLOBAL_SPACE_ID,
  SEVERITY_LEVELS,
  THREAT_INTEL_ADVISORIES_INDEX,
  THREAT_REPORTS_INDEX_PATTERN,
  type SeverityLevel,
  type ThreatCategory,
  type ThreatRegion,
} from '../../../common/threat_intelligence/hub';

/**
 * Domain capability module for the `synthesize_advisory` action.
 *
 * Tradecraft's "advisory" stage compresses many small reports into a
 * single weekly / per-actor narrative an analyst can actually read. The
 * service:
 *
 *   1. Pulls the top-N reports for a time window (and optional category /
 *      region / severity filter), sorted by `corroborated_rank_score`
 *      first (see point 4 — the hunt-feedback ranking loop), with
 *      `rank_score` and `severity.score` as tie-breakers.
 *   2. Computes prompt anchors — top threat actors, categories, and
 *      regions seen across the selection — so the LLM has aggregate
 *      signal it can lean on rather than re-deriving from per-report
 *      prose.
 *   3. Asks the LLM (structured output, zod-typed) to produce a short
 *      narrative + recommended-actions list.
 *   4. Optionally persists the result into `.kibana-threat-intel-advisories`
 *      under a deterministic `theme_id` (digest of the time range + the
 *      sorted source report ids) so re-runs over the same input set
 *      can be detected at query time.
 *
 * Out of scope for this module:
 *   - Scheduling. The companion `digest_delivery` workflow can call
 *     this service when a subscription is tagged `advisory`, but that
 *     wiring is a follow-up — see point 5 in the proposal.
 *   - Email / Slack rendering. The persisted markdown is the canonical
 *     artifact; delivery formatters consume it the same way they
 *     consume `digest.content_markdown`.
 */

export interface SynthesizeAdvisoryParams {
  time_range: { from: string; to: string };
  categories?: ThreatCategory[];
  regions?: ThreatRegion[];
  min_severity?: SeverityLevel;
  /**
   * Top-N reports to pull from `.kibana-threat-reports-*` as synthesis
   * inputs. Capped at 50 — the LLM context window is finite and reports
   * are summarised, not pasted in full.
   */
  max_reports?: number;
  /**
   * Optional steering hint from the analyst, e.g. "focus on
   * rule_candidate reports". Threaded into the prompt verbatim. Bounded
   * by the route schema to a sane length.
   */
  description?: string;
  /**
   * When `true`, the resulting advisory is written to
   * `.kibana-threat-intel-advisories` and the `advisory_id` is returned
   * on the response. Defaults to `false` so ad-hoc LLM-driven
   * invocations don't litter the index.
   */
  persist?: boolean;
  /**
   * Caller identifier persisted as `generated_by` for audit. The route
   * passes the username; the Agent Builder tool passes the orchestrator
   * id. When omitted, defaults to `'unknown'`.
   */
  generated_by?: string;
}

export interface AdvisoryRecommendation {
  title: string;
}

export type SynthesizeAdvisoryStatus =
  | 'advisory_generated'
  | 'advisory_persisted'
  | 'no_reports'
  | 'no_inference';

export interface SynthesizeAdvisoryResult {
  status: SynthesizeAdvisoryStatus;
  /** Deterministic digest of the input set — present on every result. */
  theme_id: string;
  theme_title?: string;
  narrative_markdown?: string;
  recommended_actions?: string[];
  /** Echo of the source report ids the synthesis used. */
  report_ids: string[];
  /** Aggregates fed to the LLM so the UI can render the same chips. */
  grouping: {
    threat_actors: Array<{ name: string; count: number }>;
    categories: Array<{ name: string; count: number }>;
    regions: Array<{ name: string; count: number }>;
  };
  /** Populated when `persist: true`. `_id` of the advisories row. */
  advisory_id?: string;
  /** Operator-facing summary string for the agent's narrative step. */
  message: string;
  next_step: string;
}

export const advisoryLlmOutputSchema = z.object({
  theme_title: z
    .string()
    .min(1)
    .max(160)
    .describe('Short headline summarising the dominant theme across the input reports.'),
  narrative_markdown: z
    .string()
    .min(1)
    .describe(
      'Two-to-three paragraph synthesised analysis in markdown. Mention concrete actors, ' +
        'techniques, and affected sectors where evident. Avoid restating the report list verbatim.'
    ),
  recommended_actions: z
    .array(z.string().min(1).max(240))
    .min(1)
    .max(7)
    .describe(
      'Three-to-seven short imperative bullets. Concrete and actionable, e.g. ' +
        '"Verify Detection Engine coverage of T1566.001 phishing" or "Review egress ' +
        'firewall rules for affected /24s".'
    ),
});

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const buildSeverityFilter = (
  minSeverity: SeverityLevel | undefined
): Array<Record<string, unknown>> => {
  if (!minSeverity) return [];
  const allowed = SEVERITY_LEVELS.filter(
    (level) => SEVERITY_RANK[level] >= SEVERITY_RANK[minSeverity]
  );
  return [{ terms: { 'severity.level': allowed } }];
};

interface ReportSource {
  '@timestamp'?: string;
  source?: { type?: string; name?: string };
  content?: { title?: string };
  severity?: { level?: SeverityLevel; score?: number };
  rank_score?: number;
  corroborated_rank_score?: number;
  extracted?: {
    threat_actors?: string[];
    categories?: string[];
    detection_actionability?: string;
    ttps?: { techniques?: string[] };
  };
  geography?: { regions?: string[] };
  feedback?: { ioc_hit_count?: number; ttp_hit_count?: number };
}

const tallyCounts = (values: Array<string | undefined>): Array<{ name: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
};

const tallyArrayCounts = (
  arrays: Array<string[] | undefined>
): Array<{ name: string; count: number }> => {
  const flat: string[] = [];
  for (const arr of arrays) {
    if (Array.isArray(arr)) flat.push(...arr);
  }
  return tallyCounts(flat);
};

/**
 * Render a one-line per-report summary block for the LLM prompt. Keeps
 * the token count bounded — full report bodies are deliberately not
 * threaded in (the LLM has the title, severity, technique IDs, and hit
 * counts; that is enough to synthesise themes without re-summarising
 * every report). Top-10 reports are listed; the remainder is summarised
 * as a tail count.
 */
const renderReportLines = (reports: Array<{ id: string; source: ReportSource }>): string => {
  const head = reports.slice(0, 10);
  const lines = head.map(({ id, source }) => {
    const title = source.content?.title ?? '(no title)';
    const severity = source.severity?.level ?? 'unknown';
    const actor = source.extracted?.threat_actors?.[0] ?? '—';
    const techniques = source.extracted?.ttps?.techniques?.slice(0, 3).join(', ') ?? '—';
    const iocHits = source.feedback?.ioc_hit_count ?? 0;
    return (
      `- [${id}] "${title}" (severity=${severity}, actor=${actor}, ` +
      `techniques=${techniques}, env_ioc_hits=${iocHits})`
    );
  });
  if (reports.length > head.length) {
    lines.push(`- … and ${reports.length - head.length} more report(s) in the same window`);
  }
  return lines.join('\n');
};

const buildPrompt = ({
  reports,
  grouping,
  timeRange,
  description,
}: {
  reports: Array<{ id: string; source: ReportSource }>;
  grouping: SynthesizeAdvisoryResult['grouping'];
  timeRange: { from: string; to: string };
  description?: string;
}): string => {
  const formatGroup = (items: Array<{ name: string; count: number }>): string =>
    items.length === 0
      ? '(none)'
      : items
          .slice(0, 8)
          .map((item) => `${item.name} (${item.count})`)
          .join(', ');

  const userHint = description ? `\nAnalyst hint: ${description}\n` : '';

  return `You are an Elastic Security senior threat intelligence analyst writing a weekly
advisory. Synthesise the reports below into a SHORT narrative + recommended actions list
for a SOC lead. Do NOT repeat the per-report list verbatim — your job is to find the
theme(s) and give concrete next steps.

Window: ${timeRange.from} → ${timeRange.to}
Top threat actors: ${formatGroup(grouping.threat_actors)}
Top categories:    ${formatGroup(grouping.categories)}
Top regions:       ${formatGroup(grouping.regions)}${userHint}

--- INPUT REPORTS (top ${reports.length} by corroborated rank) ---
${renderReportLines(reports)}

Output requirements:
  - theme_title: <= 160 chars, headline only.
  - narrative_markdown: 2-3 paragraphs, markdown OK (bold, bullets allowed).
    Reference techniques (Txxxx) and actors by name when supported by the input.
  - recommended_actions: 3-7 short imperative bullets, <= 240 chars each.
    Prefer actions that map to existing Elastic Security capabilities (Detection
    Engine rules, Indicator Match, Cases, SLOs, Defend).`;
};

/**
 * Deterministic theme id — sha256 of the sorted report-id set plus the
 * time-range bounds. Stable across re-runs over the same input so the
 * UI can detect duplicate synthesis attempts.
 */
const computeThemeId = (reportIds: string[], timeRange: { from: string; to: string }): string => {
  const sorted = [...reportIds].sort();
  const payload = `${timeRange.from}|${timeRange.to}|${sorted.join(',')}`;
  return createHash('sha256').update(payload).digest('hex');
};

const DEFAULT_MAX_REPORTS = 25;
const MAX_REPORTS_HARD_CAP = 50;

const fetchTopReports = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  params: SynthesizeAdvisoryParams
): Promise<Array<{ id: string; index: string; source: ReportSource }>> => {
  const size = Math.min(
    Math.max(1, params.max_reports ?? DEFAULT_MAX_REPORTS),
    MAX_REPORTS_HARD_CAP
  );

  const filters: Array<Record<string, unknown>> = [
    { terms: { space_id: [spaceId, GLOBAL_SPACE_ID] } },
    { range: { '@timestamp': { gte: params.time_range.from, lte: params.time_range.to } } },
  ];
  if (params.categories?.length) {
    filters.push({ terms: { 'extracted.categories': params.categories } });
  }
  if (params.regions?.length) {
    filters.push({ terms: { 'geography.regions': params.regions } });
  }
  filters.push(...buildSeverityFilter(params.min_severity));

  const response = await esClient.search({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size,
    _source: [
      '@timestamp',
      'source',
      'content.title',
      'severity',
      'rank_score',
      'corroborated_rank_score',
      'extracted.threat_actors',
      'extracted.categories',
      'extracted.ttps.techniques',
      'extracted.detection_actionability',
      'geography.regions',
      'feedback.ioc_hit_count',
      'feedback.ttp_hit_count',
    ],
    sort: [
      { corroborated_rank_score: { order: 'desc', missing: 0 } },
      { rank_score: { order: 'desc', missing: 0 } },
      { 'severity.score': { order: 'desc', missing: 0 } },
    ],
    query: { bool: { filter: filters } },
  } as Parameters<typeof esClient.search>[0]);

  return (response.hits.hits ?? []).map((hit) => ({
    id: hit._id ?? '',
    index: hit._index,
    source: (hit._source ?? {}) as ReportSource,
  }));
};

const buildGrouping = (
  reports: Array<{ source: ReportSource }>
): SynthesizeAdvisoryResult['grouping'] => ({
  threat_actors: tallyArrayCounts(reports.map((r) => r.source.extracted?.threat_actors)),
  categories: tallyArrayCounts(reports.map((r) => r.source.extracted?.categories)),
  regions: tallyArrayCounts(reports.map((r) => r.source.geography?.regions)),
});

const persistAdvisory = async ({
  esClient,
  spaceId,
  params,
  themeId,
  reportIds,
  grouping,
  llm,
  generatedBy,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
  params: SynthesizeAdvisoryParams;
  themeId: string;
  reportIds: string[];
  grouping: SynthesizeAdvisoryResult['grouping'];
  llm: z.infer<typeof advisoryLlmOutputSchema>;
  generatedBy: string;
}): Promise<string> => {
  const document = {
    '@timestamp': new Date().toISOString(),
    theme_id: themeId,
    time_range: params.time_range,
    filters: {
      categories: params.categories,
      regions: params.regions,
      min_severity: params.min_severity,
    },
    theme_title: llm.theme_title,
    narrative_markdown: llm.narrative_markdown,
    recommended_actions: llm.recommended_actions,
    report_ids: reportIds,
    grouping: {
      threat_actors: grouping.threat_actors.map((g) => g.name),
      categories: grouping.categories.map((g) => g.name),
      regions: grouping.regions.map((g) => g.name),
    },
    generated_by: generatedBy,
    space_id: spaceId,
  };
  const response = await esClient.index({
    index: THREAT_INTEL_ADVISORIES_INDEX,
    document,
  });
  return response._id;
};

export const synthesizeAdvisory = async (
  esClient: ElasticsearchClient,
  model: ScopedModel | undefined,
  logger: Logger,
  spaceId: string,
  params: SynthesizeAdvisoryParams
): Promise<SynthesizeAdvisoryResult> => {
  const reports = await fetchTopReports(esClient, spaceId, params);
  const reportIds = reports.map((r) => r.id).filter((id): id is string => id.length > 0);
  const themeId = computeThemeId(reportIds, params.time_range);
  const grouping = buildGrouping(reports);

  if (reports.length === 0) {
    return {
      status: 'no_reports',
      theme_id: themeId,
      report_ids: [],
      grouping,
      message:
        'No threat reports matched the supplied filter in the requested window. ' +
        'Either widen `time_range` or relax the `categories` / `regions` / ' +
        '`min_severity` filters.',
      next_step:
        'Re-run with a wider window (e.g. last 30 days), or call `search_reports` to ' +
        'understand the current report population before re-attempting.',
    };
  }

  if (!model) {
    return {
      status: 'no_inference',
      theme_id: themeId,
      report_ids: reportIds,
      grouping,
      message:
        `Found ${reports.length} reports for the supplied filter but no GenAI connector is ` +
        `configured — advisory synthesis requires one. The grouping aggregates are still ` +
        `returned so the UI can render a "no-LLM" fallback panel.`,
      next_step:
        'Configure a default GenAI connector via Stack Management → Connectors (or set ' +
        '`genAi:defaultAIConnector` in advanced settings) and re-run.',
    };
  }

  const prompt = buildPrompt({
    reports,
    grouping,
    timeRange: params.time_range,
    description: params.description,
  });
  const structured = model.chatModel.withStructuredOutput(advisoryLlmOutputSchema);
  const llm = (await structured.invoke(prompt)) as z.infer<typeof advisoryLlmOutputSchema>;

  let advisoryId: string | undefined;
  if (params.persist === true) {
    try {
      advisoryId = await persistAdvisory({
        esClient,
        spaceId,
        params,
        themeId,
        reportIds,
        grouping,
        llm,
        generatedBy: params.generated_by ?? 'unknown',
      });
      logger.debug(
        `synthesize_advisory persisted advisory_id=${advisoryId} theme_id=${themeId} ` +
          `reports=${reportIds.length}`
      );
    } catch (err) {
      // Persistence failure should not lose the synthesised advisory —
      // the caller still gets the markdown back in the response. The
      // advisory_id is omitted so the UI can decide whether to fall
      // back to ephemeral rendering.
      logger.warn(
        `synthesize_advisory persistence failed (theme_id=${themeId}): ` +
          `${(err as Error).message}. Returning ephemeral advisory.`
      );
    }
  }

  return {
    status: advisoryId ? 'advisory_persisted' : 'advisory_generated',
    theme_id: themeId,
    theme_title: llm.theme_title,
    narrative_markdown: llm.narrative_markdown,
    recommended_actions: llm.recommended_actions,
    report_ids: reportIds,
    grouping,
    ...(advisoryId ? { advisory_id: advisoryId } : {}),
    message:
      `Synthesised "${llm.theme_title}" from ${reportIds.length} report(s) ` +
      `(${grouping.threat_actors.length} distinct actors, ` +
      `${grouping.categories.length} categories).`,
    next_step:
      advisoryId !== undefined
        ? 'Render the narrative_markdown + recommended_actions in the dashboard or in chat. ' +
          `Drill back into individual reports via \`search_reports\` and \`report_ids\`.`
        : 'Render the narrative_markdown + recommended_actions in chat. Pass `persist: true` ' +
          'on the next run if you want the advisory persisted to ' +
          '`.kibana-threat-intel-advisories` for dashboard / digest consumption.',
  };
};
