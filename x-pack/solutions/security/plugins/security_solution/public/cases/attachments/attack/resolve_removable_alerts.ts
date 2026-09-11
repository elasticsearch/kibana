/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isUnifiedAlertAttachment, toStringArray } from '@kbn/cases-plugin/common';
import type { CaseAttachment } from './utils';

/**
 * A `security.alert` attachment on the case, reduced to the two things the resolution needs:
 * the saved object id (what the bulk-delete endpoint takes) and the de-anonymised alert
 * document ids it references.
 *
 * A single alert attachment can reference several alerts, so the alert ids are an array.
 */
export interface CaseAlertAttachment {
  /** The attachment saved object id. */
  id: string;
  /** The de-anonymised alert document ids this attachment references. */
  alertIds: readonly string[];
}

/**
 * The outcome of resolving which alerts an attack may take with it when removed.
 */
export interface RemovableAlertAttachments {
  /** Attachment saved object ids to pass to the bulk-delete endpoint. */
  attachmentIds: string[];
  /** The alert document ids those attachments cover, for the count shown in the prompt. */
  alertIds: string[];
  /**
   * False when at least one attack attachment on the case could not be resolved — either the
   * one being removed, or another one whose claims would otherwise be invisible. The prompt
   * uses this to disable the checkbox with an explanation rather than silently offering to
   * remove nothing.
   */
  isResolvable: boolean;
}

const EMPTY_UNRESOLVABLE: RemovableAlertAttachments = {
  attachmentIds: [],
  alertIds: [],
  isResolvable: false,
};

/**
 * Extracts the case's `security.alert` attachments in the shape
 * {@link resolveRemovableAlertAttachments} consumes.
 *
 * Only unified alert attachments are considered: the attack attach path writes
 * `security.alert`, so a legacy alert attachment on the case was never brought in by an
 * attack and must not be swept up by one being removed.
 */
export const getCaseAlertAttachments = (
  comments: readonly CaseAttachment[]
): CaseAlertAttachment[] =>
  comments.flatMap((comment) =>
    isUnifiedAlertAttachment(comment)
      ? [{ id: comment.id, alertIds: toStringArray(comment.attachmentId) }]
      : []
  );

/**
 * Decides which alert attachments may be removed alongside an attack attachment.
 *
 * The attack's alert ids are read live from `kibana.alert.attack_discovery.alert_ids` rather
 * than snapshotted onto the attachment, so this is the intersection of the attack's *current*
 * alert set with what is actually on the case, minus anything another attached attack still
 * claims. Three consequences, all deliberate:
 *
 * - An alert that left the attack since attach time is never returned. The attachment records
 *   what the analyst captured; orphaned evidence stays on the case.
 * - Attack↔alert is many-to-many, so an alert claimed by another attack attached to the same
 *   case is excluded — removing this attack must not strip evidence from that one.
 * - An alert attachment referencing several alerts can only be deleted whole, so it is
 *   returned only when *every* alert it references is removable. A partially-shared
 *   attachment stays, again erring toward keeping evidence.
 *
 * Returns an empty, non-resolvable result rather than throwing when an alert set is missing —
 * a deleted attack, one aged into a frozen tier, or one outside the user's access all arrive
 * as `undefined`. An unresolved *other* attack blocks the whole result because there is no way
 * to prove an alert is not shared with it.
 *
 * @param attackAlertIds de-anonymised alert ids of the attack being removed, or `undefined`/`null` when it could not be resolved.
 * @param alertAttachments the case's `security.alert` attachments, from {@link getCaseAlertAttachments}.
 * @param otherAttackAlertIds de-anonymised alert ids of every *other* attack attachment on the case, one entry each, `undefined`/`null` where unresolved.
 */
export const resolveRemovableAlertAttachments = ({
  attackAlertIds,
  alertAttachments,
  otherAttackAlertIds,
}: {
  attackAlertIds: readonly string[] | undefined | null;
  alertAttachments: readonly CaseAlertAttachment[];
  otherAttackAlertIds: ReadonlyArray<readonly string[] | undefined | null>;
}): RemovableAlertAttachments => {
  if (attackAlertIds == null || otherAttackAlertIds.some((ids) => ids == null)) {
    return EMPTY_UNRESOLVABLE;
  }

  const attackAlertIdSet = new Set(attackAlertIds);
  const claimedByOtherAttacks = new Set(otherAttackAlertIds.flatMap((ids) => ids ?? []));

  const attachmentIds: string[] = [];
  const alertIds = new Set<string>();

  for (const { id, alertIds: attachmentAlertIds } of alertAttachments) {
    // An empty attachment cannot be attributed to this attack, so leave it alone.
    const isRemovable =
      attachmentAlertIds.length > 0 &&
      attachmentAlertIds.every(
        (alertId) => attackAlertIdSet.has(alertId) && !claimedByOtherAttacks.has(alertId)
      );

    if (isRemovable) {
      attachmentIds.push(id);
      attachmentAlertIds.forEach((alertId) => alertIds.add(alertId));
    }
  }

  return { attachmentIds, alertIds: Array.from(alertIds), isResolvable: true };
};
