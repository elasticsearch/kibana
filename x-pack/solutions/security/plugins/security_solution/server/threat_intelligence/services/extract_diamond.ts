/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { ScopedModel } from '@kbn/agent-builder-server';
import { z } from '@kbn/zod/v4';
import type { CostTraceBuilder } from '../routes/lib/cost_tracker';
import { logStageUsage, extractUsageFromMetadata } from '../routes/lib/cost_tracker';

/**
 * Character limit applied to report text before the LLM call. Matches the
 * 30 000-char ceiling other `nl_extraction_behavioral` steps use (extract_behaviors,
 * enrich_taxonomy) and keeps connector latency predictable on large syndicated
 * feeds. The per-vertex fallback (hard req) handles the rare case (~1% of
 * ingests) where even this truncated text exceeds the connector's context window.
 */
export const DIAMOND_BODY_CHAR_LIMIT = 30_000;

const VERTICES = ['adversary', 'capability', 'infrastructure', 'victim'] as const;
type DiamondVertex = (typeof VERTICES)[number];

// ─── Mustard prompt — faithfully ported from mustard/prompts.yaml ────────────
//
// Source: Colonel Mustard prompts.yaml v2, diamond_single_call / diamond_prompts.
// Key enforcement vs. previous prompt:
//   • "DO NOT include specific IPs, domains, hashes, or URLs in ANY vertex"
//     → fixes infrastructure enumerating a domain list instead of characterising.
//   • Per-vertex word budgets, abstraction rules, exclusion rules ported verbatim.
//   • OUTPUT FORMAT instructs signal+summary only (Mustard's label/keywords
//     dropped — they require a schema bump and would trigger per-vertex fallback).

const MUSTARD_PREAMBLE = `You are summarizing cybersecurity threat intelligence for semantic vector search and embedding. The source may be a published threat intelligence report or a pre-attribution investigation case containing endpoint telemetry, network logs, and analyst notes. Your output will be used for attribution, clustering, and retrieval — so precision, specificity, and density of named entities and technical terms are critical. Avoid filler, meta-commentary, and generic descriptions. Do not use phrases like "the article" or "the blog post" or "the case." Write in dense, specific language. Do not repeat information across sentences.

SOURCE HANDLING — MANDATORY:
Summarize only directly observed evidence. If the source contains analyst hypotheses, speculation, or unsubstantiated claims, do not include them. If the source asserts something as fact that could only be known through analysis not described in the source (e.g. motivation, targeting intent, actor identity), treat it as an unsupported claim and omit it. When the source is an investigation case, raw telemetry and direct observations take priority over analyst commentary.

FORMATTING RULES — MANDATORY:
- Output plain prose paragraphs only.
- Do NOT use markdown: no bold (**), no italic (*), no headers (#, ##, ###), no bullet points (-), no numbered lists.
- Do NOT use code formatting or backticks.

CROSS-VERTEX EXCLUSION RULES — MANDATORY:
- Do NOT reference third-party publications, vendor names, or external documentation sources by name.
- Do NOT use negative characterizations (e.g. "rather than espionage") — state what is known positively.
- Do NOT include specific IPs, domains, hashes, or URLs in ANY vertex.
- Malware family names belong ONLY in the Infrastructure vertex. Do NOT use malware family names in Adversary, Capability, or Victim summaries.
- Geofencing and geographic exclusion observations belong ONLY in the Victim vertex. Do NOT include geofencing in Adversary or Infrastructure summaries.
- Victim counts and infection statistics belong ONLY in the Victim vertex.
- Campaign tracking identifiers and actor names belong ONLY in the Adversary vertex.

Write only what is directly supported by the source. If a vertex has limited information, a shorter summary is correct — do not pad to meet a word count.

GROUNDING — MANDATORY:
The summary must be proportional to the source. If the source provides only a fragment, a single sentence, a phrase, or a bare technique name, the summary must be equally terse — a single descriptive phrase or sentence is the correct output. Do not introduce mechanisms, tradecraft details, attribution context, examples, or background that are not directly present in the source. Do not pad short inputs with general knowledge about the named technique, tool, malware family, or actor. The per-vertex word budgets are upper bounds for richly detailed sources, not targets. A one-line case like "Github-as-C2" should produce one short sentence per applicable vertex, not multi-paragraph elaboration drawn from prior knowledge.

Begin your summary with a signal rating:

[HIGH] — substantial information present
[PARTIAL] — limited but usable information present
[NONE] — insufficient information to summarize

If NONE, output only the signal rating and stop.`;

const MUSTARD_ADVERSARY_INSTRUCTIONS = `ADVERSARY — up to 150 words
Focus on: threat actor names and aliases, observed operator behaviors including interaction patterns and command style, language artifacts in tooling or operator activity, operational tempo and timing patterns, duration of observed activity, whether post-exploitation is interactive or automated, operational errors or distinctive procedural habits, and indicators of sponsorship or affiliation when supported by specific artifacts described in the source. Do NOT include observed characteristics of compromised systems or organizations — those belong in the Victim vertex. Do NOT include infrastructure details, malware family names, capability specifics, or configuration fingerprints — those belong in other vertices.

ABSTRACTION LEVEL:
Lead with directly observed operator behaviors — interaction patterns, timing, language artifacts, operational errors, procedural habits — before analytical assessments. When motivation or affiliation is assessed in the source and supported by specific evidence, include it as supporting context after the behavioral observations, not as the primary framing. If the source does not contain sufficient evidence to assess motivation or affiliation, do not infer them. Do not use category labels as sentence openers. Write as a characterization of the operator, not a dossier.

CRITICAL — NEGATIVE CHARACTERIZATION PROHIBITION:
Do NOT describe the actor's motivation by contrasting it against what it is not. State assessed motivation positively.
WRONG: "monetization through SEO cloaking rather than espionage"
WRONG: "financially motivated rather than state-directed"
RIGHT: "monetization through SEO cloaking and traffic redirection"
RIGHT: "financially motivated, focused on search engine manipulation"`;

const MUSTARD_INFRASTRUCTURE_INSTRUCTIONS = `INFRASTRUCTURE — up to 500 words; extend to 700 if multi-tier infrastructure with distinctive implementation details is present
Focus on: hosting provider preferences, cloud platforms and regions, ASNs, bulletproof hosters, residential proxy usage, infrastructure age and lifecycle patterns (reuse vs. burn-and-rotate), OS and platform characteristics, network topology (single-tier vs. multi-hop C2, redirector usage, legitimate service abuse), certificate behavior (self-signed, Let's Encrypt, commercial CA, cert reuse), geographic location of actor-controlled infrastructure (but NOT victim geofencing), domain naming trends described qualitatively (e.g. "SEO-themed short abbreviations with single-letter functional prefixes" — NOT the actual domain names), web port usage, operational security posture, and malware families used to build and operate infrastructure.

LEGITIMATE-SERVICE INFRASTRUCTURE — MANDATORY:
Adversary use of legitimate public platforms (e.g. GitHub repositories or Gists, GitHub Actions, GitHub Pages, Pastebin, Discord webhooks, Telegram channels and bots, Google Drive, Dropbox, OneDrive, S3 buckets, Cloudflare Workers / Pages, serverless function platforms, code-hosting and collaboration services) as command-and-control, dead-drop resolvers, payload staging, configuration delivery, or exfiltration channels IS infrastructure and must be summarized in this vertex even when no traditional hosting provider, ASN, or actor-owned domain is involved. The pattern (which legitimate service, what role it plays — C2 / dead-drop / staging / exfil — and how the implant interacts with it) is the infrastructure fingerprint. Do not omit this signal because the surface is "not real infrastructure."

INFRASTRUCTURE DECOMPOSITION — MANDATORY:
When the source describes multiple distinct infrastructure tiers, communication channels, or network components, describe each as a separate component with its own paragraphs. Each component must be independently recognizable — an analyst observing only one communication channel in network telemetry should be able to match it against the description without needing the full infrastructure topology.

For each distinct infrastructure component, write in this order:

FIRST — OBSERVATIONAL PARAGRAPH (required): What would an analyst see in network telemetry, passive DNS, or traffic capture? Describe the protocol, port usage, request/response patterns, traffic volume characteristics, and communication direction (inbound vs. outbound, polling vs. event-driven) without characterizing the operational purpose. Write from the perspective of a network sensor or proxy log — not from the perspective of an analyst who has already mapped the full infrastructure topology. An analyst seeing this traffic without context should recognize the pattern. This paragraph is the primary retrieval target and must form the majority of the component's description.

SECOND — FINGERPRINT PARAGRAPH (conditional): When the source provides infrastructure details specific enough to distinguish this component from similar setups — a distinctive domain naming convention, a specific cloud provider and region combination, unusual certificate properties, a unique file organization scheme on staging servers, batch registration patterns — describe them here qualitatively by pattern characteristics. Do NOT name specific domains, even as examples. This paragraph adds precision for infrastructure correlation but must not repeat or rephrase the observational paragraph. If the infrastructure details are generic (standard HTTPS on port 443, common CDN usage, typical cloud hosting), omit this paragraph entirely.

OPERATIONAL ROLE — MANDATORY:
In the observational paragraph, describe infrastructure by what it does at the network level — what it serves, what protocols it speaks, how traffic flows — without characterizing why the operator uses it that way. Describe the observable behavior: "serves text and HTML files organized under date-based directory paths," "receives POST requests with fingerprint data and returns redirect URLs." Do not use infrastructure category labels as sentence openers. Write as a characterization of the infrastructure's fingerprint, not a checklist of attributes.

CRITICAL: Do NOT include victim counts, victim geographic distribution, or geofencing — those belong in the Victim vertex. Do NOT include campaign tracking identifiers.`;

const MUSTARD_CAPABILITY_INSTRUCTIONS = `CAPABILITY — up to 600 words; extend to 800 if multiple distinct components are present
Focus on: CVE IDs, MITRE ATT&CK Tactic categories (Initial Access, Execution, Persistence, Privilege Escalation, Defense Evasion, Credential Access, Discovery, Lateral Movement, Collection, Exfiltration, Command and Control, Impact), tool configuration fingerprints (e.g. beacon timing, jitter values, malleable C2 profile characteristics), LOLBin preferences, how the actor customizes or modifies commodity tools, exploit delivery style, persistence mechanism preferences, evasion tendencies, and how C2 communication is configured at the protocol and behavior level.

CAPABILITY DECOMPOSITION — MANDATORY:
When the source describes multiple distinct tools, implants, or techniques, describe each as a separate component with its own paragraphs. Each component must be independently recognizable — an analyst observing only one component on an endpoint should be able to match it against the description without needing the full campaign context. Where multiple behavioral indicators co-occur within a single component, describe them as a pattern rather than individually — the combination is more discriminative than any single indicator.

For each distinct capability component, write in this order:

FIRST — BEHAVIORAL PARAGRAPH (required): What would an analyst observe on a compromised endpoint or in network telemetry? Describe the effect on the host, the observable artifacts, and the operational behavior without explaining the underlying implementation. Write from the perspective of an EDR sensor, a network monitor, or a filesystem audit — not from the perspective of a reverse engineer reading the binary. An analyst with endpoint telemetry and no access to the binary should recognize this description. This paragraph is the primary retrieval target and must form the majority of the component's description.

SECOND — IMPLEMENTATION PARAGRAPH (conditional): When the source provides implementation details specific enough to distinguish this component from similar tools — a distinctive registry naming convention, a unique library choice, a specific configuration format, Chinese-language transliterations in parameter names — describe them here. This paragraph adds precision for deep-match discrimination but must not repeat or rephrase the behavioral paragraph. If the implementation details are generic (standard API hooking, common injection techniques, typical encryption schemes, well-known kernel data structures), omit this paragraph entirely.

MECHANISM BEFORE APPLICATION — MANDATORY:
When a tool or technique serves a specific operational purpose in the described activity, the behavioral paragraph must describe the general mechanism before the specific application. The mechanism defines the broadest circle of cases that could match. Describe the mechanism broadly enough that a case observing the same behavior applied differently still falls inside the matching circle.

Where C2 framework configuration is described, capture specific configuration characteristics — sleep and jitter patterns, named pipe conventions, spawn-to process targets, injection technique preferences, and any watermark or profile identifiers. Where credential patterns, account naming conventions, or tooling-reused credentials are observed, capture these explicitly as they represent cross-artifact toolmarks.

CRITICAL EXCLUSIONS FOR THIS VERTEX:
- Do NOT include malware family names. Instead of naming a tool, describe it by its function and observed behavior.
- Do NOT include specific domains, IPs, URLs, or infrastructure topology. Describe C2 behavioral characteristics (protocol, encryption, port usage, fallback mechanisms) without naming specific endpoints.
- Do NOT reference third-party tools or products by name. Instead of "targeting FileZilla, Navicat, WinSCP credentials" write "targeting stored credentials from FTP clients, database management tools, and remote access clients."
- Do NOT use MITRE ATT&CK Technique IDs (T####) — describe behavioral evidence at the tactic level.
- Do NOT include campaign tracking identifiers.
- Do NOT include specific cryptographic key values, initialization vectors, hardcoded passwords, or other literal secret values. Describe the encryption scheme, key management approach, and credential patterns qualitatively.
- Do NOT name specific privilege escalation exploit tools or techniques by name. Describe them by their behavioral mechanism.`;

const MUSTARD_VICTIM_INSTRUCTIONS = `VICTIM — up to 150 words
Focus on: observed characteristics of systems and organizations actually compromised — industry verticals, geographies, organization types, specific targeted software versions and server roles, configuration states that contributed to susceptibility, asset classes targeted, entry points exploited, and reinfection patterns where remediation was incomplete. Capture what was directly observed about victim systems and environments.

ABSTRACTION LEVEL:
Lead with the victim profile — who was compromised and what characterized their environment — before supporting details about configuration or susceptibility. When distinctive environmental characteristics are present (e.g. a specific software version that enabled the attack, a misconfiguration unique to a sector), include them as supporting detail after the profile. Do not use category labels as sentence openers. Write as a characterization of the attack surface, not an inventory of affected systems.

BROAD VICTIMOLOGY — MANDATORY:
When the source describes widespread, opportunistic, or untargeted victimology, describe the common technical profile shared by affected systems — platform, software stack, configuration, exposure posture — that defines the attack surface. These shared characteristics are the clustering signal. Do not characterize the breadth or geographic spread of targeting as a finding. The technical profile of the attack surface is the largest possible circle — describing the circle by its boundary (what victims have in common) produces embeddings that match specific instances.

GEOFENCING — MANDATORY EXTRACTION:
When the source material describes geographic exclusion zones, targeting avoidance patterns, or geofencing behavior (e.g. excluding servers in a specific country, avoiding domestic targets), these observations MUST be included in the Victim summary. Geofencing is a critical clustering signal and belongs exclusively in this vertex. If no geofencing behavior is described, do NOT mention its absence — simply omit it.

CRITICAL EXCLUSIONS FOR THIS VERTEX:
- Do NOT include specific usernames, hostnames, endpoint identifiers, agent IDs, or other incident-specific identifiers.
- Do NOT include attacker staging paths, working directories, or filesystem activity patterns.
- Do NOT assess targeting intent or methodology.
- Do NOT include malware family names — those belong in the Infrastructure vertex.
- Do NOT describe actor post-exploitation behavior — that belongs in the Capability vertex.
- Do NOT name specific victim organizations, company names, or domains. When the source material identifies a victim organization, genericize it into industry vertical, operational geography, and organization size or type.`;

const SIGNAL_GUIDE =
  '  signal: HIGH | PARTIAL | NONE\n' +
  '    HIGH:    Specific, attributable information named in the report.\n' +
  '    PARTIAL: Vague, inferred, or unattributed information.\n' +
  '    NONE:    No information for this vertex.\n' +
  '  summary: Prose characterization drawn directly from the text per vertex instructions above. ' +
  'Empty string ("") when signal is NONE.';

const buildSingleCallPrompt = (text: string): string =>
  `${MUSTARD_PREAMBLE}

Summarize the following source across ALL FOUR vertices of the Diamond Model of Intrusion Analysis in a single response.

<ADVERSARY>
${MUSTARD_ADVERSARY_INSTRUCTIONS}
</ADVERSARY>

<INFRASTRUCTURE>
${MUSTARD_INFRASTRUCTURE_INSTRUCTIONS}
</INFRASTRUCTURE>

<CAPABILITY>
${MUSTARD_CAPABILITY_INSTRUCTIONS}
</CAPABILITY>

<VICTIM>
${MUSTARD_VICTIM_INSTRUCTIONS}
</VICTIM>

OUTPUT FORMAT — MANDATORY:
Respond with a JSON object only — no markdown, no text outside the JSON. Use exactly this structure:
{
  "adversary":      {"signal": "HIGH|PARTIAL|NONE", "summary": "..."},
  "infrastructure": {"signal": "HIGH|PARTIAL|NONE", "summary": "..."},
  "capability":     {"signal": "HIGH|PARTIAL|NONE", "summary": "..."},
  "victim":         {"signal": "HIGH|PARTIAL|NONE", "summary": "..."}
}
"signal" must be exactly one of: HIGH, PARTIAL, NONE.
"summary" must be an empty string "" when signal is NONE.

For each vertex provide:
${SIGNAL_GUIDE}

Source:
${text}`;

const buildVertexPrompt = (vertex: DiamondVertex, text: string): string => {
  const instructions: Record<DiamondVertex, string> = {
    adversary: MUSTARD_ADVERSARY_INSTRUCTIONS,
    infrastructure: MUSTARD_INFRASTRUCTURE_INSTRUCTIONS,
    capability: MUSTARD_CAPABILITY_INSTRUCTIONS,
    victim: MUSTARD_VICTIM_INSTRUCTIONS,
  };

  return `${MUSTARD_PREAMBLE}

Summarize the following source focusing ONLY on the ${vertex.toUpperCase()} vertex of the Diamond Model of Intrusion Analysis.

${instructions[vertex]}

For this vertex provide:
${SIGNAL_GUIDE}

OUTPUT FORMAT — MANDATORY:
Respond with a JSON object only — no markdown, no text outside the JSON. Use exactly this structure:
{"signal": "HIGH|PARTIAL|NONE", "summary": "..."}
"signal" must be exactly one of: HIGH, PARTIAL, NONE.
"summary" must be an empty string "" when signal is NONE.

Source:
${text}`;
};

const diamondVertexSchema = z.object({
  signal: z.enum(['HIGH', 'PARTIAL', 'NONE']),
  summary: z.string(),
});

export const extractDiamondLlmOutputSchema = z.object({
  adversary: diamondVertexSchema,
  capability: diamondVertexSchema,
  infrastructure: diamondVertexSchema,
  victim: diamondVertexSchema,
});

type DiamondVertexResult = z.infer<typeof diamondVertexSchema>;
type DiamondLlmOutput = z.infer<typeof extractDiamondLlmOutputSchema>;

export type DiamondExtractionMode = 'single_call' | 'per_vertex_fallback';

export type DiamondSignal = 'HIGH' | 'PARTIAL' | 'NONE';

export interface ExtractDiamondParams {
  text: string;
  report_id?: string;
  traceBuilder?: CostTraceBuilder;
}

export interface ExtractDiamondResult {
  adversary: DiamondVertexResult;
  capability: DiamondVertexResult;
  infrastructure: DiamondVertexResult;
  victim: DiamondVertexResult;
  signal_count: number;
  model_id: string;
  extracted_at: string;
  extraction_mode: DiamondExtractionMode;
  report_id?: string;
}

const countNonNone = (output: DiamondLlmOutput): number =>
  VERTICES.filter((v) => output[v].signal !== 'NONE').length;

const NONE_VERTEX: DiamondVertexResult = { signal: 'NONE', summary: '' };

/**
 * Extract Diamond Model fields from a threat report using a single heavy LLM
 * call. On context-overflow or parse failure, falls back to four individual
 * per-vertex calls on the same model (`per_vertex_fallback`). Per-vertex
 * failures default to NONE rather than aborting the whole extraction.
 *
 * Takes a `ScopedModel` from `resolveScopedModel()` — does not construct its
 * own inference client.
 */
export const extractDiamond = async (
  model: ScopedModel,
  logger: Logger,
  params: ExtractDiamondParams
): Promise<ExtractDiamondResult> => {
  const { text, report_id: reportId, traceBuilder } = params;
  const truncated = text.slice(0, DIAMOND_BODY_CHAR_LIMIT);
  const modelId = model.connector.connectorId;
  const modelName =
    (model.connector.config?.model as string | undefined) ??
    (model.connector.config?.providerConfig as { model_id?: string } | undefined)?.model_id;
  const extractedAt = new Date().toISOString();

  interface RawResult<T> {
    raw: { response_metadata: Record<string, unknown> };
    parsed: T;
  }

  // Single heavy call — the normal path.
  try {
    const structured = model.chatModel.withStructuredOutput(extractDiamondLlmOutputSchema, {
      includeRaw: true,
    });
    const t0 = Date.now();
    const result = (await structured.invoke(
      buildSingleCallPrompt(truncated)
    )) as RawResult<DiamondLlmOutput>;
    const wallMs = Date.now() - t0;
    const output = result.parsed;

    logStageUsage(
      logger,
      'extract_diamond/single_call',
      modelId,
      result.raw.response_metadata ?? {}
    );
    traceBuilder?.addStage({
      stage: 'extract_diamond/single_call',
      connectorId: modelId,
      modelName,
      metadata: result.raw.response_metadata ?? {},
      wallMs,
    });
    logger.debug(
      `extract_diamond single_call ok signal_count=${countNonNone(output)} report_id=${reportId}`
    );

    return {
      adversary: output.adversary,
      capability: output.capability,
      infrastructure: output.infrastructure,
      victim: output.victim,
      signal_count: countNonNone(output),
      model_id: modelId,
      extracted_at: extractedAt,
      extraction_mode: 'single_call',
      ...(reportId ? { report_id: reportId } : {}),
    };
  } catch (singleCallErr) {
    logger.debug(
      `extract_diamond single call failed, falling back to per-vertex: ` +
        `${(singleCallErr as Error).message} report_id=${reportId}`
    );
  }

  // Per-vertex fallback on the same model — handles context overflow and
  // parse errors on the structured schema. Each vertex is attempted
  // independently; a per-vertex failure defaults to NONE rather than
  // aborting the whole extraction.
  const vertexStructured = model.chatModel.withStructuredOutput(diamondVertexSchema, {
    includeRaw: true,
  });
  const vertices: Record<DiamondVertex, DiamondVertexResult> = {
    adversary: NONE_VERTEX,
    capability: NONE_VERTEX,
    infrastructure: NONE_VERTEX,
    victim: NONE_VERTEX,
  };

  let fallbackInputTokens = 0;
  let fallbackOutputTokens = 0;
  const fallbackT0 = Date.now();
  for (const vertex of VERTICES) {
    try {
      const vertexResult = (await vertexStructured.invoke(
        buildVertexPrompt(vertex, truncated)
      )) as RawResult<DiamondVertexResult>;
      vertices[vertex] = vertexResult.parsed;
      const usage = extractUsageFromMetadata(vertexResult.raw.response_metadata ?? {});
      fallbackInputTokens += usage.inputTokens;
      fallbackOutputTokens += usage.outputTokens;
    } catch (vertexErr) {
      logger.debug(
        `extract_diamond per-vertex ${vertex} failed: ` +
          `${(vertexErr as Error).message} report_id=${reportId}`
      );
    }
  }
  const fallbackWallMs = Date.now() - fallbackT0;
  const fallbackMetadata = {
    usage: { input_tokens: fallbackInputTokens, output_tokens: fallbackOutputTokens },
  };

  logStageUsage(logger, 'extract_diamond/per_vertex_fallback', modelId, fallbackMetadata);
  traceBuilder?.addStage({
    stage: 'extract_diamond/per_vertex_fallback',
    connectorId: modelId,
    modelName,
    metadata: fallbackMetadata,
    wallMs: fallbackWallMs,
  });

  const fallbackOutput: DiamondLlmOutput = vertices;
  logger.debug(
    `extract_diamond per_vertex_fallback signal_count=${countNonNone(
      fallbackOutput
    )} report_id=${reportId}`
  );

  return {
    ...vertices,
    signal_count: countNonNone(fallbackOutput),
    model_id: modelId,
    extracted_at: extractedAt,
    extraction_mode: 'per_vertex_fallback',
    ...(reportId ? { report_id: reportId } : {}),
  };
};
