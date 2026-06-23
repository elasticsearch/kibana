/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import { CLEAR_STALE_UIAM_API_KEYS_TAGS } from '../constants';

/**
 * Painless script that removes the leaked `uiamApiKey` from a rule (`alert`) doc when, and
 * only when, the rule carries an ES-minted API key (`apiKeyCreatedByUser == true`) AND still
 * has both an `apiKey` and a `uiamApiKey`.
 *
 * Why a `noop` else-branch instead of a query-side filter: `alert.apiKeyCreatedByUser`,
 * `alert.apiKey`, and `alert.uiamApiKey` are intentionally NOT in the rule SO mapping (the
 * latter is `binary` so `exists` does not work on it reliably with default settings), so we
 * cannot pre-filter on them in the ES query. The script reads them straight from `_source`
 * instead and tags non-matching docs as no-ops, which costs nothing on the ES side
 * (no version bump, no reindex, no `_field_names` write).
 *
 * AAD safety: `uiamApiKey` is encrypted but is NOT included in the AAD of the rule's other
 * encrypted attribute (`apiKey`). The 18 AAD fields (`enabled`, `name`, `tags`, …,
 * `apiKeyCreatedByUser`, `apiKeyOwner`, …) are never read or written by this script. Therefore
 * removing `uiamApiKey` leaves `apiKey` fully decryptable on the next read — the same
 * invariant the task-manager team relies on in `stripUiamKeysFromProvisionedTasks`.
 *
 * The `apiKey != null` check is a defense-in-depth guard: it skips the (impossible under
 * PR #263887) edge case where a rule somehow has `apiKeyCreatedByUser: true` and a stale
 * `uiamApiKey` but no usable ES `apiKey`. Stripping `uiamApiKey` from such a rule would leave
 * it with no usable credential at all, so we leave it as-is for a human to investigate.
 */
const STRIP_STALE_UIAM_API_KEY_SCRIPT = `
if (ctx._source.alert != null
    && ctx._source.alert.apiKeyCreatedByUser == true
    && ctx._source.alert.uiamApiKey != null
    && ctx._source.alert.apiKey != null) {
  ctx._source.alert.remove('uiamApiKey');
} else {
  ctx.op = 'noop';
}
`;

export interface StripStaleUiamApiKeysResult {
  /** Rule docs the script actually rewrote (i.e. ones that were stripped). */
  updated: number;
  /**
   * Rule docs that were concurrently modified mid-pass. They were not touched and need a
   * retry run. `conflicts: 'proceed'` keeps the rest of the pass going.
   */
  versionConflicts: number;
  /** Rule docs the script declared as no-ops (no work to do). */
  noops: number;
  /** Total rule docs (of type `alert`) the query visited. */
  total: number;
}

/**
 * Strips the stale `uiamApiKey` attribute from every rule (`alert`) saved object in the
 * `.kibana_alerting_cases` index that matches the bug pattern from PR #263887.
 *
 * Implemented with `update_by_query` rather than the Saved Objects client because:
 *   1. Removing an attribute is not expressible via a partial SO update.
 *   2. The SOR/ESO write path would force a full decrypt + re-encrypt of `apiKey` and
 *      strict AAD reconstruction on every rule — a much bigger blast radius than a single
 *      painless `remove('uiamApiKey')`.
 *   3. There is documented prior art for exactly this approach in the task-manager plugin
 *      (`stripUiamKeysFromProvisionedTasks`), which already handles the same bug class for
 *      task docs.
 *
 * Returns the counts the caller needs to decide whether to latch the task (`versionConflicts
 * === 0` means every alert doc was successfully visited and processed in this pass).
 */
export const stripStaleUiamApiKeysFromRules = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<StripStaleUiamApiKeysResult> => {
  try {
    const response = await esClient.updateByQuery({
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      refresh: true,
      // A concurrently-modified rule (user save, provisioning, etc.) bumps the doc version;
      // skip those rather than fail the whole operation. They keep their (stale) uiamApiKey
      // and get re-attempted on the next run.
      conflicts: 'proceed',
      query: {
        bool: {
          // SO type tag is at the document root and indexed, so this is the only filter we
          // can apply at the ES query layer. The script does the rest from `_source`.
          filter: [{ term: { type: RULE_SAVED_OBJECT_TYPE } }],
        },
      },
      script: { source: STRIP_STALE_UIAM_API_KEY_SCRIPT, lang: 'painless' },
    });

    const updated = response.updated ?? 0;
    const versionConflicts = response.version_conflicts ?? 0;
    const noops = response.noops ?? 0;
    const total = response.total ?? 0;

    logger.info(
      `Stripped stale uiamApiKey from ${updated} rule(s) of ${total} visited ` +
        `(${noops} no-op, ${versionConflicts} version conflict(s)).`,
      { tags: CLEAR_STALE_UIAM_API_KEYS_TAGS }
    );

    return { updated, versionConflicts, noops, total };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to strip stale uiamApiKey from rules: ${message}`, {
      error: {
        stack_trace: error instanceof Error ? error.stack : undefined,
        tags: CLEAR_STALE_UIAM_API_KEYS_TAGS,
      },
    });
    throw error;
  }
};
