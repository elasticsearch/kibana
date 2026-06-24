/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { alertComment, eventComment, basicCase, basicComment } from '../../../containers/mock';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  MAP_ATTACHMENT_TYPE,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_EVENT_ATTACHMENT_TYPE,
} from '../../../../common/constants/attachments';
import type { AttachmentUIV2 } from '../../../../common/ui/types';
import { getManualAlertIds } from '../../../../common/utils/attachments/manual_alert_ids';
import { filterCaseAttachmentsBySearchTerm, getAttachmentItemCount } from './helpers';

const comment = {
  ...alertComment,
  alertId: 'alert-id-1',
  index: '.alerts-matchme.alerts',
};
const comment2 = {
  ...alertComment,
  alertId: 'alert-id-2',
  index: '.alerts-another.alerts',
};

const comment3 = {
  ...alertComment,
  alertId: ['nested1', 'nested2', 'nested3'],
};

const unifiedAlertComment = {
  id: 'unified-alert-1',
  type: SECURITY_ALERT_ATTACHMENT_TYPE,
  attachmentId: 'unified-alert-id-1',
  metadata: { index: '.alerts-security', rule: { id: 'rule-1', name: 'Test Rule' } },
  owner: basicCase.owner,
  createdAt: basicCase.createdAt,
  createdBy: basicCase.createdBy,
  pushedAt: null,
  pushedBy: null,
  updatedAt: null,
  updatedBy: null,
  version: 'WzQ3LDFc',
};

describe('Case view helpers', () => {
  describe('getAttachmentItemCount', () => {
    it('counts a legacy alert with a single id as 1', () => {
      expect(getAttachmentItemCount(alertComment)).toBe(1);
    });

    it('counts a legacy alert with an array of ids by length', () => {
      const bulk = {
        ...alertComment,
        alertId: ['a-1', 'a-2', 'a-3'],
        index: ['i-1', 'i-2', 'i-3'],
      };
      expect(getAttachmentItemCount(bulk)).toBe(3);
    });

    it('counts a legacy event with a single id as 1', () => {
      expect(getAttachmentItemCount(eventComment)).toBe(1);
    });

    it('counts a legacy event with an array of ids by length', () => {
      const bulk = { ...eventComment, eventId: ['e-1', 'e-2'], index: ['i-1', 'i-2'] };
      expect(getAttachmentItemCount(bulk)).toBe(2);
    });

    it('counts a unified alert with a single attachmentId as 1', () => {
      expect(getAttachmentItemCount(unifiedAlertComment as unknown as AttachmentUIV2)).toBe(1);
    });

    it('counts a unified alert with an array of attachmentIds by length', () => {
      const bulk = { ...unifiedAlertComment, attachmentId: ['ua-1', 'ua-2', 'ua-3', 'ua-4'] };
      expect(getAttachmentItemCount(bulk as unknown as AttachmentUIV2)).toBe(4);
    });

    it('counts a unified event with an array of attachmentIds by length', () => {
      const unifiedEvent = {
        ...unifiedAlertComment,
        type: SECURITY_EVENT_ATTACHMENT_TYPE,
        attachmentId: ['ue-1', 'ue-2'],
      };
      expect(getAttachmentItemCount(unifiedEvent as unknown as AttachmentUIV2)).toBe(2);
    });

    it('counts other unified reference attachments (e.g. files) as the length of attachmentId', () => {
      const fileComment = {
        ...unifiedAlertComment,
        type: 'file',
        attachmentId: 'file-so-1',
      };
      expect(getAttachmentItemCount(fileComment as unknown as AttachmentUIV2)).toBe(1);
    });

    it('counts a basic user comment as 1', () => {
      expect(getAttachmentItemCount(basicComment as unknown as AttachmentUIV2)).toBe(1);
    });
  });

  describe('getManualAlertIds', () => {
    it('returns the alert ids', () => {
      const result = getManualAlertIds([comment, comment2]);
      expect(result).toEqual(['alert-id-1', 'alert-id-2']);
    });

    it('returns the alerts id from multiple alerts in a comment', () => {
      const result = getManualAlertIds([comment, comment2, comment3]);
      expect(result).toEqual(['alert-id-1', 'alert-id-2', 'nested1', 'nested2', 'nested3']);
    });

    it('returns alert ids from unified alert attachments', () => {
      const result = getManualAlertIds([unifiedAlertComment as unknown as AttachmentUIV2]);
      expect(result).toEqual(['unified-alert-id-1']);
    });

    it('returns alert ids from a mix of legacy and unified alert attachments', () => {
      const result = getManualAlertIds([comment, unifiedAlertComment as unknown as AttachmentUIV2]);
      expect(result).toEqual(['alert-id-1', 'unified-alert-id-1']);
    });

    it('returns alert ids from unified alert with array attachmentId', () => {
      const multiAlert = { ...unifiedAlertComment, attachmentId: ['ua-1', 'ua-2'] };
      const result = getManualAlertIds([multiAlert as unknown as AttachmentUIV2]);
      expect(result).toEqual(['ua-1', 'ua-2']);
    });

    it('deduplicates alert ids across legacy and unified attachments', () => {
      const unified = { ...unifiedAlertComment, attachmentId: 'alert-id-1' };
      const result = getManualAlertIds([comment, unified as unknown as AttachmentUIV2]);
      expect(result).toEqual(['alert-id-1']);
    });
  });

  describe('filterCaseAttachmentsBySearchTerm', () => {
    it('returns the case data unchanged when search term is empty', () => {
      const caseData = {
        ...basicCase,
        comments: [alertComment, eventComment, basicComment],
      };
      const result = filterCaseAttachmentsBySearchTerm(caseData, '');
      expect(result).toBe(caseData);
      expect(result).toEqual(caseData);
    });

    it('filters out comments when no IDs match the search term', () => {
      const caseData = {
        ...basicCase,
        comments: [
          { ...alertComment, alertId: 'alert-123' },
          { ...eventComment, eventId: 'event-123' },
        ],
      };
      const result = filterCaseAttachmentsBySearchTerm(caseData, 'xyz');
      expect(result.comments).toHaveLength(0);
    });

    it('preserves non-alert and non-event comments', () => {
      const caseData = {
        ...basicCase,
        comments: [alertComment, eventComment, basicComment],
      };
      const result = filterCaseAttachmentsBySearchTerm(caseData, 'xyz');
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]).toEqual(basicComment);
    });

    it('filters mixed comment types correctly', () => {
      const caseData = {
        ...basicCase,
        comments: [
          { ...alertComment, alertId: 'alert-123' },
          { ...alertComment, alertId: 'alert-456' },
          { ...eventComment, eventId: 'event-123' },
          { ...eventComment, eventId: 'event-789' },
        ],
      };
      const result = filterCaseAttachmentsBySearchTerm(caseData, '123');
      expect(result.comments).toHaveLength(2);
      expect(result.comments[0]).toEqual({ ...alertComment, alertId: ['alert-123'] });
      expect(result.comments[1]).toEqual({ ...eventComment, eventId: ['event-123'] });
    });

    const testCases = [
      ['alert', 'alertId', alertComment] as const,
      ['event', 'eventId', eventComment] as const,
    ];

    testCases.forEach(([type, fieldName, commentTemplate]) => {
      it(`filters ${type} comments with single ${fieldName} that matches search term`, () => {
        const caseData = {
          ...basicCase,
          comments: [
            { ...commentTemplate, [fieldName]: `${type}-123` },
            { ...commentTemplate, [fieldName]: `${type}-456` },
          ],
        };
        const result = filterCaseAttachmentsBySearchTerm(caseData, '123');
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0]).toEqual({
          ...commentTemplate,
          [fieldName]: [`${type}-123`],
        });
      });

      it(`filters ${type} comments with array ${fieldName} that matches search term`, () => {
        const caseData = {
          ...basicCase,
          comments: [
            { ...commentTemplate, [fieldName]: [`${type}-123`, `${type}-456`, `${type}-789`] },
            { ...commentTemplate, [fieldName]: [`${type}-abc`, `${type}-def`] },
          ],
        };
        const result = filterCaseAttachmentsBySearchTerm(caseData, '123');
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0]).toEqual({
          ...commentTemplate,
          [fieldName]: [`${type}-123`],
        });
      });

      it(`filters multiple matching IDs in array ${fieldName}`, () => {
        const caseData = {
          ...basicCase,
          comments: [
            {
              ...commentTemplate,
              [fieldName]: [`${type}-123`, `${type}-123-abc`, `${type}-456`],
            },
          ],
        };
        const result = filterCaseAttachmentsBySearchTerm(caseData, '123');
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0]).toEqual({
          ...commentTemplate,
          [fieldName]: [`${type}-123`, `${type}-123-abc`],
        });
      });

      it(`filters out ${type} comments with empty string ${fieldName}`, () => {
        const caseData = {
          ...basicCase,
          comments: [
            { ...commentTemplate, [fieldName]: '' },
            { ...commentTemplate, [fieldName]: `${type}-123` },
          ],
        };
        const result = filterCaseAttachmentsBySearchTerm(caseData, '123');
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0]).toEqual({
          ...commentTemplate,
          [fieldName]: [`${type}-123`],
        });
      });

      it(`filters out ${type} comments with empty array ${fieldName}`, () => {
        const caseData = {
          ...basicCase,
          comments: [
            { ...commentTemplate, [fieldName]: [] },
            { ...commentTemplate, [fieldName]: `${type}-123` },
          ],
        };
        const result = filterCaseAttachmentsBySearchTerm(caseData, '123');
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0]).toEqual({
          ...commentTemplate,
          [fieldName]: [`${type}-123`],
        });
      });

      it(`filters out empty strings from array ${fieldName} while keeping valid IDs`, () => {
        const caseData = {
          ...basicCase,
          comments: [
            {
              ...commentTemplate,
              [fieldName]: ['', `${type}-123`, '', `${type}-456`],
            },
          ],
        };
        const result = filterCaseAttachmentsBySearchTerm(caseData, '123');
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0]).toEqual({
          ...commentTemplate,
          [fieldName]: [`${type}-123`],
        });
      });
    });

    it('filters unified alert attachments by search term', () => {
      const caseData = {
        ...basicCase,
        comments: [
          { ...unifiedAlertComment, attachmentId: ['ua-123', 'ua-456', 'ua-789'] },
          { ...unifiedAlertComment, attachmentId: ['ua-abc', 'ua-def'] },
        ],
      };
      const result = filterCaseAttachmentsBySearchTerm(caseData, '123');
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]).toEqual({
        ...unifiedAlertComment,
        attachmentId: ['ua-123'],
      });
    });

    it('filters mixed legacy and unified alert comments correctly', () => {
      const caseData = {
        ...basicCase,
        comments: [
          { ...alertComment, alertId: 'alert-123' },
          { ...unifiedAlertComment, attachmentId: 'ua-123' },
          { ...unifiedAlertComment, attachmentId: 'ua-456' },
        ],
      };
      const result = filterCaseAttachmentsBySearchTerm(caseData, '123');
      expect(result.comments).toHaveLength(2);
    });

    describe('saved-object attachments', () => {
      const soComment = (
        id: string,
        type: string,
        attachmentId: string,
        title: string,
        soType: string
      ) =>
        ({
          id,
          type,
          attachmentId,
          metadata: { title, soType },
          owner: basicCase.owner,
          createdAt: basicCase.createdAt,
          createdBy: basicCase.createdBy,
          pushedAt: null,
          pushedBy: null,
          updatedAt: null,
          updatedBy: null,
          version: 'WzQ3LDFc',
        } as unknown as AttachmentUIV2);

      it('filters dashboard attachments whose title matches case-insensitively', () => {
        const caseData = {
          ...basicCase,
          comments: [
            soComment('c1', DASHBOARD_ATTACHMENT_TYPE, 'dash-1', 'Sales Overview', 'dashboard'),
            soComment('c2', DASHBOARD_ATTACHMENT_TYPE, 'dash-2', 'Inventory', 'dashboard'),
          ],
        };
        const result = filterCaseAttachmentsBySearchTerm(caseData, 'SALES');
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].id).toBe('c1');
      });

      it('filters dashboard attachments whose attachmentId matches', () => {
        const caseData = {
          ...basicCase,
          comments: [
            soComment('c1', DASHBOARD_ATTACHMENT_TYPE, 'dash-abc', 'Dashboard A', 'dashboard'),
            soComment('c2', DASHBOARD_ATTACHMENT_TYPE, 'dash-xyz', 'Dashboard B', 'dashboard'),
          ],
        };
        const result = filterCaseAttachmentsBySearchTerm(caseData, 'xyz');
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].id).toBe('c2');
      });

      it('drops SO attachments that match neither title nor attachmentId', () => {
        const caseData = {
          ...basicCase,
          comments: [
            soComment('c1', MAP_ATTACHMENT_TYPE, 'map-1', 'Eastern Region', 'map'),
            soComment(
              'c2',
              DISCOVER_SESSION_ATTACHMENT_TYPE,
              'search-1',
              'Login attempts',
              'search'
            ),
          ],
        };
        const result = filterCaseAttachmentsBySearchTerm(caseData, 'nothing-matches');
        expect(result.comments).toHaveLength(0);
      });

      it('filters mixed SO + alert comments correctly', () => {
        const caseData = {
          ...basicCase,
          comments: [
            soComment('c1', DASHBOARD_ATTACHMENT_TYPE, 'dash-1', 'Sales Overview', 'dashboard'),
            soComment('c2', MAP_ATTACHMENT_TYPE, 'map-1', 'Inventory map', 'map'),
            { ...alertComment, alertId: 'alert-sales-1' },
          ],
        };
        const result = filterCaseAttachmentsBySearchTerm(caseData, 'sales');
        expect(result.comments).toHaveLength(2);
        expect(result.comments.map((c) => c.id).sort()).toEqual(['c1', alertComment.id].sort());
      });
    });

    it('does not apply event-id filtering to non-event unified reference attachments', () => {
      const nonEventUnifiedReferenceComment = {
        id: 'non-event-unified-ref',
        type: 'lens',
        attachmentId: ['ref-1', 'ref-2'],
        owner: basicCase.owner,
        createdAt: basicCase.createdAt,
        createdBy: basicCase.createdBy,
        pushedAt: null,
        pushedBy: null,
        updatedAt: null,
        updatedBy: null,
        version: 'WzQ3LDFc',
      };
      const caseData = {
        ...basicCase,
        comments: [nonEventUnifiedReferenceComment],
      };

      const result = filterCaseAttachmentsBySearchTerm(caseData, 'missing-id');

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]).toEqual(nonEventUnifiedReferenceComment);
    });
  });
});
