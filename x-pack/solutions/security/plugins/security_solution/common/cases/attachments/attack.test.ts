/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SECURITY_ATTACK_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import {
  AttackAttachmentPayloadSchema,
  MAX_ATTACK_DETAILS_MARKDOWN_LENGTH,
  MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH,
  MAX_ATTACK_MITRE_ATTACK_TACTIC_LENGTH,
  MAX_ATTACK_MITRE_ATTACK_TACTICS,
  MAX_ATTACK_SUMMARY_MARKDOWN_LENGTH,
  MAX_ATTACK_TIMESTAMP_LENGTH,
} from './attack';

describe('AttackAttachmentPayloadSchema', () => {
  const minimalPayload = {
    type: SECURITY_ATTACK_ATTACHMENT_TYPE,
    owner: 'securitySolution',
    attachmentId: 'attack-1',
    metadata: {
      title: 'Coordinated credential access',
      alertCount: 3,
      index: '.alerts-security.attack.discovery.alerts-default',
    },
  };

  it('accepts a payload with only the required fields', () => {
    expect(AttackAttachmentPayloadSchema.safeParse(minimalPayload).success).toBe(true);
  });

  it('accepts a payload with every optional metadata field populated', () => {
    expect(
      AttackAttachmentPayloadSchema.safeParse({
        ...minimalPayload,
        metadata: {
          ...minimalPayload.metadata,
          summaryMarkdown: 'An attacker **escalated** privileges on `host-1`.',
          detailsMarkdown: '- The attacker ran `whoami` on `host-1`.',
          entitySummaryMarkdown: '`host-1` and `alice`',
          mitreAttackTactics: ['Credential Access', 'Privilege Escalation'],
          timestamp: '2026-08-27T12:00:00.000Z',
          riskScore: 73,
          entityCount: 2,
        },
      }).success
    ).toBe(true);
  });

  describe('attachments written before the narrative fields existed', () => {
    it('accepts metadata carrying only title, alertCount and index', () => {
      expect(AttackAttachmentPayloadSchema.safeParse(minimalPayload).success).toBe(true);
    });

    it('accepts metadata carrying only the legacy optional fields alongside them', () => {
      expect(
        AttackAttachmentPayloadSchema.safeParse({
          ...minimalPayload,
          metadata: {
            ...minimalPayload.metadata,
            summaryMarkdown: 'An attacker escalated privileges on host-1.',
            riskScore: 73,
          },
        }).success
      ).toBe(true);
    });
  });

  it('accepts an adhoc attack index', () => {
    expect(
      AttackAttachmentPayloadSchema.safeParse({
        ...minimalPayload,
        metadata: {
          ...minimalPayload.metadata,
          index: '.adhoc.alerts-security.attack.discovery.alerts-default',
        },
      }).success
    ).toBe(true);
  });

  it('rejects an unknown metadata key (strict)', () => {
    expect(
      AttackAttachmentPayloadSchema.safeParse({
        ...minimalPayload,
        metadata: { ...minimalPayload.metadata, severity: 'high' },
      }).success
    ).toBe(false);
  });

  it('rejects an unknown top-level key (strict)', () => {
    expect(
      AttackAttachmentPayloadSchema.safeParse({ ...minimalPayload, extra: 'nope' }).success
    ).toBe(false);
  });

  it('rejects a missing index', () => {
    const { index, ...metadataWithoutIndex } = minimalPayload.metadata;
    expect(
      AttackAttachmentPayloadSchema.safeParse({
        ...minimalPayload,
        metadata: metadataWithoutIndex,
      }).success
    ).toBe(false);
  });

  it('rejects missing metadata (metadata is required)', () => {
    const { metadata, ...payloadWithoutMetadata } = minimalPayload;
    expect(AttackAttachmentPayloadSchema.safeParse(payloadWithoutMetadata).success).toBe(false);
  });

  it('rejects a wrong type literal', () => {
    expect(
      AttackAttachmentPayloadSchema.safeParse({ ...minimalPayload, type: 'security.alert' }).success
    ).toBe(false);
  });

  describe('bounds', () => {
    const parseWithMetadata = (metadata: Record<string, unknown>) =>
      AttackAttachmentPayloadSchema.safeParse({
        ...minimalPayload,
        metadata: { ...minimalPayload.metadata, ...metadata },
      }).success;

    it('rejects a summaryMarkdown over the bound', () => {
      expect(
        parseWithMetadata({ summaryMarkdown: 'a'.repeat(MAX_ATTACK_SUMMARY_MARKDOWN_LENGTH + 1) })
      ).toBe(false);
    });

    it('rejects a detailsMarkdown over the bound', () => {
      expect(
        parseWithMetadata({ detailsMarkdown: 'a'.repeat(MAX_ATTACK_DETAILS_MARKDOWN_LENGTH + 1) })
      ).toBe(false);
    });

    it('rejects an entitySummaryMarkdown over the bound', () => {
      expect(
        parseWithMetadata({
          entitySummaryMarkdown: 'a'.repeat(MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH + 1),
        })
      ).toBe(false);
    });

    it('rejects more mitreAttackTactics than the array bound', () => {
      expect(
        parseWithMetadata({
          mitreAttackTactics: new Array(MAX_ATTACK_MITRE_ATTACK_TACTICS + 1).fill('Execution'),
        })
      ).toBe(false);
    });

    it('rejects a mitreAttackTactics element over the element bound', () => {
      expect(
        parseWithMetadata({
          mitreAttackTactics: ['a'.repeat(MAX_ATTACK_MITRE_ATTACK_TACTIC_LENGTH + 1)],
        })
      ).toBe(false);
    });

    it('rejects a timestamp over the bound', () => {
      expect(parseWithMetadata({ timestamp: 'a'.repeat(MAX_ATTACK_TIMESTAMP_LENGTH + 1) })).toBe(
        false
      );
    });

    it('accepts every new field exactly at its bound', () => {
      expect(
        parseWithMetadata({
          summaryMarkdown: 'a'.repeat(MAX_ATTACK_SUMMARY_MARKDOWN_LENGTH),
          detailsMarkdown: 'a'.repeat(MAX_ATTACK_DETAILS_MARKDOWN_LENGTH),
          entitySummaryMarkdown: 'a'.repeat(MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH),
          mitreAttackTactics: new Array(MAX_ATTACK_MITRE_ATTACK_TACTICS).fill(
            'a'.repeat(MAX_ATTACK_MITRE_ATTACK_TACTIC_LENGTH)
          ),
          timestamp: 'a'.repeat(MAX_ATTACK_TIMESTAMP_LENGTH),
        })
      ).toBe(true);
    });
  });
});
