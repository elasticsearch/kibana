/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { set } from '@kbn/safer-lodash-set';
import { get, isEqual, unset } from 'lodash';
import { produce } from 'immer';
import type { CoreStart, Logger, SavedObjectsFindResult } from '@kbn/core/server';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import {
  LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
} from '@kbn/fleet-plugin/common';

import { packSavedObjectType } from '../../common/types';
import { OSQUERY_INTEGRATION_NAME } from '../../common';
import type { PackSavedObject } from '../common/types';
import type { OsqueryAppContextService } from './osquery_app_context_services';
import {
  getInternalSavedObjectsClient,
  getInternalSavedObjectsClientForSpaceId,
} from '../utils/get_internal_saved_object_client';
import {
  convertSOQueriesToPackConfig,
  policyHasPack,
  makePackKey,
  removePackFromPolicy,
} from '../routes/pack/utils';

/**
 * One-shot, idempotent reconciler that projects each enabled pack's
 * Saved-Object `schedule_id` values onto its Fleet package-policy wire, so the
 * Elastic Agent emits result documents carrying `schedule_id` (the modern
 * scheduled-history join key).
 *
 * This is NOT a backfill: minting `schedule_id` is owned by the pack SO
 * `data_backfill` model version (V4). By the time this runs, the SO carries
 * `schedule_id` on every query, so the reconciler reads it as the source of
 * truth and never mints — making it idempotent (no per-run uuid drift). Writing
 * the cross-SO Fleet package policy is the one job a model version cannot do.
 *
 * It writes ONLY the osquery pack block of the package policy; all other
 * policy state is preserved.
 */
export const reconcileScheduleIdsToWire = async ({
  coreStart,
  osqueryContext,
  logger,
  abortController,
  isRruleFeatureEnabled = false,
}: {
  coreStart: CoreStart;
  osqueryContext: OsqueryAppContextService;
  logger: Logger;
  abortController?: AbortController;
  isRruleFeatureEnabled?: boolean;
}): Promise<{ hadFailures: boolean }> => {
  const internalClient = await getInternalSavedObjectsClient(coreStart);

  // Page through every pack across all spaces — a deployment can have >1000
  // packs, and a single missed page leaves those packs' `schedule_id` never
  // projected onto the wire.
  const PER_PAGE = 1000;
  const allPackSavedObjects: Array<SavedObjectsFindResult<PackSavedObject>> = [];
  let page = 1;
  let total = Infinity;
  do {
    const response = await internalClient.find<PackSavedObject>({
      type: packSavedObjectType,
      perPage: PER_PAGE,
      page,
      namespaces: ['*'],
    });
    allPackSavedObjects.push(...response.saved_objects);
    total = response.total;
    page += 1;
  } while (allPackSavedObjects.length < total);

  // Only enabled packs reach the Fleet wire. A pack whose SO carries
  // `schedule_id` values (guaranteed post-V4 for every query) is a reconcile
  // candidate; the per-policy wire-vs-SO diff gate below decides whether a
  // write is actually needed, so an already-in-sync pack is skipped.
  const packsToReconcile = allPackSavedObjects.filter(
    (pack) => pack.attributes.enabled && pack.attributes.queries?.length
  );

  if (!packsToReconcile.length) {
    logger.debug('reconcileScheduleIdsToWire: no enabled packs to reconcile');

    return { hadFailures: false };
  }

  logger.info(
    `reconcileScheduleIdsToWire: ${packsToReconcile.length} enabled pack(s) to reconcile onto the Fleet wire`
  );

  const packagePolicyService = osqueryContext.getPackagePolicyService();
  const esClient = coreStart.elasticsearch.client.asInternalUser;
  let hadFailures = false;

  if (!packagePolicyService) {
    logger.warn('reconcileScheduleIdsToWire: package policy service unavailable, will retry');

    return { hadFailures: true };
  }

  for (const packSO of packsToReconcile) {
    if (abortController?.signal.aborted) {
      logger.info(
        'reconcileScheduleIdsToWire: aborted by task manager, will retry remaining packs'
      );

      return { hadFailures: true };
    }

    try {
      const spaceId = packSO.namespaces?.[0] ?? 'default';
      const spaceClient = getInternalSavedObjectsClientForSpaceId(coreStart, spaceId);

      const policyRefs =
        packSO.references
          ?.filter((r) => r.type === LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE)
          .map((r) => r.id) ?? [];

      if (!policyRefs.length) {
        continue;
      }

      // Page through every osquery package policy in the space — a single
      // space can hold >1000, and a missed page leaves that policy's wire
      // unreconciled with no signal.
      const packagePolicies: PackagePolicy[] = [];
      let policyPage = 1;
      let policyTotal = Infinity;
      do {
        const result = (await packagePolicyService.list(spaceClient, {
          kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name:${OSQUERY_INTEGRATION_NAME}`,
          perPage: PER_PAGE,
          page: policyPage,
        })) ?? { items: [], total: 0 };
        packagePolicies.push(...result.items);
        policyTotal = result.total ?? result.items.length;
        policyPage += 1;
      } while (packagePolicies.length < policyTotal);

      for (const pp of packagePolicies) {
        if (policyHasPack(pp, packSO.attributes.name, spaceId)) {
          const packPath = `inputs[0].config.osquery.value.packs.${makePackKey(
            packSO.attributes.name,
            spaceId
          )}`;

          const { queries: builtQueries, ...packDefaults } = convertSOQueriesToPackConfig(
            packSO.attributes.queries ?? [],
            {
              spaceId,
              packSchedule: {
                schedule_type: packSO.attributes.schedule_type,
                interval: packSO.attributes.interval,
                rrule_schedule: packSO.attributes.rrule_schedule,
              },
              isRruleFeatureEnabled,
            }
          );

          const existingPackBlock = get(pp, packPath) as Record<string, unknown> | undefined;

          const legacyPackBlock = get(
            pp,
            `inputs[0].config.osquery.value.packs.${packSO.attributes.name}`
          ) as Record<string, unknown> | undefined;
          const existingShard = existingPackBlock?.shard ?? legacyPackBlock?.shard;

          // The exact block the write below re-sets, so it IS the post-write
          // state — used as the diff gate against the current wire.
          const intendedPackBlock = {
            ...(existingShard !== undefined ? { shard: existingShard } : {}),
            pack_id: packSO.id,
            ...packDefaults,
            queries: builtQueries,
          };

          if (isEqual(existingPackBlock, intendedPackBlock)) {
            logger.debug(
              `reconcileScheduleIdsToWire: pack ${packSO.id} already in sync on policy ${pp.id}, skipping write`
            );
            continue;
          }

          await packagePolicyService.update(
            spaceClient,
            esClient,
            pp.id,
            produce<PackagePolicy>(pp, (draft) => {
              unset(draft, 'id');
              removePackFromPolicy(draft, packSO.attributes.name, spaceId);
              set(draft, packPath, intendedPackBlock);

              return draft;
            })
          );
        }
      }

      logger.debug(`reconcileScheduleIdsToWire: reconciled pack ${packSO.id} in space ${spaceId}`);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 409) {
        logger.debug(
          `reconcileScheduleIdsToWire: version conflict for pack ${packSO.id}, will retry`
        );
        hadFailures = true;
      } else {
        logger.warn(
          `reconcileScheduleIdsToWire: failed to reconcile pack ${packSO.id}: ${error.message}`
        );
        hadFailures = true;
      }
    }
  }

  if (hadFailures) {
    logger.warn('reconcileScheduleIdsToWire: reconcile finished with partial failures, will retry');
  } else {
    logger.info('reconcileScheduleIdsToWire: reconcile complete');
  }

  return { hadFailures };
};
