/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense, type ComponentType } from 'react';
import type {
  CaseAttachmentsWithoutOwner,
  CommonAttachmentListViewProps,
  UnifiedReferenceAttachmentViewProps,
} from '@kbn/cases-plugin/public';
import { defineAttachment } from '@kbn/cases-plugin/public';
import {
  AttachmentActionType,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import { MAX_ALERTS_PER_CASE } from '@kbn/cases-plugin/common/constants';
import { EuiLoadingSpinner } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import {
  getOriginalAlertIds,
  replaceAnonymizedValuesWithOriginalValues,
  type Replacements,
} from '@kbn/elastic-assistant-common';
import type {
  AttackAttachmentMetadata,
  AttackAttachmentPayload,
} from '../../../../common/cases/attachments/attack';
import {
  AttackAttachmentPayloadSchema,
  MAX_ATTACK_DETAILS_MARKDOWN_LENGTH,
  MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH,
  MAX_ATTACK_MITRE_ATTACK_TACTIC_LENGTH,
  MAX_ATTACK_MITRE_ATTACK_TACTICS,
  MAX_ATTACK_SUMMARY_MARKDOWN_LENGTH,
  MAX_ATTACK_TIMESTAMP_LENGTH,
  MAX_ATTACK_TITLE_LENGTH,
} from '../../../../common/cases/attachments/attack';

export type { AttackAttachmentMetadata };

/**
 * The attack a call site is attaching, normalised out of whichever surface it came from — the
 * Attacks page table row or the attack flyout.
 */
export interface AttackToAttach {
  /** The attack document `_id`. */
  id: string;
  /**
   * The index the attack document came from — either the scheduled
   * (`.alerts-security.attack.discovery.alerts-*`) or the adhoc
   * (`.adhoc.alerts-security.attack.discovery.alerts-*`) index. Both are attachable; the caller
   * passes whichever the document was read from so the distinction is preserved.
   */
  index: string;
  /**
   * The attack's plain-text title, as it sits on the document — still anonymised. De-anonymised
   * and truncated to the schema bound when it is snapshotted.
   */
  title: string;
  /**
   * The attack's summary markdown, still anonymised. De-anonymised and truncated when
   * snapshotted.
   */
  summaryMarkdown?: string;
  /**
   * The attack's details markdown, still anonymised. De-anonymised and truncated when
   * snapshotted.
   */
  detailsMarkdown?: string;
  /**
   * The attack's one-line entity summary markdown, still anonymised. De-anonymised and truncated
   * when snapshotted.
   */
  entitySummaryMarkdown?: string;
  /** The MITRE ATT&CK tactic names the attack maps to, rendered as the attack chain. */
  mitreAttackTactics?: string[];
  /** The time the attack was generated, rendered as the card's "Detected on" line. */
  timestamp?: string;
  /** The attack's risk score. The attack document has no `severity`. */
  riskScore?: number;
  /**
   * Distinct entity count for the attack. Not stored on the attack document and not cheap to
   * derive (two cardinality aggregations), so call sites that already have it pass it and the
   * rest leave it out — the metadata field is optional.
   */
  entityCount?: number;
  /** Raw `kibana.alert.attack_discovery.alert_ids`, which may still be anonymised. */
  alertIds?: string[];
  /** `kibana.alert.attack_discovery.replacements`, used to reverse the anonymisation. */
  replacements?: Replacements;
  /** The index the constituent detection alerts live in. */
  alertsIndex: string;
}

const AttackAttachmentChildrenLazy = React.lazy(() => import('./components/attachment_children'));
const AttackTabContentLazy = React.lazy(() => import('./components/attack_tab_content'));
const ShowAttackButton = React.lazy(async () => {
  const { ShowAttackButton: Component } = await import('./components/show_attack_button');
  return { default: Component };
});
const RemoveAttackCardAction = React.lazy(async () => {
  const { RemoveAttackCardAction: Component } = await import(
    './components/remove_attack_card_action'
  );
  return { default: Component };
});

const AttackTabContentWrapper: ComponentType<CommonAttachmentListViewProps> = (props) => (
  <Suspense fallback={null}>
    <AttackTabContentLazy {...props} />
  </Suspense>
);

type AttackAttachmentViewProps = UnifiedReferenceAttachmentViewProps<
  AttackAttachmentPayload['metadata'],
  AttackAttachmentPayload['attachmentId']
>;

const DISPLAY_NAME = i18n.translate('xpack.securitySolution.attackDiscovery.cases.displayName', {
  defaultMessage: 'Attacks',
});

export const getAttackAttachment = () =>
  defineAttachment({
    id: SECURITY_ATTACK_ATTACHMENT_TYPE,
    getIcon: () => 'securitySignalDetected',
    getLabel: () => DISPLAY_NAME,
    schema: AttackAttachmentPayloadSchema,
    getCreationActivity: () => ({
      eventColor: 'subdued' as const,
      event: (
        <FormattedMessage
          id="xpack.securitySolution.attackDiscovery.cases.eventDescription"
          defaultMessage="added an attack"
        />
      ),
      children: AttackAttachmentChildrenLazy,
      // The framework's own trash action removes the attack attachment on its own. Attacks bring
      // their constituent alerts onto the case with them, so removal is registered here instead,
      // to offer to take those alerts back off — see `resolveRemovableAlertAttachments` for which
      // of them are actually the attack's to remove.
      hideDefaultActions: true,
      getActions: (actionProps: AttackAttachmentViewProps) => {
        const { attachmentId, caseData, metadata, permissions, savedObjectId } = actionProps;
        if (!metadata) {
          return [];
        }

        return [
          {
            type: AttachmentActionType.CUSTOM as const,
            isPrimary: true,
            render: () => (
              <Suspense fallback={<EuiLoadingSpinner size="m" />}>
                <ShowAttackButton
                  id={savedObjectId}
                  attackId={attachmentId}
                  indexName={metadata.index}
                  attackTitle={metadata.title}
                />
              </Suspense>
            ),
          },
          ...(permissions.delete
            ? [
                {
                  type: AttachmentActionType.CUSTOM as const,
                  isPrimary: true,
                  render: () => (
                    <Suspense fallback={<EuiLoadingSpinner size="m" />}>
                      <RemoveAttackCardAction
                        attackId={attachmentId}
                        attackTitle={metadata.title}
                        caseId={caseData.id}
                        savedObjectId={savedObjectId}
                      />
                    </Suspense>
                  ),
                },
              ]
            : []),
        ];
      },
    }),
    getRemovalActivity: () => ({
      event: (
        <FormattedMessage
          id="xpack.securitySolution.attackDiscovery.cases.removalEventDescription"
          defaultMessage="removed an attack"
        />
      ),
    }),
    // Exposing `children` here is what makes attacks their own section in the consolidated
    // Attachments tab, contributes to the tab badge, and adds the type filter entry — no new
    // tab is registered.
    getAttachmentList: () => ({
      children: AttackTabContentWrapper,
    }),
  });

const FIELD_TOKEN_OPEN = '{{';
const FIELD_TOKEN_CLOSE = '}}';

/**
 * Truncates to `maxLength` without ever cutting inside a `{{ field value }}` token — a half a
 * token renders as literal braces in the markdown formatter, so the cut falls back to the end of
 * the last complete token before the bound.
 */
const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength);
  const tokenStart = truncated.lastIndexOf(FIELD_TOKEN_OPEN);
  const isCutMidToken = tokenStart !== -1 && !truncated.includes(FIELD_TOKEN_CLOSE, tokenStart);

  if (!isCutMidToken) {
    return truncated;
  }

  const previousTokenEnd = truncated.lastIndexOf(FIELD_TOKEN_CLOSE, tokenStart);

  // Nothing complete to fall back to: drop the opening braces rather than emit an unclosed token.
  return previousTokenEnd === -1
    ? truncated.slice(0, tokenStart)
    : truncated.slice(0, previousTokenEnd + FIELD_TOKEN_CLOSE.length);
};

/**
 * De-anonymises then truncates one narrative field, so the snapshot holds text the activity card
 * can render with no `replacements` map. Returns `undefined` for an absent field so it stays out
 * of the metadata rather than being persisted as an empty string.
 */
const snapshotNarrative = (
  value: string | undefined,
  replacements: Replacements | undefined,
  maxLength: number
): string | undefined =>
  value == null
    ? undefined
    : truncate(
        replaceAnonymizedValuesWithOriginalValues({ messageContent: value, replacements }),
        maxLength
      );

/** The `security.attack` attachment as posted to a case — the cases UI injects the `owner`. */
export type AttackAttachmentWithoutOwner = Omit<AttackAttachmentPayload, 'owner'>;

/**
 * The attack's constituent alerts, batched into one attachment the way the alerts table batches
 * a bulk add, so the case activity log gets a single "added N alerts" entry rather than one entry
 * per alert.
 *
 * `metadata.index` stays a scalar: the Cases platform broadcasts a scalar index across every id,
 * and every alert an attack comprises comes from the same alerts index pattern. An array would
 * have to pair 1-to-1 with the ids, repeating the same string up to `MAX_ALERTS_PER_CASE` times.
 */
export interface AlertAttachmentWithoutOwner {
  type: typeof SECURITY_ALERT_ATTACHMENT_TYPE;
  attachmentId: string[];
  metadata: { index: string };
}

/** The attachments to post to a case, plus what had to be dropped to build them. */
export interface AttackAttachmentsResult {
  /**
   * The `security.attack` attachment, followed by the single `security.alert` attachment holding
   * every constituent alert id. The alert attachment is absent when the attack has no alerts.
   *
   * Typed narrower than the framework's `CaseAttachmentsWithoutOwner` union so callers and tests
   * can reach `metadata` without re-narrowing; assignability to the framework type is checked by
   * {@link generateAttackAttachmentsWithoutOwner}.
   */
  attachments: Array<AttackAttachmentWithoutOwner | AlertAttachmentWithoutOwner>;
  /** The attack's full de-anonymised, deduplicated constituent alert count. */
  alertCount: number;
  /** How many alert ids the alert attachment carries — at most `MAX_ALERTS_PER_CASE`. */
  attachedAlertCount: number;
  /** True when the attack has more constituent alerts than a single request may carry. */
  truncated: boolean;
}

/**
 * Builds the attachments for attaching one attack to a case: the `security.attack` attachment
 * carrying the metadata snapshot the activity card renders from, followed by one `security.alert`
 * attachment holding every de-anonymised constituent alert id.
 *
 * The constituent alerts are always included — attaching an attack means attaching the alerts it
 * comprises, so there is no at-attach-time choice about them. They go in a single attachment so
 * the case activity log records them as one "added N alerts" entry, matching a bulk add from the
 * alerts table, rather than burying the attack's own entry under one entry per alert.
 *
 * The narrative fields are de-anonymised here, once, so nothing downstream of the attachment
 * needs the attack's `replacements` map.
 *
 * Returns the truncation counts alongside the attachments so the caller can warn the user when
 * an attack carries more alerts than one request may hold. Use
 * {@link generateAttackAttachmentsWithoutOwner} where that reporting isn't needed.
 *
 * @param attack the attack we're attaching to a case
 */
export const buildAttackAttachments = ({
  id,
  index,
  title,
  summaryMarkdown,
  detailsMarkdown,
  entitySummaryMarkdown,
  mitreAttackTactics,
  timestamp,
  riskScore,
  entityCount,
  alertIds,
  replacements,
  alertsIndex,
}: AttackToAttach): AttackAttachmentsResult => {
  if (!id) {
    return { attachments: [], alertCount: 0, attachedAlertCount: 0, truncated: false };
  }

  // De-anonymise before deduping: distinct anonymised ids can resolve to the same original alert,
  // so deduping the raw ids first would leave duplicates behind.
  const originalAlertIds = [
    ...new Set(getOriginalAlertIds({ alertIds: alertIds ?? [], replacements })),
  ];
  // Cases rejects a request carrying more than MAX_ALERTS_PER_CASE alerts, so cap the batch and
  // let the caller surface what was left off rather than failing the whole attach.
  const attachedAlertIds = originalAlertIds.slice(0, MAX_ALERTS_PER_CASE);

  // Snapshot the narrative de-anonymised: the activity card renders straight from metadata and
  // is never handed a replacements map, so anything left anonymised here stays that way on screen.
  const snapshot = {
    summaryMarkdown: snapshotNarrative(
      summaryMarkdown,
      replacements,
      MAX_ATTACK_SUMMARY_MARKDOWN_LENGTH
    ),
    detailsMarkdown: snapshotNarrative(
      detailsMarkdown,
      replacements,
      MAX_ATTACK_DETAILS_MARKDOWN_LENGTH
    ),
    entitySummaryMarkdown: snapshotNarrative(
      entitySummaryMarkdown,
      replacements,
      MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH
    ),
  };

  const attackAttachment: AttackAttachmentWithoutOwner = {
    type: SECURITY_ATTACK_ATTACHMENT_TYPE,
    attachmentId: id,
    metadata: {
      title: truncate(
        replaceAnonymizedValuesWithOriginalValues({ messageContent: title, replacements }),
        MAX_ATTACK_TITLE_LENGTH
      ),
      // The attack's own alert count, which is what the preview card means by "alerts" — it can
      // exceed the number of ids actually attached when the batch above was capped.
      alertCount: originalAlertIds.length,
      // Lets the Cases platform pair this attachment's id with an index so the "already attached"
      // duplicate check works, and so status sync knows which index to write to.
      index,
      ...(snapshot.summaryMarkdown != null ? { summaryMarkdown: snapshot.summaryMarkdown } : {}),
      ...(snapshot.detailsMarkdown != null ? { detailsMarkdown: snapshot.detailsMarkdown } : {}),
      ...(snapshot.entitySummaryMarkdown != null
        ? { entitySummaryMarkdown: snapshot.entitySummaryMarkdown }
        : {}),
      ...(mitreAttackTactics != null
        ? {
            mitreAttackTactics: mitreAttackTactics
              .slice(0, MAX_ATTACK_MITRE_ATTACK_TACTICS)
              .map((tactic) => truncate(tactic, MAX_ATTACK_MITRE_ATTACK_TACTIC_LENGTH)),
          }
        : {}),
      ...(timestamp != null ? { timestamp: truncate(timestamp, MAX_ATTACK_TIMESTAMP_LENGTH) } : {}),
      ...(riskScore != null ? { riskScore } : {}),
      ...(entityCount != null ? { entityCount } : {}),
    } satisfies AttackAttachmentMetadata,
  };

  const alertAttachments: AlertAttachmentWithoutOwner[] =
    attachedAlertIds.length > 0
      ? [
          {
            type: SECURITY_ALERT_ATTACHMENT_TYPE,
            attachmentId: attachedAlertIds,
            // The index is what makes the duplicate check and status sync work for these alerts too.
            metadata: { index: alertsIndex },
          },
        ]
      : [];

  return {
    attachments: [attackAttachment, ...alertAttachments],
    alertCount: originalAlertIds.length,
    attachedAlertCount: attachedAlertIds.length,
    truncated: originalAlertIds.length > attachedAlertIds.length,
  };
};

/**
 * {@link buildAttackAttachments} narrowed to the cases-framework "without owner" payload — the
 * cases UI injects the `owner` at creation time, so callers hand the attachments over without it.
 * Returns an empty array when the attack has no id.
 *
 * @param attack the attack we're attaching to a case
 */
export const generateAttackAttachmentsWithoutOwner = (
  attack: AttackToAttach
): CaseAttachmentsWithoutOwner => buildAttackAttachments(attack).attachments;
