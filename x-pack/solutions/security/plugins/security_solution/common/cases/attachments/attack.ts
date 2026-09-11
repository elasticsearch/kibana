/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { SECURITY_ATTACK_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';

/**
 * Upper bounds for the metadata strings snapshotted at attach time. Exported so the payload
 * builder truncates against the same numbers the schema validates, rather than duplicating them
 * and risking a 400 on an over-long attack title or summary.
 */
export const MAX_ATTACK_TITLE_LENGTH = 1000;
export const MAX_ATTACK_SUMMARY_MARKDOWN_LENGTH = 4096;
export const MAX_ATTACK_DETAILS_MARKDOWN_LENGTH = 16384;
export const MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH = 1024;
export const MAX_ATTACK_MITRE_ATTACK_TACTICS = 20;
export const MAX_ATTACK_MITRE_ATTACK_TACTIC_LENGTH = 128;
export const MAX_ATTACK_TIMESTAMP_LENGTH = 64;
export const MAX_ATTACK_INDEX_LENGTH = 256;

/**
 * Snapshot of the attack document taken at attach time. The activity-log preview card
 * renders entirely from this metadata so the feed needs no per-attachment query, and so
 * it still says something useful once the attack ages into a cold or frozen tier.
 *
 * Metadata is stored in the saved object `_source` but is never indexed
 * (`cases-attachments` mappings are `dynamic: false`), so it is not searchable and
 * fields added in a later release cannot be backfilled — every renderer must degrade
 * gracefully when an optional field is absent.
 */
const AttackAttachmentMetadataSchema = z
  .object({
    /**
     * The attack's plain-text title, used as the link label in the attachment view.
     *
     * De-anonymised at attach time, unlike `AttackDiscoveryAlert.title`.
     */
    title: z.string().max(MAX_ATTACK_TITLE_LENGTH),
    /**
     * Truncated attack summary markdown captured at attach time.
     *
     * De-anonymised at attach time, unlike `AttackDiscoveryAlert.summaryMarkdown`, so the
     * activity card can render it without a `replacements` map.
     */
    summaryMarkdown: z.string().max(MAX_ATTACK_SUMMARY_MARKDOWN_LENGTH).optional(),
    /**
     * Truncated attack details markdown captured at attach time, rendered as the activity
     * card's "Details" section.
     *
     * De-anonymised at attach time, unlike `AttackDiscoveryAlert.detailsMarkdown`. Optional
     * because attachments written before this field existed cannot be backfilled.
     */
    detailsMarkdown: z.string().max(MAX_ATTACK_DETAILS_MARKDOWN_LENGTH).optional(),
    /**
     * Truncated one-line entity summary markdown captured at attach time.
     *
     * De-anonymised at attach time, unlike `AttackDiscoveryAlert.entitySummaryMarkdown`.
     */
    entitySummaryMarkdown: z.string().max(MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH).optional(),
    /** The MITRE ATT&CK tactic names the attack maps to, rendered as the attack chain. */
    mitreAttackTactics: z
      .array(z.string().max(MAX_ATTACK_MITRE_ATTACK_TACTIC_LENGTH))
      .max(MAX_ATTACK_MITRE_ATTACK_TACTICS)
      .optional(),
    /** ISO timestamp the attack was detected on, rendered as the card's "Detected on" line. */
    timestamp: z.string().max(MAX_ATTACK_TIMESTAMP_LENGTH).optional(),
    /** Optional risk score captured at attach time. The attack document has no `severity`. */
    riskScore: z.number().int().min(0).optional(),
    /** Number of de-anonymised constituent alerts attached alongside the attack. */
    alertCount: z.number().int().min(0),
    /**
     * Number of distinct entities in the attack. Computed at attach time via cardinality
     * aggregations, not stored on the attack document, so it is optional to keep the
     * upgrade path to a live-queried count open.
     */
    entityCount: z.number().int().min(0).optional(),
    /**
     * The index the attached attack lives in — either
     * `alerts-security.attack.discovery.alerts` (scheduled) or
     * `.adhoc.alerts-security.attack.discovery.alerts` (adhoc). Read by the Cases
     * platform (`getIndexFromMetadata`) so the "already attached" duplicate check can
     * pair this attachment's id with an index — unified attachment matching requires a
     * 1:1 id/index mapping, and without it the attachment is dropped from the check.
     * Required here (unlike `security.alert`) because there is no legacy attachment
     * shape to stay compatible with.
     */
    index: z.string().max(MAX_ATTACK_INDEX_LENGTH),
  })
  .strict();

export const AttackAttachmentPayloadSchema = z
  .object({
    type: z.literal(SECURITY_ATTACK_ATTACHMENT_TYPE),
    owner: z.string().max(100),
    /** The attack document `_id`, resolved against `metadata.index`. */
    attachmentId: z.string().max(1000),
    metadata: AttackAttachmentMetadataSchema,
  })
  .strict();

export type AttackAttachmentPayload = z.infer<typeof AttackAttachmentPayloadSchema>;
export type AttackAttachmentMetadata = z.infer<typeof AttackAttachmentMetadataSchema>;
