/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_JOIN_FIELD } from './reference_adapters';

/**
 * The subset of a golden score document the replay path reads. Only the fields
 * a judge needs are modelled; everything else on the doc is ignored.
 */
export interface RawScoreDoc {
  metadata?: { execution_id?: string; suite_id?: string };
  task?: {
    model?: { id?: string };
    output?: { messages?: Array<{ message?: { content?: unknown } }> };
  };
  example?: {
    id?: string;
    input?: { question?: string };
    metadata?: Record<string, unknown>;
  };
}

const SCORES_INDEX = '.ds-.evaluation-scores*';
// One collapsed hit per execution. The published matrix spans ~20 models, and
// an unscoped suite query matches ~155 historical executions whose task.output
// payloads total ~7 MB per example (~56 min for 21 examples). Callers scope by
// execution id or model, so this only has to bound a pathological request.
const PAGE_SIZE = 200;
// Evaluator count per (execution, example) group. A suite writes one document
// per evaluator (~15 today); 50 leaves headroom without pulling whole runs.
const MEMBERS_PER_EXECUTION = 50;

const SOURCE_FIELDS = [
  'metadata.execution_id',
  'metadata.suite_id',
  'task.model.id',
  'task.output',
  'example.id',
  'example.metadata',
  'example.input',
];

/**
 * True when a document carries a payload some jury can grade.
 *
 * Kept deliberately structural rather than suite-aware: the fetch layer only
 * has to prefer a document with content over an empty sibling, and the jury
 * decides whether that content is actually gradable.
 */
const hasGradablePayload = (doc: RawScoreDoc): boolean => {
  const output = (doc as { task?: { output?: Record<string, unknown> } }).task?.output;
  if (!output) {
    return false;
  }
  const messages = output.messages;
  const insights = output.insights;
  return (
    (Array.isArray(messages) && messages.length > 0) ||
    (Array.isArray(insights) && insights.length > 0)
  );
};

/**
 * Reads score documents directly from Elasticsearch.
 *
 * The golden cluster archives evaluation scores but does not run the evals
 * plugin, so `/internal/evals/*` answers 400 there. Replay therefore talks to
 * the index the sweeps write to. `task.output` is in `_source` but is NOT
 * indexed, so it can be read but never filtered on.
 */
export const fetchScoreDocs = async ({
  esUrl,
  apiKey,
  exampleIds,
  joinField = DEFAULT_JOIN_FIELD,
  executionIds,
  modelIds,
  configModelIds,
  suiteIds,
  asOf,
}: {
  esUrl: string;
  apiKey: string;
  exampleIds: string[];
  /**
   * Golden field the reference keys correspond to. attack-discovery stores
   * `example.id = '0'` on every document, so filtering that field there returns
   * one scenario's documents and silently drops the other eight.
   */
  joinField?: string;
  executionIds?: string[];
  modelIds?: string[];
  configModelIds?: string[];
  suiteIds?: string[];
  asOf?: number;
}): Promise<RawScoreDoc[]> => {
  const filter: unknown[] = [];

  // Without a suite filter the query scans every suite ever archived (~2M docs
  // on the golden cluster) and never returns.
  if (suiteIds?.length) {
    filter.push({ terms: { 'metadata.suite_id': suiteIds } });
  }

  if (asOf) {
    filter.push({ range: { '@timestamp': { lt: new Date(asOf).toISOString() } } });
  }

  if (executionIds?.length) {
    filter.push({ terms: { 'metadata.execution_id': executionIds } });
  }

  const models = modelIds?.length ? modelIds : configModelIds;
  if (models?.length) {
    filter.push({ terms: { 'task.model.id': models } });
  }

  // Refuse an unbounded archive read. Without a model or execution scope this
  // matches every historical run of the suite, which is minutes of transfer and
  // almost never what the caller meant.
  if (!executionIds?.length && !models?.length) {
    throw new Error(
      'fetchScoreDocs requires --execution-id or --models (or a config model list): ' +
        'an unscoped query reads every archived run of the suite.'
    );
  }

  // A suite re-runs the same example across many executions, and golden keeps
  // every one. Collapsing documents by execution returns whichever run the
  // first page happened to hit, which is frequently an archived run that
  // pre-dates trajectory capture -- so newer, gradable runs never surface.
  // Resolve the newest execution per (model, example) first, then fetch only
  // those executions.
  const effectiveExecutionIds =
    executionIds?.length && executionIds.length > 0
      ? executionIds
      : await resolveLatestExecutions({
          esUrl,
          apiKey,
          exampleIds,
          joinField,
          modelIds: models,
          suiteIds,
        });

  if (effectiveExecutionIds.length === 0) {
    return [];
  }

  filter.push({ terms: { 'metadata.execution_id': effectiveExecutionIds } });

  // One request per example, collapsed to one document per execution.
  //
  // A trajectory is stored once per evaluator (~15 docs), so scrolling the raw
  // index reads ~42k documents to recover ~2.8k trajectories and takes minutes.
  // `collapse` makes Elasticsearch return the single representative document
  // the judge needs, which is both correct and ~100x cheaper.
  const docs: RawScoreDoc[] = [];

  for (const exampleId of exampleIds) {
    const response = await fetch(`${esUrl.replace(/\/$/, '')}/${SCORES_INDEX}/_search`, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        size: PAGE_SIZE,
        track_total_hits: false,
        query: { bool: { filter: [...filter, { term: { [joinField]: exampleId } }] } },
        // A trajectory is written once per evaluator, and only some of those
        // documents carry the graded payload (`task.output.messages` for prose
        // suites, `task.output.insights` for attack discovery). `collapse`
        // alone returns an arbitrary member of the group, so it frequently
        // picked a payload-less document and the cell looked unreplayable.
        // Pull a window of the group and choose a gradable member below.
        collapse: {
          field: 'metadata.execution_id',
          inner_hits: {
            name: 'members',
            size: MEMBERS_PER_EXECUTION,
            _source: SOURCE_FIELDS,
          },
        },
        _source: SOURCE_FIELDS,
      }),
    });

    if (!response.ok) {
      throw new Error(`Score query failed: ${response.status} ${await response.text()}`);
    }

    const parsed = (await response.json()) as {
      hits?: {
        hits?: Array<{
          _source?: RawScoreDoc;
          inner_hits?: { members?: { hits?: { hits?: Array<{ _source?: RawScoreDoc }> } } };
        }>;
      };
    };

    for (const hit of parsed.hits?.hits ?? []) {
      // Prefer a group member that actually carries the graded payload; fall
      // back to the collapse representative so behaviour is unchanged for
      // groups where no member has one.
      const members = (hit.inner_hits?.members?.hits?.hits ?? [])
        .map((member) => member._source)
        .filter((source): source is RawScoreDoc => Boolean(source));

      const chosen = members.find(hasGradablePayload) ?? hit._source;
      if (chosen) {
        docs.push(chosen);
      }
    }
  }

  return docs;
};

/**
 * Maps each (model, example) to its newest execution.
 *
 * Runs the per-example aggregation one example at a time, mirroring the
 * document fetch, so a wide example set costs no more than the fetch that
 * follows it.
 */
async function resolveLatestExecutions({
  esUrl,
  apiKey,
  exampleIds,
  joinField = DEFAULT_JOIN_FIELD,
  modelIds,
  suiteIds,
}: {
  esUrl: string;
  apiKey: string;
  exampleIds: string[];
  joinField?: string;
  modelIds?: string[];
  suiteIds?: string[];
}): Promise<string[]> {
  const indexUrl = `${esUrl.replace(/\/$/, '')}/${SCORES_INDEX}/_search`;
  const chosen = new Set<string>();

  const filter: unknown[] = [];
  if (suiteIds?.length) {
    filter.push({ terms: { 'metadata.suite_id': suiteIds } });
  }
  if (modelIds?.length) {
    filter.push({ terms: { 'task.model.id': modelIds } });
  }

  for (const exampleId of exampleIds) {
    const response = await fetch(indexUrl, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${apiKey}`,
        'Content-Type': 'application/json',
        'x-fleet-interaction': 'true',
      },
      body: JSON.stringify({
        size: 0,
        query: { bool: { filter: [...filter, { term: { [joinField]: exampleId } }] } },
        aggs: {
          by_model: {
            terms: { field: 'task.model.id', size: 50 },
            aggs: {
              latest: {
                top_hits: {
                  size: 1,
                  sort: [{ '@timestamp': { order: 'desc' } }],
                  _source: ['metadata.execution_id'],
                },
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `resolveLatestExecutions failed for example ${exampleId}: ${response.status} ${response.statusText}`
      );
    }

    const parsed = (await response.json()) as {
      aggregations?: {
        by_model?: {
          buckets?: Array<{
            latest?: {
              hits?: { hits?: Array<{ _source?: { metadata?: { execution_id?: string } } }> };
            };
          }>;
        };
      };
    };

    for (const bucket of parsed.aggregations?.by_model?.buckets ?? []) {
      const executionId = bucket.latest?.hits?.hits?.[0]?._source?.metadata?.execution_id;
      if (executionId) {
        chosen.add(executionId);
      }
    }
  }

  return [...chosen];
}
