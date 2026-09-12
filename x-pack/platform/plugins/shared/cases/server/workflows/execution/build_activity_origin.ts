/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CaseWorkflowRunOrigin } from '../../../common/types/api';
import type { WorkflowOrigin, Case } from '../../../common/types/domain';
import {
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
} from '../../../common/constants';
import type { ResolvedWorkflowAttachmentOrigin } from './validate_origin';

/**
 * Enriches an activity origin with display data derived from the already-fetched case:
 * - `cases.attachment` → carries trusted metadata resolved by the registered attachment type.
 * - `cases.attachments` → carries the selected target count.
 * - `cases.observable` → adds `typeKey` and `value` from the matching observable.
 * - all other origins  → converted to the persisted `{ type, id: caseId }` shape.
 *
 * `theCase` is optional because multi-case runs have no sub-entity origin to enrich.
 *
 * We derive enrichment from the case object (not from `inputs.event.*`) because
 * `preprocessAlertInputs` rewrites `event` into a different shape before the run, so
 * reading from `inputs` post-processing would be fragile.
 */
export const buildActivityOrigin = ({
  origin,
  theCase,
  resolvedAttachmentOrigin,
}: {
  origin?: CaseWorkflowRunOrigin;
  theCase?: Case;
  resolvedAttachmentOrigin?: ResolvedWorkflowAttachmentOrigin;
}): WorkflowOrigin | undefined => {
  if (origin === undefined) {
    return undefined;
  }

  if (origin.type === ATTACHMENT_WORKFLOW_ORIGIN_TYPE) {
    const activityOrigin = {
      type: origin.type,
      id: origin.attachmentId,
      attachmentType: origin.attachmentType,
    };
    const index = resolvedAttachmentOrigin?.targets[0]?.index;
    return index !== undefined ? { ...activityOrigin, index } : activityOrigin;
  }

  if (origin.type === ATTACHMENTS_WORKFLOW_ORIGIN_TYPE) {
    return {
      type: origin.type,
      id: origin.caseId,
      attachmentType: origin.attachmentType,
      count: origin.attachmentIds.length,
    };
  }

  if (origin.type === OBSERVABLE_WORKFLOW_ORIGIN_TYPE) {
    const activityOrigin = { type: origin.type, id: origin.observableId };
    const obs = theCase?.observables.find(({ id }) => id === origin.observableId);
    if (obs) {
      return { ...activityOrigin, typeKey: obs.typeKey, value: obs.value };
    }
    return activityOrigin;
  }

  if (origin.type === OBSERVABLES_WORKFLOW_ORIGIN_TYPE) {
    return { type: origin.type, id: origin.caseId, count: origin.observableIds.length };
  }

  return { type: origin.type, id: origin.caseId };
};
