/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { schema } from '@kbn/config-schema';
import type { CoreSetup, Logger } from '@kbn/core/server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import {
  TaskCost,
  type TaskManagerSetupContract,
  type TaskManagerStartContract,
  type RunContext,
  throwRetryableError,
  throwUnrecoverableError,
} from '@kbn/task-manager-plugin/server';
import { THREAT_REPORTS_INDEX_PATTERN } from '../../../common/threat_intelligence/hub';
import { enrichTaxonomy } from '../services/enrich_taxonomy';
import { extractDiamond } from '../services/extract_diamond';
import { extractIocs } from '../services/extract_iocs';
import { resolveScopedModel } from '../routes/lib/scoped_model';

export const BACKFILL_DIAMOND_FIELDS_TASK_TYPE = 'threat_intelligence:backfill_diamond_fields';
export const BACKFILL_DIAMOND_FIELDS_TASK_ID_PREFIX =
  'threat_intelligence:backfill_diamond_fields:';

const PAGE_SIZE = 10;
const TASK_TIMEOUT = '8m';

/**
 * Mustard-derived estimate for the fraction of IntelHub threat reports that
 * pass the `diamond_suitable` gate. Based on Mustard's `scout.py` KEEP/SKIP
 * classifier run over the IntelHub corpus sample. Likely HIGH for IntelHub's
 * less-prefiltered sources — the estimate deliberately overestimates extract
 * costs so operators are not surprised when the actual run is cheaper.
 *
 * Once `extracted.diamond.suitable` is populated at scale, future dry_runs
 * can use a real ES-counted fraction instead of this constant.
 */
export const DIAMOND_SUITABLE_FRACTION_ESTIMATE = 0.7;

const REPORT_SCAN_SORT: estypes.Sort = [{ 'provenance.extracted_at': { order: 'asc' } }, '_doc'];

/**
 * Candidate filter: report has been through extraction (provenance.extracted_at exists)
 * but has not yet been gated by the backfill or the workflow's persist_extractions
 * (extracted.diamond.suitable absent). Once gated, the field exists (true or false)
 * and the report is excluded on subsequent runs.
 */
const CANDIDATE_FILTER: estypes.QueryDslQueryContainer = {
  bool: {
    filter: [{ exists: { field: 'provenance.extracted_at' } }],
    must_not: [{ exists: { field: 'extracted.diamond.suitable' } }],
  },
};

/**
 * Force-reextract candidate filter: re-processes ALL reports that have been
 * through the extraction pipeline, ignoring the idempotency guard on
 * `extracted.diamond.suitable`. Used when the extraction prompt or gate logic
 * has changed and existing results need to be regenerated.
 *
 * See the WARNING in BackfillParams.force_reextract about the double-pay risk
 * if the workflow reset path is also active on the same documents.
 */
const FORCE_REEXTRACT_CANDIDATE_FILTER: estypes.QueryDslQueryContainer = {
  bool: {
    filter: [{ exists: { field: 'provenance.extracted_at' } }],
  },
};

const stateSchemaV1 = schema.object({
  lastProcessedAt: schema.maybe(schema.string()),
  gateTotal: schema.maybe(schema.number()),
  suitableTotal: schema.maybe(schema.number()),
  extractTotal: schema.maybe(schema.number()),
});

interface BackfillState {
  [key: string]: unknown;
  lastProcessedAt?: string;
  gateTotal?: number;
  suitableTotal?: number;
  extractTotal?: number;
}

interface BackfillParams {
  run_id: string;
  gate_connector_id: string;
  diamond_connector_id: string;
  /**
   * When true, re-processes ALL reports that have `provenance.extracted_at`
   * (i.e. have been through the extraction pipeline), regardless of whether
   * `extracted.diamond.suitable` is already set.
   *
   * WARNING — double-pay risk: if you also reset `provenance.extraction_method`
   * to `pending` for the same documents, the workflow will re-fire
   * `extract_diamond` on suitable reports AND this backfill will run again on
   * the same docs, paying Opus twice. Use ONE path, not both:
   *   • workflow reset path  → re-runs IOCs + related_reports + diamond
   *   • backfill force_reextract → re-runs diamond only, skips the rest
   */
  force_reextract?: boolean;
}

interface CandidateHit {
  _id: string;
  _index: string;
  sort?: Array<string | number | null>;
  _source?: {
    content?: { body_text?: string; title?: string };
    provenance?: { extracted_at?: string };
  };
}

export const registerBackfillDiamondFieldsTask = ({
  taskManager,
  coreSetup,
  logger,
  getInference,
  getActions,
}: {
  taskManager: TaskManagerSetupContract;
  /**
   * Intentionally unparameterized — inference and actions start contracts are
   * resolved via the lazy getters below so the generic doesn't propagate into
   * the plugin's setup boundary.
   */
  coreSetup: CoreSetup;
  logger: Logger;
  getInference: () => InferenceServerStart | undefined;
  getActions: () => ActionsPluginStartContract | undefined;
}): void => {
  taskManager.registerTaskDefinitions({
    [BACKFILL_DIAMOND_FIELDS_TASK_TYPE]: {
      title: 'Threat Intelligence — Diamond Model backfill',
      description:
        'Backfill Diamond Model extraction fields on existing threat reports that ' +
        'were ingested before Phase 1 deployed. Per-report gate (enrichTaxonomy) → ' +
        'heavy extraction (extractDiamond) for threat-positive reports.',
      timeout: TASK_TIMEOUT,
      maxAttempts: 3,
      cost: TaskCost.ExtraLarge,
      stateSchemaByVersion: {
        1: { schema: stateSchemaV1, up: (s) => s },
      },
      createTaskRunner: ({ taskInstance, abortController, fakeRequest }: RunContext) => ({
        run: async () => {
          const previousState = (taskInstance.state ?? {}) as BackfillState;
          const params = taskInstance.params as BackfillParams;

          if (!fakeRequest) {
            throwUnrecoverableError(
              new Error(
                'backfill_diamond_fields requires an authenticated request context. ' +
                  'Re-schedule via POST /api/threat_intelligence/backfill_diamond with ' +
                  'a valid run_id — the route stores the session API key for the task.'
              )
            );
            return { state: previousState };
          }

          const inference = getInference();
          const actions = getActions();
          if (!inference) {
            throwUnrecoverableError(
              new Error('inference plugin is not available — cannot run backfill')
            );
            return { state: previousState };
          }
          if (!actions) {
            throwUnrecoverableError(
              new Error('actions plugin is not available — cannot run backfill')
            );
            return { state: previousState };
          }

          const [coreStart] = await coreSetup.getStartServices();
          const esClient = coreStart.elasticsearch.client.asInternalUser;

          // Build ScopedModels for gate (cheap) and diamond (heavy) using the task's
          // fakeRequest (created by Task Manager from the stored API key that was
          // persisted when the route called ensureScheduled({ request })).
          const savedObjectsClient = coreStart.savedObjects.getScopedClient(
            fakeRequest as KibanaRequest
          );
          const uiSettingsClient = coreStart.uiSettings.asScopedToClient(savedObjectsClient);

          const gateModelOutcome = await resolveScopedModel({
            inference,
            request: fakeRequest as KibanaRequest,
            uiSettingsClient,
            connectorIdOverride: params.gate_connector_id || undefined,
            logger,
          });
          if (!gateModelOutcome.ok) {
            throwUnrecoverableError(
              new Error(
                `Diamond backfill gate connector unavailable: ${gateModelOutcome.message}. ` +
                  `Fix: set Advanced Settings → "Threat Intelligence — taxonomy gate connector" ` +
                  `(securitySolution:threatIntelligence:diamondGateConnector) to a valid GenAI ` +
                  `connector ID, or configure a default via genAi:defaultAIConnector. ` +
                  `Then re-run via POST /api/threat_intelligence/backfill_diamond with a fresh ` +
                  `run_id from a new dry_run call.`
              )
            );
            return { state: previousState };
          }

          const diamondModelOutcome = await resolveScopedModel({
            inference,
            request: fakeRequest as KibanaRequest,
            uiSettingsClient,
            connectorIdOverride: params.diamond_connector_id || undefined,
            logger,
          });
          if (!diamondModelOutcome.ok) {
            throwUnrecoverableError(
              new Error(
                `Diamond backfill extraction connector unavailable: ${diamondModelOutcome.message}. ` +
                  `Fix: set Advanced Settings → "Threat Intelligence — Diamond extraction connector" ` +
                  `(securitySolution:threatIntelligence:diamondConnector) to a valid GenAI connector, ` +
                  `or configure a default via genAi:defaultAIConnector.`
              )
            );
            return { state: previousState };
          }

          const gateModel = gateModelOutcome.model;
          const diamondModel = diamondModelOutcome.model;

          let gateTotal = previousState.gateTotal ?? 0;
          let suitableTotal = previousState.suitableTotal ?? 0;
          let extractTotal = previousState.extractTotal ?? 0;
          let searchAfter: Array<string | number | null> | undefined;
          let latestExtractedAt = previousState.lastProcessedAt;

          // Cursor filter: skip already-processed extracted_at values from prior runs.
          const lower = previousState.lastProcessedAt ?? '1970-01-01T00:00:00.000Z';

          // When force_reextract is true, re-processes ALL extracted docs regardless of
          // whether extracted.diamond.suitable is already set. See the WARNING on
          // BackfillParams.force_reextract about the double-pay risk.
          const activeFilter = params.force_reextract
            ? FORCE_REEXTRACT_CANDIDATE_FILTER
            : CANDIDATE_FILTER;

          while (!abortController.signal.aborted) {
            let searchResponse;
            try {
              searchResponse = await esClient.search<CandidateHit['_source']>({
                index: THREAT_REPORTS_INDEX_PATTERN,
                size: PAGE_SIZE,
                _source: ['content.body_text', 'content.title', 'provenance.extracted_at'],
                query: {
                  bool: {
                    filter: [
                      ...((activeFilter.bool?.filter as estypes.QueryDslQueryContainer[]) ?? []),
                      { range: { 'provenance.extracted_at': { gte: lower } } },
                    ],
                    ...(activeFilter.bool?.must_not
                      ? {
                          must_not: activeFilter.bool.must_not as estypes.QueryDslQueryContainer[],
                        }
                      : {}),
                  },
                },
                sort: REPORT_SCAN_SORT,
                ...(searchAfter ? { search_after: searchAfter } : {}),
              });
            } catch (err) {
              const message = (err as Error).message ?? String(err);
              const status = (err as { statusCode?: number }).statusCode;
              if (status === 503 || status === 429) {
                throwRetryableError(
                  new Error(`Elasticsearch transient failure during backfill scan: ${message}`),
                  new Date(Date.now() + 60_000)
                );
              }
              if (status === 404) {
                return { state: previousState };
              }
              throwUnrecoverableError(
                new Error(`Failed to scan threat reports for diamond backfill: ${message}`)
              );
              return { state: previousState };
            }

            const hits = (searchResponse?.hits?.hits ?? []) as CandidateHit[];
            if (hits.length === 0) break;

            for (const hit of hits) {
              if (abortController.signal.aborted) break;

              const reportId = hit._id;
              const text = (hit._source as CandidateHit['_source'])?.content?.body_text ?? '';
              const title = (hit._source as CandidateHit['_source'])?.content?.title;

              // Gate: classify this report for diamond suitability.
              let diamondSuitable = false;
              try {
                const taxonomy = await enrichTaxonomy(gateModel, logger, {
                  text,
                  report_id: reportId,
                  title,
                });
                diamondSuitable = taxonomy.diamond_suitable;
                gateTotal += 1;
                if (diamondSuitable) suitableTotal += 1;
              } catch (err) {
                logger.warn(
                  `backfill_diamond: enrichTaxonomy failed for ${reportId}: ${
                    (err as Error).message
                  } — marking not suitable`
                );
                gateTotal += 1;
              }

              // Re-extract IOCs (with tier fields) and recompute ioc_set_hash.
              // This is always done on every backfill pass so tier fields are populated
              // and the value-only ioc_set_hash is refreshed (it changed from type:value
              // keying in Cycle A). Both fields are anchor-eligible-only — reference and
              // denied IOCs are included in the iocs array but excluded from the hash.
              let iocUpdate: Record<string, unknown> | undefined;
              try {
                const iocResult = extractIocs({ text, defang: true });
                iocUpdate = {
                  iocs: iocResult.iocs,
                  ioc_set_hash: iocResult.ioc_set_hash,
                };
              } catch (iocErr) {
                logger.warn(
                  `backfill_diamond: extractIocs failed for ${reportId}: ${
                    (iocErr as Error).message
                  } — ioc fields not updated`
                );
              }

              // Build update doc — always write suitable so future scans skip this report.
              const extractedBase = iocUpdate ?? {};
              const updateDoc: Record<string, unknown> = {
                extracted: { ...extractedBase, diamond: { suitable: diamondSuitable } },
              };

              // Heavy extraction for suitable reports.
              if (diamondSuitable) {
                try {
                  const diamondResult = await extractDiamond(diamondModel, logger, {
                    text,
                    report_id: reportId,
                  });
                  extractTotal += 1;
                  updateDoc.extracted = {
                    ...(typeof updateDoc.extracted === 'object' && updateDoc.extracted !== null
                      ? updateDoc.extracted
                      : {}),
                    diamond: {
                      suitable: true,
                      adversary: diamondResult.adversary,
                      capability: diamondResult.capability,
                      infrastructure: diamondResult.infrastructure,
                      victim: diamondResult.victim,
                      signal_count: diamondResult.signal_count,
                      model_id: diamondResult.model_id,
                      extracted_at: diamondResult.extracted_at,
                      extraction_mode: diamondResult.extraction_mode,
                    },
                  };
                } catch (err) {
                  logger.warn(
                    `backfill_diamond: extractDiamond failed for ${reportId}: ${
                      (err as Error).message
                    } — gate persisted, extraction skipped`
                  );
                }
              }

              try {
                await esClient.update<unknown, Record<string, unknown>>({
                  index: hit._index,
                  id: reportId,
                  doc: updateDoc,
                });
              } catch (err) {
                logger.warn(
                  `backfill_diamond: ES update failed for ${reportId}: ${(err as Error).message}`
                );
              }

              const extractedAt = (hit._source as CandidateHit['_source'])?.provenance
                ?.extracted_at;
              if (typeof extractedAt === 'string') latestExtractedAt = extractedAt;
            }

            const lastHit = hits[hits.length - 1];
            if (!lastHit?.sort) {
              throwUnrecoverableError(
                new Error('Backfill scan returned hits without sort values — cannot paginate')
              );
            }
            searchAfter = lastHit.sort;

            if (hits.length < PAGE_SIZE) break;
          }

          if (abortController.signal.aborted) {
            logger.debug(
              `backfill_diamond aborted after ${gateTotal} gated / ${extractTotal} extracted — saving cursor`
            );
          }

          return {
            state: {
              lastProcessedAt: latestExtractedAt ?? previousState.lastProcessedAt,
              gateTotal,
              suitableTotal,
              extractTotal,
            } satisfies BackfillState,
          };
        },
      }),
    },
  });
};

/**
 * Schedules (idempotent) a one-shot backfill task for the given run_id.
 * Passes `{ request }` so Task Manager stores an API key used to create the
 * `fakeRequest` in the task runner (needed for inference plugin LLM calls).
 */
export const scheduleBackfillDiamondFieldsTask = async ({
  taskManager,
  request,
  runId,
  gateConnectorId,
  diamondConnectorId,
  forceReextract,
}: {
  taskManager: TaskManagerStartContract;
  request: KibanaRequest;
  runId: string;
  gateConnectorId: string;
  diamondConnectorId: string;
  forceReextract?: boolean;
}): Promise<void> => {
  await taskManager.ensureScheduled(
    {
      id: `${BACKFILL_DIAMOND_FIELDS_TASK_ID_PREFIX}${runId}`,
      taskType: BACKFILL_DIAMOND_FIELDS_TASK_TYPE,
      params: {
        run_id: runId,
        gate_connector_id: gateConnectorId,
        diamond_connector_id: diamondConnectorId,
        ...(forceReextract ? { force_reextract: true } : {}),
      } satisfies BackfillParams,
      state: {} satisfies BackfillState,
    },
    { request }
  );
};
