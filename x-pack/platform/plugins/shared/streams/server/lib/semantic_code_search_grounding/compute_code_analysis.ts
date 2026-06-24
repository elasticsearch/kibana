/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { ToolsStart } from '@kbn/agent-builder-server';
import type { ComputedFeatureProvider } from '@kbn/streams-ai';
import { getSigEventsLogPatternsEsql } from '@kbn/ai-tools';
import { createTracedEsClient } from '@kbn/traced-es-client';
import {
  formatToolResults,
  type BridgedToolResponse,
} from '../agent_builder/inference_tool_bridge';
import {
  SCS_LIST_REPOS_TOOL_ID,
  SCS_LIST_INDICES_TOOL_ID,
  SCS_SEMANTIC_SEARCH_TOOL_ID,
} from './semantic_code_search_tools';

const LOG_MESSAGE_FIELDS = ['message', 'body.text'];

/** Max distinctive log strings used to select and verify against code. */
const MAX_DISTINCTIVE_STRINGS = 12;
/** Minimum verified strings required to emit a feature. */
const MIN_VERIFIED_STRINGS = 1;
/** Max evidence/snippet entries kept on the feature. */
const MAX_EVIDENCE = 20;
/** Snippet length cap kept on evidence entries. */
const MAX_SNIPPET_LENGTH = 200;

/**
 * Outcome surfaced to the caller (telemetry) describing what the provider did.
 */
export interface CodeAnalysisOutcome {
  status: 'feature' | 'no_match' | 'no_candidates' | 'no_strings' | 'unavailable';
  repository?: string;
  candidateCount: number;
  verifiedCount: number;
}

export interface CodeAnalysisProviderDeps {
  agentBuilderTools: ToolsStart;
  request: KibanaRequest;
  /**
   * Optional hook invoked once per run with the outcome, so callers can emit
   * telemetry (whether or not a feature was produced).
   */
  onOutcome?: (outcome: CodeAnalysisOutcome) => void;
}

interface CodeHit {
  file: string;
  line?: number;
  snippet: string;
}

interface Candidate {
  repository?: string;
  index?: string;
  label: string;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const truncate = (value: string): string =>
  value.length > MAX_SNIPPET_LENGTH ? `${value.slice(0, MAX_SNIPPET_LENGTH)}…` : value;

const normalize = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * SCS workflow tools render their result as a single Markdown string that
 * Agent Builder exposes at `data.execution.output` (see the `console` step in
 * each scs workflow.yaml). Concatenate that text across results.
 */
const getOutputText = (response: BridgedToolResponse): string =>
  response.results
    .map(({ data }) => {
      const execution = asRecord(asRecord(data).execution);
      return typeof execution.output === 'string' ? execution.output : '';
    })
    .filter((text) => text.length > 0)
    .join('\n');

const CODE_FENCE = '```';

// Each hit rendered by `scs.semantic_search` looks like:
//   **File**: `path/to/file.go:42-58`
//   **Score**: 1.2 | **Type**: ... | **Language**: ...
//   <fenced code block with up to 5 content lines>
const HIT_RE = new RegExp(
  '\\*\\*File\\*\\*:\\s*`([^`]+)`[\\s\\S]*?' + CODE_FENCE + '[^\\n]*\\n([\\s\\S]*?)' + CODE_FENCE,
  'g'
);
const FILE_LOCATION_RE = /^(.*):(\d+)-\d+$/;

/** Parse code hits from the `scs.semantic_search` Markdown output. */
const extractHits = (markdown: string): CodeHit[] => {
  const hits: CodeHit[] = [];
  let match: RegExpExecArray | null;
  HIT_RE.lastIndex = 0;
  while ((match = HIT_RE.exec(markdown)) !== null) {
    const [, fileLocation, snippet] = match;
    const locationMatch = FILE_LOCATION_RE.exec(fileLocation.trim());
    const file = (locationMatch ? locationMatch[1] : fileLocation).trim();
    const startLine = locationMatch ? Number(locationMatch[2]) : 0;
    hits.push({
      file,
      line: startLine > 0 ? startLine : undefined,
      snippet: snippet.trim(),
    });
  }
  return hits;
};

// `scs.list_indices` (and the future `scs.list_repos`) render each codebase as a
// bullet: `- \`code-acme_checkout\` (123 docs, 4.5mb)`. An entry containing a
// "/" is an `owner/repo` repository; otherwise it is an index name.
const CANDIDATE_RE = /^- `([^`]+)`/gm;

/** Parse candidate codebases from the `scs.list_*` Markdown output. */
const extractCandidates = (markdown: string): Candidate[] => {
  const candidates: Candidate[] = [];
  let match: RegExpExecArray | null;
  CANDIDATE_RE.lastIndex = 0;
  while ((match = CANDIDATE_RE.exec(markdown)) !== null) {
    const label = match[1].trim();
    candidates.push(label.includes('/') ? { repository: label, label } : { index: label, label });
  }
  return candidates;
};

export const createCodeAnalysisProvider = ({
  agentBuilderTools,
  request,
  onOutcome,
}: CodeAnalysisProviderDeps): ComputedFeatureProvider => {
  return async ({ stream, start, end, esClient, logger }) => {
    const emit = (outcome: CodeAnalysisOutcome) => {
      try {
        onOutcome?.(outcome);
      } catch (error) {
        logger.debug(
          `code_analysis: onOutcome hook failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    };

    const execute = async (
      toolId: string,
      toolParams: Record<string, unknown>
    ): Promise<BridgedToolResponse | undefined> => {
      try {
        const { results } = await agentBuilderTools.execute({ toolId, toolParams, request });
        return formatToolResults(results);
      } catch (error) {
        logger.debug(
          `code_analysis: SCS tool "${toolId}" failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return undefined;
      }
    };

    // 1. Distinctive strings actually present in the logs (selection + the data
    //    side of the intersection that kills "in code but never in data" queries).
    const tracedClient = createTracedEsClient({ client: esClient, logger, plugin: 'streams' });
    let distinctiveStrings: string[] = [];
    try {
      const patterns = await getSigEventsLogPatternsEsql({
        esClient: tracedClient,
        index: stream.name,
        start,
        end,
        fields: LOG_MESSAGE_FIELDS,
        logger,
      });
      distinctiveStrings = patterns
        .map(({ sample }) => sample)
        .filter((sample): sample is string => typeof sample === 'string' && sample.length > 0)
        .slice(0, MAX_DISTINCTIVE_STRINGS);
    } catch (error) {
      logger.debug(
        `code_analysis: failed to sample distinctive log strings: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (distinctiveStrings.length === 0) {
      logger.debug(
        `code_analysis: no distinctive log strings for stream "${stream.name}"; skipping`
      );
      emit({ status: 'no_strings', candidateCount: 0, verifiedCount: 0 });
      return undefined;
    }

    // 2. Enumerate candidate repositories (repository surface first, index fallback).
    const reposResponse =
      (await execute(SCS_LIST_REPOS_TOOL_ID, {})) ?? (await execute(SCS_LIST_INDICES_TOOL_ID, {}));

    if (!reposResponse) {
      logger.debug('code_analysis: SCS list tools unavailable; skipping (grounding inactive)');
      emit({ status: 'unavailable', candidateCount: 0, verifiedCount: 0 });
      return undefined;
    }

    const candidates = extractCandidates(getOutputText(reposResponse));
    if (candidates.length === 0) {
      logger.debug('code_analysis: no candidate code repositories found; skipping');
      emit({ status: 'no_candidates', candidateCount: 0, verifiedCount: 0 });
      return undefined;
    }

    // 3. Score each candidate by how well the stream's distinctive strings match
    //    its code, selecting the repository with the most verified strings.
    const query = distinctiveStrings.join('\n');
    const normalizedStrings = distinctiveStrings.map((value) => ({
      raw: value,
      normalized: normalize(value),
    }));

    let best:
      | {
          candidate: Candidate;
          verified: Set<string>;
          evidence: string[];
          hits: CodeHit[];
          verifiedHitIndices: Set<number>;
        }
      | undefined;

    for (const candidate of candidates) {
      const response = await execute(SCS_SEMANTIC_SEARCH_TOOL_ID, {
        query,
        ...(candidate.repository ? { repository: candidate.repository } : {}),
        ...(candidate.index ? { index: candidate.index } : {}),
      });
      if (!response) {
        continue;
      }

      const hits = extractHits(getOutputText(response));
      const verified = new Set<string>();
      const verifiedHitIndices = new Set<number>();
      const evidence: string[] = [];

      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const normalizedSnippet = normalize(hit.snippet);
        for (const { raw, normalized: normalizedString } of normalizedStrings) {
          if (normalizedString.length > 0 && normalizedSnippet.includes(normalizedString)) {
            if (!verified.has(raw) && evidence.length < MAX_EVIDENCE) {
              const location = hit.line !== undefined ? `${hit.file}:${hit.line}` : hit.file;
              evidence.push(`code: ${location} ${truncate(hit.snippet)}`);
            }
            verified.add(raw);
            verifiedHitIndices.add(i);
          }
        }
      }

      if (verified.size > (best?.verified.size ?? 0)) {
        best = { candidate, verified, evidence, hits, verifiedHitIndices };
      }
    }

    if (!best || best.verified.size < MIN_VERIFIED_STRINGS) {
      logger.debug(
        `code_analysis: no candidate repository verified enough log strings for stream "${stream.name}"; skipping`
      );
      emit({ status: 'no_match', candidateCount: candidates.length, verifiedCount: 0 });
      return undefined;
    }

    const repository = best.candidate.repository ?? best.candidate.index ?? best.candidate.label;
    logger.debug(
      `code_analysis: selected "${repository}" for stream "${stream.name}" (${best.verified.size} verified strings)`
    );

    emit({
      status: 'feature',
      repository,
      candidateCount: candidates.length,
      verifiedCount: best.verified.size,
    });

    const codeContext = best.hits
      .filter((_, i) => !best!.verifiedHitIndices.has(i))
      .slice(0, MAX_EVIDENCE)
      .map((hit) => {
        const location = hit.line !== undefined ? `${hit.file}:${hit.line}` : hit.file;
        return `code: ${location} ${truncate(hit.snippet)}`;
      });

    return {
      repository,
      verified_strings: Array.from(best.verified),
      evidence: best.evidence,
      code_context: codeContext,
    };
  };
};
