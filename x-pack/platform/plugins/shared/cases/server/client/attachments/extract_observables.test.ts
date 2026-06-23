/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentRequestV2 } from '../../../common/types/api';
import { AttachmentType } from '../../../common/types/domain';
import { SECURITY_SOLUTION_OWNER } from '../../../common/constants';
import { LICENSING_CASE_OBSERVABLES_FEATURE } from '../../common/constants';
import { SECURITY_ALERT_ATTACHMENT_TYPE } from '../../../common/constants/attachments';
import { createCasesClientMockArgs } from '../mocks';
import { createCaseServiceMock, createLicensingServiceMock } from '../../services/mocks';
import { mockCases } from '../../mocks';
import { extractAndAddObservables } from './extract_observables';
import type { Case } from '../../../common/types/domain';
import type { AlertService } from '../../services';

const caseSO = mockCases[0];

type AlertMgetDoc = NonNullable<Awaited<ReturnType<AlertService['getAlerts']>>>['docs'][number];

const makeEcsDoc = (source: Record<string, unknown>): AlertMgetDoc =>
  ({ _source: source, _id: 'doc-1', _index: 'index-1' } as unknown as AlertMgetDoc);

const makeCase = (extractObservables: boolean): Case =>
  ({
    id: 'case-1',
    owner: SECURITY_SOLUTION_OWNER,
    settings: { syncAlerts: true, extractObservables },
    observables: [],
    total_observables: 0,
  } as unknown as Case);

const legacyAlertAttachment: AttachmentRequestV2 = {
  type: AttachmentType.alert,
  alertId: 'alert-id-1',
  index: 'alert-index-1',
  rule: { id: 'rule-1', name: 'rule-1' },
  owner: SECURITY_SOLUTION_OWNER,
};

const legacyEventAttachment: AttachmentRequestV2 = {
  type: AttachmentType.event,
  eventId: 'event-id-1',
  index: 'event-index-1',
  owner: SECURITY_SOLUTION_OWNER,
};

const commentAttachment: AttachmentRequestV2 = {
  type: AttachmentType.user,
  comment: 'a comment',
  owner: SECURITY_SOLUTION_OWNER,
};

describe('extractAndAddObservables', () => {
  let clientArgs: ReturnType<typeof createCasesClientMockArgs>;
  let licensingService: ReturnType<typeof createLicensingServiceMock>;
  let caseService: ReturnType<typeof createCaseServiceMock>;
  let alertsService: jest.Mocked<AlertService>;

  beforeEach(() => {
    jest.clearAllMocks();
    clientArgs = createCasesClientMockArgs();
    licensingService = createLicensingServiceMock();
    caseService = createCaseServiceMock();
    alertsService = clientArgs.services.alertsService as jest.Mocked<AlertService>;

    clientArgs.services.licensingService = licensingService;
    clientArgs.services.caseService = caseService;
  });

  describe('gating on extractObservables setting', () => {
    it('returns early without calling alertsService when extractObservables is false', async () => {
      const theCase = makeCase(false);

      await extractAndAddObservables('case-1', [legacyAlertAttachment], theCase, clientArgs);

      expect(alertsService.getAlerts).not.toHaveBeenCalled();
    });

    it('returns early without calling alertsService when no alert/event attachments are present', async () => {
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [commentAttachment], theCase, clientArgs);

      expect(alertsService.getAlerts).not.toHaveBeenCalled();
    });
  });

  describe('license gating', () => {
    it('skips extraction and debug-logs when license is below Platinum, but does not throw', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(false);
      const theCase = makeCase(true);

      await expect(
        extractAndAddObservables('case-1', [legacyAlertAttachment], theCase, clientArgs)
      ).resolves.toBeUndefined();

      expect(alertsService.getAlerts).not.toHaveBeenCalled();
      expect(clientArgs.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Platinum license required')
      );
    });

    it('calls notifyUsage when license is Platinum', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({ docs: [] });
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [legacyAlertAttachment], theCase, clientArgs);

      expect(licensingService.notifyUsage).toHaveBeenCalledWith(LICENSING_CASE_OBSERVABLES_FEATURE);
    });
  });

  describe('best-effort: never rethrows', () => {
    it('resolves and warns when alertsService throws', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockRejectedValue(new Error('mget failed'));
      const theCase = makeCase(true);

      await expect(
        extractAndAddObservables('case-1', [legacyAlertAttachment], theCase, clientArgs)
      ).resolves.toBeUndefined();

      expect(clientArgs.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to extract observables')
      );
    });
  });

  describe('attachment shape normalization', () => {
    it('collects AlertInfo from a legacy alert attachment (string id + index)', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({
        docs: [makeEcsDoc({ 'source.ip': '1.2.3.4' })],
      });
      caseService.getCase.mockResolvedValue(caseSO);
      caseService.patchCase.mockResolvedValue(caseSO);
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [legacyAlertAttachment], theCase, clientArgs);

      expect(alertsService.getAlerts).toHaveBeenCalledWith([
        { id: 'alert-id-1', index: 'alert-index-1' },
      ]);
    });

    it('collects AlertInfo from a legacy alert attachment with array ids', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({ docs: [] });
      const multiAlert: AttachmentRequestV2 = {
        type: AttachmentType.alert,
        alertId: ['id-1', 'id-2'],
        index: ['idx-1', 'idx-2'],
        rule: { id: 'r', name: 'r' },
        owner: SECURITY_SOLUTION_OWNER,
      };
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [multiAlert], theCase, clientArgs);

      expect(alertsService.getAlerts).toHaveBeenCalledWith([
        { id: 'id-1', index: 'idx-1' },
        { id: 'id-2', index: 'idx-2' },
      ]);
    });

    it('collects AlertInfo from a legacy event attachment', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({ docs: [] });
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [legacyEventAttachment], theCase, clientArgs);

      expect(alertsService.getAlerts).toHaveBeenCalledWith([
        { id: 'event-id-1', index: 'event-index-1' },
      ]);
    });

    it('collects AlertInfo from a unified alert attachment', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({ docs: [] });
      const unifiedAlert: AttachmentRequestV2 = {
        type: SECURITY_ALERT_ATTACHMENT_TYPE,
        attachmentId: 'unified-id-1',
        metadata: { index: 'unified-index-1', rule: { id: 'r', name: 'r' } },
        owner: SECURITY_SOLUTION_OWNER,
      } as unknown as AttachmentRequestV2;
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [unifiedAlert], theCase, clientArgs);

      expect(alertsService.getAlerts).toHaveBeenCalledWith([
        { id: 'unified-id-1', index: 'unified-index-1' },
      ]);
    });

    it('ignores comment attachments in the AlertInfo collection', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({
        docs: [makeEcsDoc({ 'source.ip': '1.2.3.4' })],
      });
      caseService.getCase.mockResolvedValue(caseSO);
      caseService.patchCase.mockResolvedValue(caseSO);
      const theCase = makeCase(true);

      await extractAndAddObservables(
        'case-1',
        [commentAttachment, legacyAlertAttachment],
        theCase,
        clientArgs
      );

      // Only the alert, not the comment
      expect(alertsService.getAlerts).toHaveBeenCalledWith([
        { id: 'alert-id-1', index: 'alert-index-1' },
      ]);
    });
  });

  describe('observable extraction and persistence', () => {
    it('skips applyObservablesToCase when no docs have _source', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({
        docs: [{ found: false, _id: 'x', _index: 'y' }],
      });
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [legacyAlertAttachment], theCase, clientArgs);

      expect(caseService.patchCase).not.toHaveBeenCalled();
    });

    it('skips applyObservablesToCase when getAlerts returns no docs', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({ docs: [] });
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [legacyAlertAttachment], theCase, clientArgs);

      expect(caseService.patchCase).not.toHaveBeenCalled();
    });

    it('persists extracted observables when ECS fields are present', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({
        docs: [makeEcsDoc({ 'source.ip': '1.2.3.4' })],
      });
      caseService.getCase.mockResolvedValue(caseSO);
      caseService.patchCase.mockResolvedValue(caseSO);
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [legacyAlertAttachment], theCase, clientArgs);

      expect(caseService.patchCase).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: caseSO.id,
          updatedAttributes: expect.objectContaining({
            observables: expect.arrayContaining([expect.objectContaining({ value: '1.2.3.4' })]),
          }),
        })
      );
    });

    it('skips patchCase when extracted observables array is empty (no matching ECS fields)', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({
        docs: [makeEcsDoc({ 'unrelated.field': 'value' })],
      });
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [legacyAlertAttachment], theCase, clientArgs);

      expect(caseService.patchCase).not.toHaveBeenCalled();
    });

    it('logs a debug message with the count of observables added', async () => {
      licensingService.isAtLeastPlatinum.mockResolvedValue(true);
      alertsService.getAlerts.mockResolvedValue({
        docs: [makeEcsDoc({ 'source.ip': '1.2.3.4' })],
      });
      caseService.getCase.mockResolvedValue(caseSO);
      caseService.patchCase.mockResolvedValue(caseSO);
      const theCase = makeCase(true);

      await extractAndAddObservables('case-1', [legacyAlertAttachment], theCase, clientArgs);

      expect(clientArgs.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Added 1 observable')
      );
    });
  });
});
