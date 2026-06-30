/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { v4 as uuidv4 } from 'uuid';
import {
  BACKFILL_DIAMOND_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  DIAMOND_GATE_CONNECTOR_SETTING_KEY,
  DIAMOND_CONNECTOR_SETTING_KEY,
  THREAT_REPORTS_INDEX_PATTERN,
} from '../../../common/threat_intelligence/hub';
import {
  DIAMOND_SUITABLE_FRACTION_ESTIMATE,
  scheduleBackfillDiamondFieldsTask,
} from '../tasks/backfill_diamond_fields';
import { enrichTaxonomy } from '../services/enrich_taxonomy';
import { resolveScopedModel } from './lib/scoped_model';
import type { RouteRegistrationDeps } from '.';

/** Maximum number of random samples for a measured suitable-fraction estimate. */
const MAX_SAMPLE_SIZE = 20;

const bodySchema = schema.object({
  dry_run: schema.maybe(schema.boolean()),
  sample_size: schema.maybe(schema.number({ min: 1, max: MAX_SAMPLE_SIZE })),
  run_id: schema.maybe(schema.string({ minLength: 1 })),
  /**
   * When true (confirm path only), re-processes ALL reports that have been
   * through the extraction pipeline rather than only those without
   * `extracted.diamond.suitable`. Use to regenerate diamond fields after a
   * prompt change.
   *
   * WARNING: if the same documents are also being re-processed by the
   * workflow (via a `provenance.extraction_method` reset to `pending`),
   * diamond extraction will run twice on the same docs — double-paying
   * the heavy Opus connector. Use ONE path per run:
   *   • workflow reset  → re-runs IOCs + related_reports + diamond
   *   • force_reextract → re-runs diamond only
   */
  force_reextract: schema.maybe(schema.boolean()),
});

/**
 * Two-call backfill API for Diamond Model extraction.
 *
 * **Call 1 — dry-run estimate:**
 *   `POST { dry_run: true, sample_size? }` → synchronous `{ run_id, estimate }`
 *
 *   Counts eligible candidates (reports with `provenance.extracted_at` present
 *   AND `extracted.diamond.suitable` absent) and returns a cost estimate.
 *   If `sample_size` is provided, gates that many candidates via `enrichTaxonomy`
 *   for a measured suitable fraction; otherwise uses the Mustard-derived constant
 *   `DIAMOND_SUITABLE_FRACTION_ESTIMATE` (~0.70, likely HIGH for IntelHub — safe
 *   overestimate). Cost is shown as two separate line items: gate cost
 *   (cheap × all candidates) and extract cost (heavy × estimated suitable count).
 *
 * **Call 2 — confirm:**
 *   `POST { run_id }` → 202 started
 *
 *   Schedules a one-shot `backfill_diamond_fields` Task Manager job using the
 *   run_id from Call 1. Idempotent: calling twice with the same run_id returns
 *   202 both times (ensureScheduled semantics). The route passes `{ request }`
 *   to ensureScheduled so Task Manager stores an API key for the task runner's
 *   `fakeRequest` (used for LLM inference calls).
 *
 * **Connector requirement (confirm path):**
 *   The backfill task's `fakeRequest` context resolves connectors via the same
 *   chain as `resolveScopedModel`: explicit override → `genAi:defaultAIConnector`.
 *   If neither is configured the task fails unrecoverably on start. The confirm
 *   path pre-validates connector availability and returns 400 early so the
 *   operator gets immediate feedback instead of a silent task failure.
 *   To fix: set Advanced Settings →
 *     "Threat Intelligence — taxonomy gate connector"
 *     (`securitySolution:threatIntelligence:diamondGateConnector`) to a cheap
 *     GenAI connector (e.g. Haiku), **or** configure `genAi:defaultAIConnector`.
 */
export const registerBackfillDiamondRoute = ({
  router,
  logger,
  getInference,
  getTaskManager,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: BACKFILL_DIAMOND_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.manageSources],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: bodySchema } },
      },
      async (context, request, response) => {
        const {
          dry_run: dryRun,
          sample_size: sampleSize,
          run_id: runId,
          force_reextract: forceReextract,
        } = request.body;

        // ── Dry-run path ──────────────────────────────────────────────────────
        if (dryRun === true) {
          const core = await context.core;
          const esClient = core.elasticsearch.client.asInternalUser;

          // Count eligible candidates.
          let candidateCount = 0;
          try {
            const countResponse = await esClient.count({
              index: THREAT_REPORTS_INDEX_PATTERN,
              query: {
                bool: {
                  filter: [{ exists: { field: 'provenance.extracted_at' } }],
                  must_not: [{ exists: { field: 'extracted.diamond.suitable' } }],
                },
              },
            });
            candidateCount = countResponse.count;
          } catch (err) {
            logger.warn(`backfill dry_run: candidate count failed: ${(err as Error).message}`);
          }

          // Measure suitable fraction by sampling if requested.
          let suitableFraction = DIAMOND_SUITABLE_FRACTION_ESTIMATE;
          let fractionBasis: 'constant' | 'sampled' = 'constant';

          if (sampleSize && sampleSize > 0) {
            const inference = getInference();
            if (inference) {
              let gateConnectorId: string | undefined;
              try {
                const setting = await core.uiSettings.client.get<string>(
                  DIAMOND_GATE_CONNECTOR_SETTING_KEY
                );
                if (setting) gateConnectorId = setting;
              } catch {
                // fall through to default
              }

              const modelOutcome = await resolveScopedModel({
                inference,
                request,
                uiSettingsClient: core.uiSettings.client,
                connectorIdOverride: gateConnectorId,
                logger,
              });

              if (modelOutcome.ok) {
                try {
                  const sampleHits = await esClient.search<{ content?: { body_text?: string } }>({
                    index: THREAT_REPORTS_INDEX_PATTERN,
                    size: sampleSize,
                    _source: ['content.body_text'],
                    query: {
                      bool: {
                        filter: [{ exists: { field: 'provenance.extracted_at' } }],
                        must_not: [{ exists: { field: 'extracted.diamond.suitable' } }],
                      },
                    },
                    sort: [{ '@timestamp': { order: 'desc' } }],
                  });

                  const sampleDocs = sampleHits.hits.hits;
                  if (sampleDocs.length > 0) {
                    let trueCount = 0;
                    for (const hit of sampleDocs) {
                      try {
                        const text = hit._source?.content?.body_text ?? '';
                        const taxonomy = await enrichTaxonomy(modelOutcome.model, logger, {
                          text,
                          report_id: hit._id,
                        });
                        if (taxonomy.diamond_suitable) trueCount += 1;
                      } catch (err) {
                        logger.debug(
                          `backfill dry_run sample failed for ${hit._id}: ${(err as Error).message}`
                        );
                      }
                    }
                    suitableFraction = trueCount / sampleDocs.length;
                    fractionBasis = 'sampled';
                  }
                } catch (err) {
                  logger.warn(
                    `backfill dry_run: sample enrichment failed: ${
                      (err as Error).message
                    } — using constant estimate`
                  );
                }
              } else {
                logger.debug(
                  `backfill dry_run: gate connector unavailable for sampling — using constant estimate`
                );
              }
            }
          }

          const estimatedSuitable = Math.round(candidateCount * suitableFraction);
          const newRunId = uuidv4();

          return response.ok({
            body: {
              run_id: newRunId,
              estimate: {
                candidate_count: candidateCount,
                suitable_fraction: suitableFraction,
                fraction_basis: fractionBasis,
                gate_calls: candidateCount,
                extract_calls_estimated: estimatedSuitable,
              },
            },
          });
        }

        // ── Confirm path ──────────────────────────────────────────────────────
        if (runId) {
          const taskManager = getTaskManager?.();
          if (!taskManager) {
            return response.customError({
              statusCode: 503,
              body: {
                message:
                  'Task Manager is not available — backfill scheduling requires the ' +
                  'taskManager plugin. Ensure `xpack.task_manager.enabled: true` in kibana.yml.',
              },
            });
          }

          const core = await context.core;

          let gateConnectorId = '';
          let diamondConnectorId = '';
          try {
            const gateSetting = await core.uiSettings.client.get<string>(
              DIAMOND_GATE_CONNECTOR_SETTING_KEY
            );
            if (gateSetting) gateConnectorId = gateSetting;
          } catch {
            // Setting not registered in this context — fall through.
          }
          try {
            const diamondSetting = await core.uiSettings.client.get<string>(
              DIAMOND_CONNECTOR_SETTING_KEY
            );
            if (diamondSetting) diamondConnectorId = diamondSetting;
          } catch {
            // fall through
          }

          // Pre-flight: verify a connector is reachable before scheduling the
          // task. The task runner uses `fakeRequest` whose connector resolution
          // chain is: explicit gate_connector_id → genAi:defaultAIConnector →
          // inference.getDefaultConnector. If none resolves the task fails
          // unrecoverably with no visible progress. Check at schedule time so
          // the operator gets an actionable 400 instead of a silent task failure.
          if (!gateConnectorId) {
            const inference = getInference();
            if (inference) {
              let hasDefault = false;
              try {
                const defaultConnector = await inference.getDefaultConnector(request);
                hasDefault = !!defaultConnector?.connectorId;
              } catch {
                // getDefaultConnector throws when no connector is configured.
              }
              if (!hasDefault) {
                return response.badRequest({
                  body: {
                    message:
                      'No GenAI connector is configured for the Diamond Model backfill gate. ' +
                      'The backfill task cannot resolve a connector and will fail immediately. ' +
                      'Fix: set Advanced Settings → "Threat Intelligence — taxonomy gate connector" ' +
                      '(securitySolution:threatIntelligence:diamondGateConnector) to a GenAI connector ' +
                      'ID (e.g. a Haiku-class connector for cost efficiency), ' +
                      'or configure a space-wide default via genAi:defaultAIConnector.',
                  },
                });
              }
            }
          }

          try {
            await scheduleBackfillDiamondFieldsTask({
              taskManager,
              request,
              runId,
              gateConnectorId,
              diamondConnectorId,
              forceReextract: forceReextract ?? false,
            });
          } catch (err) {
            logger.error(`backfill schedule failed for run_id=${runId}: ${(err as Error).message}`);
            return response.customError({
              statusCode: 500,
              body: { message: `Failed to schedule backfill: ${(err as Error).message}` },
            });
          }

          return response.accepted({ body: { run_id: runId, status: 'scheduled' } });
        }

        return response.badRequest({
          body: {
            message:
              'Provide either `{ dry_run: true }` for a cost estimate or `{ run_id }` to start.',
          },
        });
      }
    );
};
