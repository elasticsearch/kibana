/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getFlattenedObject } from '@kbn/std';

import type { AttachmentRequestV2 } from '../../../common/types/api';
import type { Case } from '../../../common/types/domain';
import type { AlertInfo } from '../../common/types';
import { LICENSING_CASE_OBSERVABLES_FEATURE } from '../../common/constants';
import { getObservablesFromEcs } from '../../../common/observables/get_observables_from_ecs';
import type { FlattedEcsData } from '../../../common/observables/get_observables_from_ecs';
import { toStringArray } from '../../../common/utils/attachments/string_utils';
import {
  isLegacyAlertAttachment,
  isLegacyEventAttachment,
} from '../../../common/utils/attachments/v1_type_guards';
import {
  isUnifiedAlertAttachment,
  isUnifiedEventAttachment,
} from '../../../common/utils/attachments/v2_type_guards';
import { applyObservablesToCase } from '../cases/observables';
import type { CasesClientArgs } from '../types';

/**
 * Zip alert/event ids and indices into AlertInfo pairs.
 * If a single index is provided for multiple ids, it is applied to all ids.
 */
const zipIdsAndIndices = (ids: string[], indices: string[]): AlertInfo[] => {
  if (ids.length === 0 || indices.length === 0) return [];
  return ids.map((id, i) => ({
    id,
    index: indices.length === 1 ? indices[0] : indices[i] ?? indices[0],
  }));
};

/**
 * Extract AlertInfo (id + index pairs) from a single attachment request.
 * Handles legacy and unified shapes for both alert and event attachments.
 * Non-alert/event attachments produce an empty array.
 */
const getAlertInfoFromAttachment = (attachment: AttachmentRequestV2): AlertInfo[] => {
  if (isLegacyAlertAttachment(attachment)) {
    return zipIdsAndIndices(toStringArray(attachment.alertId), toStringArray(attachment.index));
  }

  if (isUnifiedAlertAttachment(attachment)) {
    const metadata = (attachment.metadata ?? {}) as { index?: unknown };
    return zipIdsAndIndices(toStringArray(attachment.attachmentId), toStringArray(metadata.index));
  }

  if (isLegacyEventAttachment(attachment)) {
    return zipIdsAndIndices(toStringArray(attachment.eventId), toStringArray(attachment.index));
  }

  if (isUnifiedEventAttachment(attachment)) {
    const metadata = (attachment.metadata ?? {}) as { index?: unknown };
    return zipIdsAndIndices(toStringArray(attachment.attachmentId), toStringArray(metadata.index));
  }

  return [];
};

/**
 * Convert a flat ECS doc (key → unknown value) to the FlattedEcsData format
 * expected by getObservablesFromEcs.
 */
const toFlattedEcsData = (flatDoc: Record<string, unknown>): FlattedEcsData[] =>
  Object.entries(flatDoc).map(([field, value]) => ({
    field,
    value: toStringArray(value),
  }));

/**
 * Best-effort: extract observables from the alert/event attachments in a
 * bulkCreate request and persist them to the case.
 *
 * - Gated on case.settings.extractObservables === true.
 * - Requires a Platinum license; skips (debug-log) if the license is insufficient.
 * - Never throws — a failure here must not abort the attachment creation.
 *
 * Authorization note: the resulting write to `observables` / `total_observables`
 * is a side effect of an already-authorized bulkCreateAttachments operation and
 * intentionally does NOT re-check ensureAuthorized(updateCase). This mirrors the
 * existing pattern for total_alerts increments triggered by alert attachment
 * creation — the attachment-level authorization is considered sufficient.
 */
export const extractAndAddObservables = async (
  caseId: string,
  attachments: AttachmentRequestV2[],
  updatedCase: Case,
  clientArgs: CasesClientArgs
): Promise<void> => {
  if (!updatedCase.settings?.extractObservables) {
    return;
  }

  const {
    logger,
    services: { alertsService, licensingService },
  } = clientArgs;

  try {
    // License gate
    const hasPlatinumLicenseOrGreater = await licensingService.isAtLeastPlatinum();

    if (!hasPlatinumLicenseOrGreater) {
      logger.debug(
        `[extractAndAddObservables] Skipping observable extraction for case ${caseId}: Platinum license required`
      );
      return;
    }

    licensingService.notifyUsage(LICENSING_CASE_OBSERVABLES_FEATURE);

    const documentInfo = attachments.flatMap(getAlertInfoFromAttachment);

    if (documentInfo.length === 0) {
      return;
    }

    // Fetch the ECS source documents
    const mgetResponse = await alertsService.getAlerts(documentInfo);

    if (!mgetResponse || mgetResponse.docs.length === 0) {
      return;
    }

    // Flatten each _source into FlattedEcsData[] for the extractor
    const ecsDataArray: FlattedEcsData[][] = mgetResponse.docs.reduce<FlattedEcsData[][]>(
      (allDocs, doc) => {
        if ('_source' in doc && doc._source != null && typeof doc._source === 'object') {
          allDocs.push(toFlattedEcsData(getFlattenedObject(doc._source)));
        }
        return allDocs;
      },
      []
    );

    if (ecsDataArray.length === 0) {
      return;
    }

    const observables = getObservablesFromEcs(ecsDataArray);

    if (observables.length === 0) {
      return;
    }

    await applyObservablesToCase(caseId, observables, clientArgs);

    logger.debug(
      `[extractAndAddObservables] Added ${observables.length} observable(s) to case ${caseId}`
    );
  } catch (error) {
    logger.warn(
      `[extractAndAddObservables] Failed to extract observables for case ${caseId}: ${error}`
    );
  }
};
