/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  OBSERVABILITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
  SECURITY_ENTITY_ATTACHMENT_TYPE,
  STACK_ALERT_ATTACHMENT_TYPE,
} from '../../constants/attachments';
import { AttachmentType } from '../../types/domain';
import {
  isAlertAttachmentType,
  isDetectionAttachmentType,
  UNIFIED_ALERT_TYPES,
  UNIFIED_DETECTION_TYPES,
  UNIFIED_DETECTION_TYPES_ARRAY,
} from './v2_type_guards';

describe('v2 type guards', () => {
  describe('isAlertAttachmentType', () => {
    it('is true for the legacy alert type and every unified alert type', () => {
      expect(isAlertAttachmentType(AttachmentType.alert)).toBe(true);
      expect(isAlertAttachmentType(SECURITY_ALERT_ATTACHMENT_TYPE)).toBe(true);
      expect(isAlertAttachmentType(OBSERVABILITY_ALERT_ATTACHMENT_TYPE)).toBe(true);
      expect(isAlertAttachmentType(STACK_ALERT_ATTACHMENT_TYPE)).toBe(true);
    });

    it('is false for non-alert unified types', () => {
      // Attacks are their own attachment type; counting them as alerts would be wrong.
      expect(isAlertAttachmentType(SECURITY_ATTACK_ATTACHMENT_TYPE)).toBe(false);
      expect(isAlertAttachmentType(SECURITY_ENTITY_ATTACHMENT_TYPE)).toBe(false);
      expect(isAlertAttachmentType('something-custom')).toBe(false);
    });
  });

  describe('UNIFIED_DETECTION_TYPES', () => {
    it('is the union of the unified alert types and security.attack', () => {
      expect(UNIFIED_DETECTION_TYPES_ARRAY).toEqual([
        SECURITY_ALERT_ATTACHMENT_TYPE,
        OBSERVABILITY_ALERT_ATTACHMENT_TYPE,
        STACK_ALERT_ATTACHMENT_TYPE,
        SECURITY_ATTACK_ATTACHMENT_TYPE,
      ]);
    });

    it('leaves UNIFIED_ALERT_TYPES untouched', () => {
      expect(UNIFIED_ALERT_TYPES.has(SECURITY_ATTACK_ATTACHMENT_TYPE)).toBe(false);
      expect(UNIFIED_ALERT_TYPES.size).toBe(3);
      expect(UNIFIED_DETECTION_TYPES.size).toBe(4);
    });
  });

  describe('isDetectionAttachmentType', () => {
    it('is true for the legacy alert type, every unified alert type and security.attack', () => {
      expect(isDetectionAttachmentType(AttachmentType.alert)).toBe(true);
      expect(isDetectionAttachmentType(SECURITY_ALERT_ATTACHMENT_TYPE)).toBe(true);
      expect(isDetectionAttachmentType(OBSERVABILITY_ALERT_ATTACHMENT_TYPE)).toBe(true);
      expect(isDetectionAttachmentType(STACK_ALERT_ATTACHMENT_TYPE)).toBe(true);
      expect(isDetectionAttachmentType(SECURITY_ATTACK_ATTACHMENT_TYPE)).toBe(true);
    });

    it('is false for attachment types that carry no workflow status', () => {
      expect(isDetectionAttachmentType(SECURITY_ENTITY_ATTACHMENT_TYPE)).toBe(false);
      expect(isDetectionAttachmentType('something-custom')).toBe(false);
    });
  });
});
