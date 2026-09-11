/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SECURITY_ATTACK_ATTACHMENT_TYPE, type CaseUI } from '@kbn/cases-plugin/common';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import {
  ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX,
  ATTACK_DISCOVERY_ALERTS_COMMON_INDEX_PREFIX,
  getOriginalAlertIds,
} from '@kbn/elastic-assistant-common';
import type { AttackAttachmentPayload } from '../../../../common/cases/attachments/attack';

export type CaseAttachment = CaseUI['comments'][number];

/**
 * Column ids for the attacks section of the case Attachments tab.
 *
 * Stable identifiers rather than field paths: the user's persisted column selection is keyed
 * off them, so renaming one silently discards a saved selection.
 */
export const ATTACK_TAB_COLUMN_ID = {
  actions: 'actions',
  detectedOn: 'detectedOn',
  title: 'title',
  alerts: 'alerts',
  summary: 'summary',
  riskScore: 'riskScore',
  status: 'status',
  attachedBy: 'attachedBy',
  attachedAt: 'attachedAt',
} as const;

export type AttackTabColumnId = (typeof ATTACK_TAB_COLUMN_ID)[keyof typeof ATTACK_TAB_COLUMN_ID];

/**
 * The columns shown before the user picks their own, in render order.
 *
 * `actions` is absent because it is a leading control column, which the grid renders outside
 * the visible-column list; risk score, status and the attachment-provenance columns are
 * available from the column picker.
 */
export const DEFAULT_ATTACK_TAB_COLUMN_IDS: readonly AttackTabColumnId[] = [
  ATTACK_TAB_COLUMN_ID.detectedOn,
  ATTACK_TAB_COLUMN_ID.title,
  ATTACK_TAB_COLUMN_ID.alerts,
  ATTACK_TAB_COLUMN_ID.summary,
];

/**
 * The columns the column picker offers, in the order the grid declares them.
 *
 * `actions` is absent for the same reason it is absent from the defaults: the grid renders it as
 * a leading control column, outside the visible-column list the picker drives.
 */
export const PICKABLE_ATTACK_TAB_COLUMN_IDS: readonly AttackTabColumnId[] = [
  ATTACK_TAB_COLUMN_ID.detectedOn,
  ATTACK_TAB_COLUMN_ID.title,
  ATTACK_TAB_COLUMN_ID.alerts,
  ATTACK_TAB_COLUMN_ID.summary,
  ATTACK_TAB_COLUMN_ID.riskScore,
  ATTACK_TAB_COLUMN_ID.status,
  ATTACK_TAB_COLUMN_ID.attachedBy,
  ATTACK_TAB_COLUMN_ID.attachedAt,
];

const PICKABLE_ATTACK_TAB_COLUMN_ID_SET: ReadonlySet<string> = new Set(
  PICKABLE_ATTACK_TAB_COLUMN_IDS
);

/**
 * localStorage key for the persisted column selection, namespaced to the case attachment so it
 * cannot collide with the same columns on the Attacks page or with the entities section.
 */
export const ATTACK_CASE_ATTACHMENT_COLUMNS_LOCAL_STORAGE_KEY =
  'securitySolution.attackDiscovery.cases.attachment.columns';

/**
 * Narrows a column selection read back from localStorage to the ids this grid can still render,
 * falling back to the defaults when it holds nothing usable.
 *
 * The runtime shape checks are not redundant with the declared type: the value is whatever was
 * last written under the key, by any release, and a visible column the grid has no definition
 * for renders as a blank column the picker offers no way to take back off.
 */
export const toVisibleAttackTabColumnIds = (
  persisted: readonly string[] | null | undefined
): AttackTabColumnId[] => {
  const pickable = Array.isArray(persisted)
    ? persisted.filter((columnId): columnId is AttackTabColumnId =>
        PICKABLE_ATTACK_TAB_COLUMN_ID_SET.has(columnId)
      )
    : [];

  return pickable.length > 0 ? pickable : [...DEFAULT_ATTACK_TAB_COLUMN_IDS];
};

/**
 * A `security.attack` attachment narrowed to the fields the attachments section renders: the
 * attack document id, the snapshot metadata, and who attached it when.
 */
export type AttackCaseAttachmentRow = CaseAttachment & {
  attachmentId: string;
  metadata: AttackAttachmentPayload['metadata'];
};

/**
 * Narrows to a `security.attack` attachment, rejecting alert attachments (which batch their
 * ids into an array) and attachments with no metadata. Metadata is required for
 * `security.attack`, but it is stored unindexed in `_source` and is not re-validated on read,
 * so the guard keeps the renderer honest.
 */
export const isAttackAttachment = (comment: CaseAttachment): comment is AttackCaseAttachmentRow => {
  // Cast to a loose shape so we can access fields that only exist on some union members.
  const candidate = comment as {
    type?: string;
    attachmentId?: string | string[]; // alerts batch as string[], attacks are always string
    metadata?: object | null;
  };
  return (
    candidate.type === SECURITY_ATTACK_ATTACHMENT_TYPE &&
    typeof candidate.attachmentId === 'string' &&
    candidate.metadata != null
  );
};

/**
 * Case-insensitive match against the snapshotted attack title and summary, and against the
 * attack document id so a user pasting an id from elsewhere finds the row.
 *
 * Matches on the persisted metadata rather than the live attack so the section can filter
 * without waiting on the search request.
 */
export const matchesSearchTerm = (
  attachment: Pick<AttackAttachmentPayload, 'attachmentId' | 'metadata'>,
  searchTerm: string
): boolean => {
  const { attachmentId, metadata } = attachment;
  const searchableText = `${attachmentId} ${metadata.title ?? ''} ${
    metadata.summaryMarkdown ?? ''
  }`.toLowerCase();
  return searchableText.includes(searchTerm.toLowerCase());
};

/**
 * An attack's constituent detection alert ids, de-anonymised and deduplicated — distinct
 * anonymised ids can resolve to the same original alert.
 *
 * Empty for an attack the live query could not resolve: the ids live on the attack document, and
 * the attachment snapshot records only how many there were.
 */
export const getAttackAlertIds = (attack: AttackDiscoveryAlert | undefined): string[] =>
  attack == null
    ? []
    : [
        ...new Set(
          getOriginalAlertIds({
            alertIds: attack.alertIds ?? [],
            replacements: attack.replacements,
          })
        ),
      ];

/**
 * Maps the index snapshotted on the attachment to a pattern the attack flyout can actually read.
 *
 * `metadata.index` is the attack document's `_index` — the concrete backing index, e.g.
 * `.internal.alerts-security.attack.discovery.alerts-default-000001` — because that is what the
 * find API returns. Alert index privileges are granted on the alias
 * (`.alerts-security.attack.discovery.alerts*`), not on that backing index, so looking the
 * document up by its raw `_index` resolves nothing and the flyout renders its error state. Every
 * other caller that opens the attack flyout passes an index *pattern* for the same reason.
 *
 * Normalising here rather than at attach time is deliberate: attachment metadata is stored
 * unindexed and cannot be backfilled, so a write-time fix would leave already-attached attacks
 * permanently unopenable.
 *
 * Anything that matches neither attack-discovery index family is passed through unchanged — it is
 * already whatever the caller meant, and guessing would be worse than trying it.
 */
export const toReadableAttackIndexPattern = (index: string): string => {
  // Checked first: the adhoc index name contains the scheduled prefix as a substring.
  if (index.includes(ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX)) {
    return `${ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX}-*`;
  }
  if (index.includes(ATTACK_DISCOVERY_ALERTS_COMMON_INDEX_PREFIX)) {
    return `${ATTACK_DISCOVERY_ALERTS_COMMON_INDEX_PREFIX}-*`;
  }
  return index;
};
