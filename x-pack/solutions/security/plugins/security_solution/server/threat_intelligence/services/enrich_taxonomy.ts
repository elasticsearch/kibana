/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { ScopedModel } from '@kbn/agent-builder-server';
import { z } from '@kbn/zod/v4';
import { logStageUsage } from '../routes/lib/cost_tracker';

const TAXONOMY_BODY_CHAR_LIMIT = 30_000;

export const taxonomyOutputSchema = z.object({
  categories: z.array(z.string()),
  regions: z.array(z.string()),
  relevance: z.number(),
  detection_actionability: z.string(),
  diamond_suitable: z.boolean(),
});

export type TaxonomyOutput = z.infer<typeof taxonomyOutputSchema>;

export interface EnrichTaxonomyParams {
  text: string;
  report_id?: string;
  title?: string;
}

const buildTaxonomyPrompt = (params: EnrichTaxonomyParams): string => {
  const truncated = params.text.slice(0, TAXONOMY_BODY_CHAR_LIMIT);
  const reportIdLine = params.report_id ? `Report id: ${params.report_id}\n` : '';
  const titleLine = params.title ? `Report title: ${params.title}\n` : '';
  return `You are a threat intel taxonomist. Categorize the following report AND score how actionable it is for detection-rule authors.

Return a strict JSON object with exactly five keys:

  categories: array of zero or more values from this closed set:
    ["ransomware", "phishing", "malware", "data-breach", "vulnerability",
     "nation-state", "supply-chain", "insider-threat", "financial",
     "regulatory", "cloud-security", "iot-ot", "zero-day", "apt",
     "general"]

  regions: array of zero or more values from this closed set:
    ["north-america", "south-america", "europe", "middle-east",
     "africa", "south-asia", "east-asia", "southeast-asia",
     "oceania", "global"]

  relevance: float in [0, 1] expressing how useful this report
    is for *writing a detection rule*. Anchor points:
      0.0  - opinion piece, policy commentary, vendor PR.
      0.25 - news of a breach with no technical detail.
      0.5  - IOCs listed but no behavior described.
      0.75 - TTPs / ATT&CK techniques described.
      1.0  - concrete behavior (commands, registry keys,
             process patterns) suitable for a durable rule.

  detection_actionability: exactly one value from this closed set:
    ["informational", "iocs_only", "ttps_present", "rule_candidate"]
    Use the same anchors as \`relevance\` — "rule_candidate" only
    when the report names concrete behaviors a rule author
    could lift directly.

  diamond_suitable: boolean — true if this report is a specific,
    technical, attributable threat report filling ANY Diamond Model
    vertex: named threat actor or campaign attribution, specific
    malware or exploit or TTPs, C2 infrastructure or hosting
    details, or identified victims with actor context. Set false
    for marketing and thought-leadership content, trend statistics
    or predictions without actor context, vulnerability advisories
    without actor attribution, defensive guidance without actor
    context, and conference, webinar, or press announcements.

Pick only categories actively described in the text (not background
mentions). Pick "global" for regions only when the activity
genuinely targets multiple continents. Do not invent values
outside the closed sets.

${reportIdLine}${titleLine}Report text:
${truncated}`;
};

/**
 * Classify a threat report into taxonomy fields using a structured LLM call.
 * Called by the `enrich_taxonomy` kibana.request step in `nl_extraction_behavioral`.
 *
 * Returns the five taxonomy fields plus `diamond_suitable` which gates the
 * heavy `extract_diamond` step on the same report. Token usage is logged at
 * INFO level via `logStageUsage` so per-connector cost is queryable from logs.
 */
export const enrichTaxonomy = async (
  model: ScopedModel,
  logger: Logger,
  params: EnrichTaxonomyParams
): Promise<TaxonomyOutput> => {
  const prompt = buildTaxonomyPrompt(params);
  const connectorId = model.connector.connectorId;

  const structured = model.chatModel.withStructuredOutput(taxonomyOutputSchema, {
    includeRaw: true,
  });

  const result = (await structured.invoke(prompt)) as {
    raw: { response_metadata: Record<string, unknown> };
    parsed: TaxonomyOutput;
  };

  logStageUsage(logger, 'enrich_taxonomy', connectorId, result.raw.response_metadata ?? {});

  logger.debug(
    `enrich_taxonomy ok diamond_suitable=${result.parsed.diamond_suitable} ` +
      `relevance=${result.parsed.relevance} report_id=${params.report_id}`
  );

  return result.parsed;
};
