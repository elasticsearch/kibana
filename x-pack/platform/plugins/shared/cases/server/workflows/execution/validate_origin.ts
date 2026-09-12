/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { isPlainObject } from 'lodash';
import type {
  CaseWorkflowRunOrigin,
  DocumentResponse,
  AttachmentRequestV2,
} from '../../../common/types/api';
import {
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
  MAX_ALERTS_PER_CASE,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
} from '../../../common/constants';
import type { Case } from '../../../common/types/domain';
import { resolveUnifiedAttachmentType, isNonEmptyString } from '../../../common/utils/attachments';
import { toUnifiedAttachmentPayload } from '../../common/attachments';
import type {
  UnifiedAttachmentState,
  WorkflowAttachmentTarget,
} from '../../attachment_framework/types';
import type { UnifiedAttachmentTypeRegistry } from '../../attachment_framework/unified_attachment_registry';

const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  isPlainObject(value) ? (value as Record<string, unknown>) : undefined;

interface DocumentPair {
  _id: string;
  _index: string;
}

interface DocumentValidationContext {
  selected: DocumentPair[];
  attached: DocumentResponse;
}

/** The maximum number of documents that may be submitted in `inputs.event.documents` per run. */
const MAX_DOCUMENTS_PER_WORKFLOW_RUN = 1000 as const;

/**
 * Shared parser for `(id, index)` pair arrays in `inputs.event`.
 *
 * Malformed entries are rejected, never skipped. A nullish or missing value is treated as
 * "no pairs present".
 */
const parseIndexedPairs = (value: unknown, inputPath: string, max: number): DocumentPair[] => {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw Boom.badRequest(`${inputPath} must be an array.`);
  }

  if (value.length > max) {
    throw Boom.badRequest(`${inputPath} cannot contain more than ${max} entries.`);
  }

  return value.map((entry) => {
    const record = getRecord(entry);
    if (
      record === undefined ||
      typeof record._id !== 'string' ||
      typeof record._index !== 'string'
    ) {
      throw Boom.badRequest(
        `Every ${inputPath} entry must be an object with string "_id" and "_index" properties.`
      );
    }
    return { _id: record._id, _index: record._index };
  });
};

/**
 * Reads the (id, index) pairs from `inputs.event.alertIds`.
 *
 * Malformed entries are rejected, never skipped. The pairs returned here are the ones
 * `validateOrigin` checks for case membership, while alert preprocessing fetches from the *raw*
 * `inputs.event.alertIds` array — so dropping an entry would let it escape the membership check
 * and still be fetched and injected into the workflow event. A nullish `alertIds` is treated as
 * "no alert inputs" to match how preprocessing decides whether to expand alerts at all.
 */
export const parseSelectedAlertPairs = (inputs: Record<string, unknown>): DocumentPair[] => {
  const { alertIds } = getRecord(inputs.event) ?? {};
  // A selected alert must be attached to the case, and a case holds at most MAX_ALERTS_PER_CASE
  // alerts, so anything larger cannot be legitimate — and would become an mget of that size.
  return parseIndexedPairs(alertIds, 'inputs.event.alertIds', MAX_ALERTS_PER_CASE);
};

/**
 * Reads the (id, index) pairs from `inputs.event.documents`.
 *
 * Unlike alerts, documents are not re-fetched by `preprocessAlertInputs` (which early-returns for
 * non-alert triggers) — they are forwarded verbatim to the workflow engine. This check therefore
 * prevents a caller from referencing documents outside the case. Content of the forwarded
 * documents remains client-supplied; activity enrichment is derived server-side from the case.
 *
 * Malformed entries are rejected, never skipped. A nullish or missing value is treated as
 * "no document inputs".
 */
export const parseSelectedDocumentPairs = (inputs: Record<string, unknown>): DocumentPair[] => {
  const { documents } = getRecord(inputs.event) ?? {};
  return parseIndexedPairs(documents, 'inputs.event.documents', MAX_DOCUMENTS_PER_WORKFLOW_RUN);
};

const getDefaultTargets = ({
  attachment,
  savedObjectId,
}: {
  attachment: UnifiedAttachmentState;
  savedObjectId: string;
}): WorkflowAttachmentTarget[] => {
  if (!('attachmentId' in attachment)) {
    return [{ id: savedObjectId }];
  }

  // Pair each id with its corresponding index using the same rule as normalizeDocumentResponse
  // and getAndValidateIndexedAttachmentInfo: a scalar metadata.index broadcasts to every id,
  // an array pairs 1-to-1, and a length mismatch (array case) drops the whole attachment.
  // `toStringArray` is deliberately NOT used here — it filters entries, which would corrupt the
  // positional relationship.
  const rawAttachmentId = attachment.attachmentId;
  const rawIds = Array.isArray(rawAttachmentId) ? rawAttachmentId : [rawAttachmentId];
  const rawIndex = getRecord(attachment.metadata)?.index;
  // A non-empty string index is broadcast to every id; an array is paired positionally.
  const broadcastIndex = isNonEmptyString(rawIndex) ? rawIndex : undefined;
  const rawIndices = Array.isArray(rawIndex) ? rawIndex : [];

  const validIds = rawIds.filter(isNonEmptyString);
  // Drop the whole attachment when indices are provided as an array that doesn't pair 1-to-1 with
  // ids — an ambiguous pairing cannot produce reliable targets. This mirrors normalizeDocumentResponse.
  if (!broadcastIndex && rawIndices.length > 0 && validIds.length !== rawIndices.length) {
    return [];
  }

  return validIds.map((rawId, position) => {
    const candidateIndex = broadcastIndex ?? rawIndices[position];
    return isNonEmptyString(candidateIndex) ? { id: rawId, index: candidateIndex } : { id: rawId };
  });
};

export interface ResolvedWorkflowAttachmentOrigin {
  targets: WorkflowAttachmentTarget[];
}

const resolveAttachmentOrigin = ({
  origin,
  theCase,
  attachmentTypeRegistry,
}: {
  origin: Extract<
    CaseWorkflowRunOrigin,
    { type: typeof ATTACHMENT_WORKFLOW_ORIGIN_TYPE | typeof ATTACHMENTS_WORKFLOW_ORIGIN_TYPE }
  >;
  theCase: Case;
  attachmentTypeRegistry: UnifiedAttachmentTypeRegistry;
}): ResolvedWorkflowAttachmentOrigin => {
  if (!attachmentTypeRegistry.has(origin.attachmentType)) {
    throw Boom.badRequest(`Attachment type "${origin.attachmentType}" is not registered.`);
  }

  const attachmentType = attachmentTypeRegistry.get(origin.attachmentType);
  if (attachmentType.workflow === undefined) {
    throw Boom.badRequest(
      `Attachment type "${origin.attachmentType}" does not support workflow origins.`
    );
  }

  const availableTargets = (theCase.comments ?? [])
    .filter(
      (attachment) =>
        resolveUnifiedAttachmentType(attachment, theCase.owner) === origin.attachmentType
    )
    .flatMap((attachment) => {
      // Skip attachments that cannot be converted to unified format (e.g. attachments whose saved
      // object schema is incompatible). One malformed sibling must not prevent a valid attachment
      // from being targeted.
      let unifiedAttachment: UnifiedAttachmentState;
      try {
        unifiedAttachment = toUnifiedAttachmentPayload({
          ...attachment,
          owner: attachment.owner ?? theCase.owner,
        } as AttachmentRequestV2) as UnifiedAttachmentState;
      } catch {
        return [];
      }
      const context = { attachment: unifiedAttachment, savedObjectId: attachment.id };
      return attachmentType.workflow?.getTargets?.(context) ?? getDefaultTargets(context);
    });
  // Group targets by id. An id appearing under more than one index is ambiguous — the origin
  // carries only an id, so there is no way to determine which index to record in the activity
  // log. `targetsById` records all matches so the ambiguity can be detected and rejected below
  // rather than silently picking whichever the flatMap visited last.
  const targetsById = new Map<string, WorkflowAttachmentTarget[]>();
  for (const target of availableTargets) {
    const existing = targetsById.get(target.id);
    if (existing !== undefined) {
      existing.push(target);
    } else {
      targetsById.set(target.id, [target]);
    }
  }

  const requestedIds =
    origin.type === ATTACHMENT_WORKFLOW_ORIGIN_TYPE ? [origin.attachmentId] : origin.attachmentIds;
  const seen = new Set<string>();
  const targets = requestedIds.map((id) => {
    if (seen.has(id)) {
      throw Boom.badRequest(`Attachment ids must not contain duplicates (found "${id}").`);
    }
    seen.add(id);

    const matches = targetsById.get(id);
    if (matches === undefined) {
      throw Boom.badRequest(
        `Attachment target "${id}" of type "${origin.attachmentType}" does not belong to case "${theCase.id}".`
      );
    }
    // Reject ambiguous cases where the same id is attached under different *defined* indices.
    // An activity log entry records only one index, so picking silently would be wrong.
    // Omit undefined from the set: a target may legitimately resolve both with and without an
    // index (e.g. a positionally-absent index in `getDefaultTargets`), and only a true conflict
    // between two distinct non-null index values is genuinely ambiguous.
    const uniqueIndices = new Set(matches.map((t) => t.index).filter((i) => i !== undefined));
    if (uniqueIndices.size > 1) {
      throw Boom.badRequest(
        `Attachment target "${id}" of type "${origin.attachmentType}" is attached to case "${theCase.id}" under multiple indices.`
      );
    }
    // Prefer the match that carries a defined index so the activity row records the real index.
    return matches.find((t) => t.index !== undefined) ?? matches[0];
  });

  return { targets };
};

/**
 * Enforces the generic origin↔inputs alignment for attachment types registered as `workflow: {}`
 * (with no `validateTargets` hook). Every origin target must appear in the selected alerts or
 * selected documents, and at least one selection is required.
 *
 * Types that supply `validateTargets` take full responsibility for alignment and skip this check.
 * Note: a type whose workflow inputs use neither `alertIds` nor `documents` cannot pass the
 * generic check and must provide its own `validateTargets` hook.
 */
const validateDefaultTargetAlignment = ({
  targets,
  selectedAlerts,
  selectedDocuments,
}: {
  targets: WorkflowAttachmentTarget[];
  selectedAlerts: DocumentPair[];
  selectedDocuments: DocumentPair[];
}): void => {
  const selection = [...selectedAlerts, ...selectedDocuments];
  if (selection.length === 0) {
    throw Boom.badRequest('Attachment workflow origins require selected alert or document inputs.');
  }
  const selectedIds = new Set(selection.map(({ _id }) => _id));
  const unselected = targets.find(({ id }) => !selectedIds.has(id));
  if (unselected !== undefined) {
    throw Boom.badRequest(`Attachment workflow origin "${unselected.id}" is not selected.`);
  }
};

/**
 * Validates that the requested workflow `origin` is consistent with the case
 * and, when alert or document inputs are present, that every selected item is attached
 * to the case.
 *
 * The alert-membership check (Step 2) and document-membership check (Step 3) are both
 * enforced regardless of `origin.type` so callers cannot bypass them by using a `cases.case`
 * or `cases.observable` origin type while still injecting arbitrary documents into the workflow.
 *
 * `selectedAlerts` must come from `parseSelectedAlertPairs` and `selectedDocuments` must come
 * from `parseSelectedDocumentPairs` — each is the sole reader of its respective input field,
 * which keeps the validated set identical to the set that processing later uses.
 */
export const validateOrigin = ({
  origin,
  theCase,
  inputs,
  attachmentTypeRegistry,
  alerts: { selected: selectedAlerts, attached: attachedAlerts },
  documents: { selected: selectedDocuments, attached: attachedEvents },
}: {
  origin: CaseWorkflowRunOrigin;
  theCase: Case;
  inputs: Record<string, unknown>;
  attachmentTypeRegistry: UnifiedAttachmentTypeRegistry;
  alerts: DocumentValidationContext;
  documents: DocumentValidationContext;
}): ResolvedWorkflowAttachmentOrigin | undefined => {
  const { id: caseId } = theCase;

  // Step 1 — origin-entity membership checks.
  if (origin.caseId !== caseId) {
    throw Boom.badRequest(`Workflow origin caseId must match case id "${caseId}".`);
  }
  if (
    origin.type === OBSERVABLE_WORKFLOW_ORIGIN_TYPE &&
    !theCase.observables.some(({ id }) => id === origin.observableId)
  ) {
    throw Boom.badRequest(
      `Observable "${origin.observableId}" does not belong to case "${caseId}".`
    );
  }
  if (origin.type === OBSERVABLES_WORKFLOW_ORIGIN_TYPE) {
    const observableIdSet = new Set(theCase.observables.map(({ id }) => id));
    const seen = new Set<string>();
    for (const observableId of origin.observableIds) {
      if (seen.has(observableId)) {
        throw Boom.badRequest(
          `observableIds must not contain duplicates (found "${observableId}").`
        );
      }
      seen.add(observableId);
      if (!observableIdSet.has(observableId)) {
        throw Boom.badRequest(`Observable "${observableId}" does not belong to case "${caseId}".`);
      }
    }
  }

  const attachmentOrigin =
    origin.type === ATTACHMENT_WORKFLOW_ORIGIN_TYPE ||
    origin.type === ATTACHMENTS_WORKFLOW_ORIGIN_TYPE
      ? origin
      : undefined;
  const resolvedAttachmentOrigin =
    attachmentOrigin !== undefined
      ? resolveAttachmentOrigin({ origin: attachmentOrigin, theCase, attachmentTypeRegistry })
      : undefined;

  // Step 2 — alert-membership check: applied whenever alertIds appear in inputs,
  // regardless of origin type, using (id, index) pairs for precise matching.
  // `selectedAlerts` comes from `parseSelectedAlertPairs` — the same parsed set that alert
  // preprocessing will later fetch, so the validated set and the fetched set are identical.
  if (selectedAlerts.length > 0) {
    const attachedPairs = new Set(attachedAlerts.map(({ id, index }) => `${id}|${index}`));
    if (selectedAlerts.some(({ _id, _index }) => !attachedPairs.has(`${_id}|${_index}`))) {
      throw Boom.badRequest('All selected alerts must belong to the case.');
    }
  }

  // Step 3 — document-membership check: applied whenever documents appear in inputs,
  // regardless of origin type, using (id, index) pairs for precise matching.
  // Unlike alerts, documents are forwarded verbatim (no server-side re-fetch), so this check
  // is the only guard against a caller referencing documents outside the case.
  if (selectedDocuments.length > 0) {
    const attachedEventPairs = new Set(attachedEvents.map(({ id, index }) => `${id}|${index}`));
    if (selectedDocuments.some(({ _id, _index }) => !attachedEventPairs.has(`${_id}|${_index}`))) {
      throw Boom.badRequest('All selected documents must belong to the case.');
    }
  }

  if (resolvedAttachmentOrigin !== undefined && attachmentOrigin !== undefined) {
    const { validateTargets } =
      attachmentTypeRegistry.get(attachmentOrigin.attachmentType).workflow ?? {};

    if (validateTargets !== undefined) {
      validateTargets({ targets: resolvedAttachmentOrigin.targets, inputs });
    } else {
      // When the attachment type does not supply its own validator, Cases enforces a generic
      // default: the origin targets must correspond to selected alert or document inputs.
      // Without this floor a caller can name attachment target A while passing a disjoint
      // (but case-attached) input B, and the activity row would record "ran W on A" while
      // the workflow received B.
      validateDefaultTargetAlignment({
        targets: resolvedAttachmentOrigin.targets,
        selectedAlerts,
        selectedDocuments,
      });
    }
  }

  return resolvedAttachmentOrigin;
};
