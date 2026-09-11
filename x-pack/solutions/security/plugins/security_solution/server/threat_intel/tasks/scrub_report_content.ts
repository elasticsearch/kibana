/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { CoreSetup, Logger } from '@kbn/core/server';
import {
  TaskCost,
  type TaskManagerSetupContract,
  type TaskManagerStartContract,
  type RunContext,
  throwRetryableError,
} from '@kbn/task-manager-plugin/server';
import { THREAT_REPORTS_INDEX_PATTERN } from '../../../common/threat_intel';
import { HIDDEN_INDEX_SEARCH_OPTIONS } from '../lib/es_options';
import { isTransientEsStatus } from '../lib/es_retry';

export const SCRUB_REPORT_CONTENT_TASK_TYPE = 'threat_intel:scrub_report_content';
export const SCRUB_REPORT_CONTENT_TASK_ID = 'threat_intel:scrub_report_content:default';

const DEFAULT_INTERVAL = '24h';
const TASK_TIMEOUT = '10m';

/**
 * Retention window for the untrusted part of a report. Enrichment and evidence
 * fields are deliberately kept past this point: they drive ranking
 * and hunt cooldown, and they are our own derived data rather than fetched
 * third-party content.
 */
export const CONTENT_RETENTION_DAYS = 30;

/** Bounded so one run cannot rewrite the whole index in a single request. */
const MAX_DOCS_PER_RUN = 5_000;

/**
 * `lineage.extraction_method` values that mean enrichment has not run yet, so the
 * report body is still the only input it will ever have.
 *
 * Scrubbing one of these is unrecoverable: every enrichment route requires a
 * non-empty `text`, so once the body is gone the report can never be enriched, and
 * `load_pending_reports` keeps picking it up and failing. Thirty days of backlog is
 * not exotic either. An inference outage, a deployment with no model configured, or
 * simply more reports than the 4h workflow drains all get there.
 */
const UNENRICHED_EXTRACTION_METHODS = ['pending'] as const;

/**
 * Fields holding fetched third-party content. `body_text` is `semantic_text`, so
 * clearing it also drops its generated embedding. `content.title` is deliberately
 * retained: it is also `semantic_text`, but a scrubbed report still has to be
 * identifiable in report lists and hunt results.
 */
const SCRUBBED_FIELDS = ['content.body_text', 'content.body_text_bm25'] as const;

/**
 * Removes the report body rather than nulling it: `semantic_text` rejects an
 * explicit null, and a removed field also frees the embedding.
 */
const SCRUB_SCRIPT = `
${SCRUBBED_FIELDS.map((field) => {
  const [parent, leaf] = field.split('.');
  return `if (ctx._source.${parent} != null) { ctx._source.${parent}.remove('${leaf}'); }`;
}).join('\n')}
if (ctx._source.lineage == null) { ctx._source.lineage = [:]; }
ctx._source.lineage.content_scrubbed_at = params.now;
`.trim();

const stateSchemaV1 = schema.object({
  lastRunAt: schema.maybe(schema.string()),
  totalReportsScrubbed: schema.maybe(schema.number()),
});

/**
 * v2 adds `totalReportsFailed`. `update_by_query` reports per-document failures
 * in `failures[]` while still returning a 200 and an `updated` count, so a run
 * that failed on every document used to return `updated: 0` and look exactly
 * like a clean "nothing to scrub" no-op. These are untrusted third-party bodies
 * outliving their retention window, so the failure needs a standing signal
 * rather than one log line.
 *
 * Never edit a published version in place; add the next one. See
 * https://github.com/elastic/kibana/issues/155764.
 */
const stateSchemaV2 = schema.object({
  lastRunAt: schema.maybe(schema.string()),
  totalReportsScrubbed: schema.maybe(schema.number()),
  totalReportsFailed: schema.maybe(schema.number()),
});

interface ScrubReportContentState {
  [key: string]: unknown;
  lastRunAt?: string;
  totalReportsScrubbed?: number;
  totalReportsFailed?: number;
}

/**
 * Drops fetched report bodies once they age past the retention window, keeping
 * the enrichment and evidence that ranking depends on. Reports are untrusted
 * third-party content, so holding them indefinitely is a liability.
 */
export const registerScrubReportContentTask = ({
  taskManager,
  coreSetup,
  logger,
}: {
  taskManager: TaskManagerSetupContract;
  coreSetup: CoreSetup;
  logger: Logger;
}): void => {
  taskManager.registerTaskDefinitions({
    [SCRUB_REPORT_CONTENT_TASK_TYPE]: {
      title: 'Threat Intelligence — Scrub aged report content',
      description:
        `Removes fetched report body content older than ${CONTENT_RETENTION_DAYS} days from ` +
        '.kibana-threat-reports, keeping extraction and evidence fields.',
      timeout: TASK_TIMEOUT,
      maxAttempts: 1,
      cost: TaskCost.Normal,
      stateSchemaByVersion: {
        1: { schema: stateSchemaV1, up: (s) => s },
        2: {
          schema: stateSchemaV2,
          up: (s) => ({ ...s, totalReportsFailed: s.totalReportsFailed ?? 0 }),
        },
      },
      createTaskRunner: ({ taskInstance, signal }: RunContext) => ({
        run: async () => {
          const previousState = (taskInstance.state ?? {}) as ScrubReportContentState;
          const [coreStart] = await coreSetup.getStartServices();
          const esClient = coreStart.elasticsearch.client.asInternalUser;
          const now = new Date().toISOString();

          try {
            const response = await esClient.updateByQuery(
              {
                index: THREAT_REPORTS_INDEX_PATTERN,
                ...HIDDEN_INDEX_SEARCH_OPTIONS,
                max_docs: MAX_DOCS_PER_RUN,
                conflicts: 'proceed',
                refresh: false,
                wait_for_completion: true,
                query: {
                  bool: {
                    filter: [
                      { range: { '@timestamp': { lt: `now-${CONTENT_RETENTION_DAYS}d` } } },
                      { exists: { field: 'content.body_text' } },
                    ],
                    must_not: [
                      { exists: { field: 'lineage.content_scrubbed_at' } },
                      // Retention must not outrun enrichment. See
                      // UNENRICHED_EXTRACTION_METHODS.
                      {
                        terms: {
                          'lineage.extraction_method': [...UNENRICHED_EXTRACTION_METHODS],
                        },
                      },
                    ],
                  },
                },
                script: { source: SCRUB_SCRIPT, lang: 'painless', params: { now } },
              },
              { signal }
            );

            const scrubbed = response.updated ?? 0;
            // `update_by_query` returns 200 with per-document problems in these
            // two fields, so reading `updated` alone cannot tell a clean no-op
            // from a run where every document failed.
            const failures = response.failures ?? [];
            const versionConflicts = response.version_conflicts ?? 0;

            if (scrubbed > 0) {
              logger.info(
                `Scrubbed report content on ${scrubbed} report(s) older than ` +
                  `${CONTENT_RETENTION_DAYS} days`
              );
            }
            if (failures.length > 0) {
              logger.error(
                `Failed to scrub report content on ${failures.length} report(s) older than ` +
                  `${CONTENT_RETENTION_DAYS} days. Their fetched third-party bodies are still ` +
                  `stored past the retention window (first failure: ${JSON.stringify(failures[0])})`
              );
            }
            if (versionConflicts > 0) {
              // `conflicts: 'proceed'` skips these rather than aborting. They are
              // re-selected on the next run because the query keys on the absence
              // of `lineage.content_scrubbed_at`, so this is a delay, not a loss.
              logger.debug(
                `Skipped ${versionConflicts} report(s) during the content scrub due to version ` +
                  `conflicts; the next run picks them up.`
              );
            }
            if (scrubbed === MAX_DOCS_PER_RUN) {
              logger.info(
                `Hit the ${MAX_DOCS_PER_RUN}-document cap; the remaining backlog is picked up on ` +
                  `the next run.`
              );
            }

            return {
              state: {
                lastRunAt: now,
                totalReportsScrubbed: (previousState.totalReportsScrubbed ?? 0) + scrubbed,
                totalReportsFailed: (previousState.totalReportsFailed ?? 0) + failures.length,
              } satisfies ScrubReportContentState,
            };
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            const message = (err as Error).message ?? String(err);
            if (status === 404) {
              // Reports index not created yet; nothing to age out.
              return { state: previousState };
            }
            if (isTransientEsStatus(status)) {
              throwRetryableError(
                new Error(`Elasticsearch transient failure during content scrub: ${message}`),
                new Date(Date.now() + 60_000)
              );
            }
            throw new Error(`Failed to scrub aged threat report content: ${message}`);
          }
        },
      }),
    },
  });
};

export const scheduleScrubReportContentTask = async ({
  taskManager,
  logger,
  interval = DEFAULT_INTERVAL,
}: {
  taskManager: TaskManagerStartContract;
  logger: Logger;
  interval?: string;
}): Promise<void> => {
  const existing = await taskManager.get(SCRUB_REPORT_CONTENT_TASK_ID).catch(() => undefined);
  await taskManager.ensureScheduled({
    id: SCRUB_REPORT_CONTENT_TASK_ID,
    taskType: SCRUB_REPORT_CONTENT_TASK_TYPE,
    schedule: existing?.schedule ?? { interval },
    params: existing?.params ?? {},
    state: (existing?.state ?? {}) as ScrubReportContentState,
  });
  logger.debug(
    `Scheduled ${SCRUB_REPORT_CONTENT_TASK_ID} with interval=${
      existing?.schedule?.interval ?? interval
    }`
  );
};
