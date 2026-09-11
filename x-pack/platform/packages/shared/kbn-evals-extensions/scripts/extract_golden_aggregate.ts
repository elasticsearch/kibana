/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Extract a pre-aggregated `AggregatedModelScores[]` straight from the golden
 * cluster, for `render_from_golden.ts` to consume.
 *
 * The golden cluster runs with `xpack.evals.enabled=false`, so the normal
 * `evals ext matrix` CLI cannot read it through the plugin API. This reads the
 * score documents directly and shapes them exactly like the CLI's aggregation
 * step, so the renderer downstream is byte-identical either way.
 *
 * This exists as a committed script rather than a one-off because the published
 * board is otherwise unreproducible: without it, regenerating requires
 * reinventing the extraction, and the artifact's provenance cannot be checked
 * against the data it claims to summarise.
 *
 * Scoring policy:
 *   Applies the CLI transport's policy -- verdict ladder, EIS-only judges, no
 *   self-judged scores -- through the shared `scoring_policy` module, so this
 *   driver and `queryMatrixScores` cannot drift.
 *
 *   SCORING_POLICY=raw returns unfiltered stored scores (debugging only).
 *
 *   Applying the policy does NOT reproduce the 2026-09-07 board: measured mean
 *   |delta| per cell moved 1.998 -> 2.361. The residual is judge mix. That
 *   artifact declares `judgeModelId: google-gemini-3.1-pro`, but golden shows
 *   its persona scores were graded 3842 by claude-4.5-haiku, 2122 by
 *   claude-4.6-sonnet and only 420 by gemini-3.1-pro -- it is a mixed-judge
 *   aggregate labelled single-judge. JUDGE_MODEL_ID pins one grader, which is
 *   the honest shape, but it will not match that board.
 *
 * Usage:
 *   source ~/.elastic/golden-cluster-env.sh
 *   node --require ../../../../../src/setup_node_env \
 *     scripts/extract_golden_aggregate.ts > /tmp/aggregated.json
 */

import fs from 'fs';

import {
  applyScoringPolicy,
  emptyExclusionCounts,
  tallyRejection,
} from '../src/matrix/scoring_policy';
import { DEFAULT_EXCLUDED_EVALUATORS } from '../src/matrix/load_matrix_config';

const ES_URL = process.env.GOLDEN_ES_URL!;
const ES_KEY = process.env.GOLDEN_ES_API_KEY!;
const SINCE = process.env.SINCE ?? '2026-09-01';
const OUT = process.env.OUT_JSON;
// Mirror the CLI's scoring policy by default; SCORING_POLICY=raw opts out.
const POLICY_RAW = process.env.SCORING_POLICY === 'raw';
// Pin the grader. Unpinned, a cell averages every judge that ever graded it,
// which compares models across different grader panels -- and judge choice
// reorders this board more than model quality does (Spearman rho 0.55).
const JUDGE_MODEL_ID = process.env.JUDGE_MODEL_ID;
const POLICY = POLICY_RAW
  ? {}
  : { useVerdictLadder: true, requireEisJudge: true, excludeSelfJudged: true };
const isExcludedName = (name: string) =>
  DEFAULT_EXCLUDED_EVALUATORS.some((p) => name.startsWith(p));
const policyExclusions = emptyExclusionCounts();

if (!ES_URL || !ES_KEY) {
  throw new Error('GOLDEN_ES_URL and GOLDEN_ES_API_KEY must be set (source golden-cluster-env.sh)');
}

/** Suites that make up the published board, mapped to their experiment_name. */
const SUITES: Array<{ suiteId: string; experimentNamePattern: string }> = [
  { suiteId: 'security-persona-matrix', experimentNamePattern: '*persona-matrix*' },
  {
    suiteId: 'attack-discovery-agent-builder',
    experimentNamePattern: 'attack-discovery-agent-builder*',
  },
  {
    suiteId: 'automatic-migrations',
    experimentNamePattern: 'agent builder: automatic-migration*',
  },
];

interface ScoreDoc {
  experiment_id: string;
  experiment_name: string;
  '@timestamp': string;
  example?: { id?: string; dataset?: { id?: string; name?: string } };
  task?: { model?: { id?: string; family?: string; provider?: string } };
  evaluator?: {
    name?: string;
    score?: number;
    label?: string;
    direction?: string;
    metadata?: unknown;
    model?: { id?: string };
  };
}

const search = async (body: unknown): Promise<{ hits: { hits: Array<{ _source: ScoreDoc }> } }> => {
  const response = await fetch(`${ES_URL.replace(/\/$/, '')}/.ds-.evaluation-scores*/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `ApiKey ${ES_KEY}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`ES search failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as { hits: { hits: Array<{ _source: ScoreDoc }> } };
};

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * The two suite shapes key their columns differently, and neither field alone
 * works for both:
 *   - persona matrix: `example.id` IS the column key ('alert-analysis-a'), while
 *     `example.dataset.id` is one UUID shared by every column.
 *   - attack-discovery / automatic-migrations: `example.id` is a bare ordinal
 *     ('0') that collapses all columns into one bucket, while
 *     `example.dataset.id` is per-scenario.
 * So prefer a semantic example id and fall back to the dataset id.
 */
function columnKey(doc: ScoreDoc): string {
  const exampleId = doc.example?.id;
  const semantic = exampleId && !/^\d+$/.test(exampleId) ? exampleId : undefined;
  return semantic ?? doc.example?.dataset?.id ?? exampleId ?? 'unknown';
}

async function main() {
  // modelId -> suiteId -> docs
  const byModel = new Map<string, Map<string, ScoreDoc[]>>();

  for (const suite of SUITES) {
    let searchAfter: unknown[] | undefined;
    let fetched = 0;
    // Page rather than size-capping: a truncated read silently drops whole
    // models and the board renders as if they never ran.
    for (;;) {
      const page: any = await search({
        size: 5000,
        // Each score doc carries the model's full transcript under
        // `task.output`. Pulling whole `_source` makes the reader hold every
        // transcript on the board in memory at once (observed: ~2GB RSS and no
        // forward progress). None of it is aggregated here, so ask ES for the
        // fields this actually reads.
        _source: [
          'experiment_id',
          'experiment_name',
          '@timestamp',
          'example.id',
          'example.dataset.id',
          'example.dataset.name',
          'task.model.id',
          'task.model.family',
          'task.model.provider',
          'evaluator.name',
          'evaluator.score',
          'evaluator.model.id',
          // Needed by the shared scoring policy (verdict ladder + provenance
          // filters). Without these the golden driver silently disagreed
          // with the CLI-rendered board by ~2 points per cell.
          'evaluator.label',
          'evaluator.direction',
          'evaluator.metadata',
        ],
        sort: [{ '@timestamp': 'asc' }, { _doc: 'asc' }],
        ...(searchAfter ? { search_after: searchAfter } : {}),
        query: {
          bool: {
            must: [
              { wildcard: { experiment_name: { value: suite.experimentNamePattern } } },
              { range: { '@timestamp': { gte: SINCE } } },
              { exists: { field: 'evaluator.score' } },
            ],
          },
        },
      });

      const hits = page.hits.hits as Array<{ _source: ScoreDoc; sort: unknown[] }>;
      if (hits.length === 0) break;

      for (const hit of hits) {
        const doc = hit._source;
        const modelId = doc.task?.model?.id;
        if (!modelId) continue;
        if (!byModel.has(modelId)) byModel.set(modelId, new Map());
        const suites = byModel.get(modelId)!;
        if (!suites.has(suite.suiteId)) suites.set(suite.suiteId, []);
        suites.get(suite.suiteId)!.push(doc);
      }

      searchAfter = hits[hits.length - 1].sort;
      fetched += hits.length;
      // Progress on stderr: a silent multi-minute read is indistinguishable
      // from a hang, and this reads tens of thousands of documents.
      // eslint-disable-next-line no-console
      console.error(`[${suite.suiteId}] fetched ${fetched} score doc(s)`);
      if (hits.length < 5000) break;
    }
  }

  const aggregated = [...byModel.entries()].map(([modelId, suiteDocs]) => {
    const suites = [...suiteDocs.entries()].map(([suiteId, docs]) => {
      // Newest experiment wins, but PER COLUMN, not per suite. Persona runs all
      // of its columns inside one experiment, so a suite-wide filter is
      // harmless there. Attack-discovery runs each of its nine slices as its
      // own experiment, so a suite-wide filter keeps one slice and silently
      // discards the other eight -- which is what made AD read as a
      // single-dataset, one-observation column.
      const newestExperiment = docs.reduce((latest, d) =>
        d['@timestamp'] > latest['@timestamp'] ? d : latest
      );
      const newestByColumn = new Map<string, ScoreDoc>();
      for (const doc of docs) {
        const key = columnKey(doc);
        const seen = newestByColumn.get(key);
        if (!seen || doc['@timestamp'] > seen['@timestamp']) newestByColumn.set(key, doc);
      }
      const selected = docs.filter(
        (d) => d.experiment_id === newestByColumn.get(columnKey(d))?.experiment_id
      );

      // The two suite shapes key their columns differently, and neither field
      // alone works for both:
      //   - persona matrix: `example.id` IS the column key ('alert-analysis-a'),
      //     while `example.dataset.id` is one UUID shared by every column.
      //   - attack-discovery / automatic-migrations: `example.id` is a bare
      //     ordinal ('0') that collapses all columns into one bucket, while
      //     `example.dataset.id` is per-scenario.
      // So prefer a semantic example id and fall back to the dataset id when it
      // is a bare ordinal. `datasetName` is carried through either way, since it
      // is the only human-readable key for the UUID-addressed suites.
      const byDataset = new Map<string, ScoreDoc[]>();
      for (const doc of selected) {
        const datasetId = columnKey(doc);
        if (!byDataset.has(datasetId)) byDataset.set(datasetId, []);
        byDataset.get(datasetId)!.push(doc);
      }

      // Columns match either by `datasetIds` (raw id) or by `examplePrefixes`,
      // which build_matrix resolves against SYNTHETIC `prefix:<name>` dataset
      // ids. The CLI mints those in queryMatrixScores; this driver bypasses
      // that transport, so an examplePrefixes config used to match nothing and
      // still render exit-0 with zero warnings (measured: covered 1 of 24).
      // Emit both keys so either config shape resolves.
      interface DatasetRow {
        datasetId: string;
        datasetName: string;
        evaluators: unknown[];
      }
      const withPrefixAliases = (rows: DatasetRow[]): DatasetRow[] =>
        rows.flatMap((row: DatasetRow) =>
          String(row.datasetId).startsWith('prefix:')
            ? [row]
            : [row, { ...row, datasetId: `prefix:${row.datasetId}` }]
        );

      const datasets = [...byDataset.entries()].map(([datasetId, datasetDocs]) => {
        const byEvaluator = new Map<string, number[]>();
        for (const doc of datasetDocs) {
          const name = doc.evaluator?.name;
          if (!name) continue;
          if (JUDGE_MODEL_ID && doc.evaluator?.model?.id !== JUDGE_MODEL_ID) {
            continue;
          }
          // Single source of truth with query_matrix_scores: the CLI and this
          // driver must reach the same verdict on the same document.
          const decision = applyScoringPolicy(doc, POLICY, isExcludedName);
          if (decision.score === null) {
            tallyRejection(policyExclusions, decision.rejected);
            continue;
          }
          if (!byEvaluator.has(name)) byEvaluator.set(name, []);
          byEvaluator.get(name)!.push(decision.score);
        }
        return {
          datasetId,
          datasetName: datasetDocs[0].example?.dataset?.name ?? datasetId,
          evaluators: [...byEvaluator.entries()].map(([evaluatorName, scores]) => ({
            evaluatorName,
            mean: mean(scores),
            count: scores.length,
            min: Math.min(...scores),
            max: Math.max(...scores),
          })),
        };
      });

      // The judge that actually graded the selected run -- carried so the
      // artifact's provenance can be derived instead of asserted. A suite whose
      // columns ran as separate experiments can carry more than one judge, so
      // the full set is reported rather than whichever document sorted first:
      // silently publishing one of several judges is how a mixed column reads
      // as a unified one.
      const judgeModelIds = [
        ...new Set(selected.map((d) => d.evaluator?.model?.id).filter(Boolean)),
      ] as string[];
      const judgeModelId = judgeModelIds.length === 1 ? judgeModelIds[0] : undefined;

      return {
        suiteId,
        experimentId: newestExperiment.experiment_id,
        timestamp: newestExperiment['@timestamp'],
        judgeModelId,
        judgeModelIds,
        selfJudged: judgeModelIds.includes(modelId),
        datasets: withPrefixAliases(datasets),
      };
    });

    return {
      modelId,
      family: suiteDocs.values().next().value?.[0]?.task?.model?.family,
      provider: suiteDocs.values().next().value?.[0]?.task?.model?.provider,
      suites,
    };
  });

  const json = JSON.stringify(aggregated, null, 2);
  if (OUT) {
    fs.writeFileSync(OUT, json);
    // Sidecar rather than a wrapper object: the artifact must stay a bare
    // `AggregatedModelScores[]` for existing readers. render_from_golden reads
    // this stamp to tell a policy-applied extract from a pre-port one.
    fs.writeFileSync(
      `${OUT}.policy.json`,
      JSON.stringify(
        {
          scoringPolicy: POLICY,
          judgeModelId: JUDGE_MODEL_ID ?? null,
          excludedEvaluators: DEFAULT_EXCLUDED_EVALUATORS,
          exclusions: policyExclusions,
        },
        null,
        2
      )
    );
    // eslint-disable-next-line no-console
    console.error(
      `policy exclusions: ${JSON.stringify(policyExclusions)} (policy=${
        POLICY_RAW ? 'raw' : 'default'
      })`
    );
    // eslint-disable-next-line no-console
    console.error(`wrote ${aggregated.length} model(s) to ${OUT}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(json);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
