/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObject,
  SavedObjectBulkResult,
  SavedObjectsBulkCreateObject,
} from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import type { AdHocRun, AdHocRunSO } from '../../../data/ad_hoc_run/types';
import { createBackfillError } from '../../../backfill_client/lib';
import type { ScheduleBackfillResult } from '../methods/schedule/types';
import { transformRawActionsToDomainActions } from '../../rule/transforms';

interface TransformAdHocRunToBackfillResultOpts {
  adHocRunSO: SavedObjectBulkResult<AdHocRunSO>;
  isSystemAction: (connectorId: string) => boolean;
  originalSO?: SavedObjectsBulkCreateObject<AdHocRunSO>;
}

export const transformAdHocRunToBackfillResult = ({
  adHocRunSO,
  isSystemAction,
  originalSO,
}: TransformAdHocRunToBackfillResultOpts): ScheduleBackfillResult => {
  const ruleId =
    (isSavedObjectErrorResult(adHocRunSO) ? undefined : adHocRunSO.references?.[0]?.id) ??
    originalSO?.references?.[0]?.id ??
    'unknown';
  const ruleName =
    (isSavedObjectErrorResult(adHocRunSO) ? undefined : adHocRunSO.attributes?.rule?.name) ??
    originalSO?.attributes?.rule.name;
  if (isSavedObjectErrorResult(adHocRunSO)) {
    return createBackfillError(adHocRunSO.error.message, ruleId, ruleName);
  }

  const { id, attributes, references } = adHocRunSO;
  if (!id) {
    return createBackfillError(
      'Malformed saved object in bulkCreate response - Missing "id".',
      ruleId,
      ruleName
    );
  }

  if (!attributes) {
    return createBackfillError(
      'Malformed saved object in bulkCreate response - Missing "attributes".',
      ruleId,
      ruleName
    );
  }

  if (!references || !references.length) {
    return createBackfillError(
      'Malformed saved object in bulkCreate response - Missing "references".',
      ruleId,
      ruleName
    );
  }

  return {
    id,
    createdAt: attributes.createdAt,
    duration: attributes.duration,
    enabled: attributes.enabled,
    ...(attributes.end ? { end: attributes.end } : {}),
    rule: {
      ...attributes.rule,
      id: references[0].id,
      actions: transformRawActionsToDomainActions({
        ruleId: id,
        actions: attributes.rule.actions,
        references,
        isSystemAction,
      }),
    },
    spaceId: attributes.spaceId,
    start: attributes.start,
    status: attributes.status,
    schedule: attributes.schedule,
    initiator: attributes.initiator,
    initiatorId: attributes.initiatorId,
  };
};

export const transformAdHocRunToAdHocRunData = ({
  adHocRunSO,
  isSystemAction,
  originalSO,
}: {
  adHocRunSO: SavedObject<AdHocRunSO>;
  isSystemAction: (connectorId: string) => boolean;
  originalSO?: SavedObjectsBulkCreateObject<AdHocRunSO>;
}): AdHocRun => {
  const result = transformAdHocRunToBackfillResult({
    adHocRunSO,
    isSystemAction,
    originalSO,
  });

  return {
    ...result,
    apiKeyId: adHocRunSO.attributes.apiKeyId,
    apiKeyToUse: adHocRunSO.attributes.apiKeyToUse,
  } as AdHocRun;
};
