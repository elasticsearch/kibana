/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { gapFillStatus } from '@kbn/alerting-plugin/common';
import { DETECTION_ENGINE_RULES_BULK_ACTION } from '../../../../../../../common/constants';
import { mlServicesMock } from '../../../../../machine_learning/mocks';
import { buildMlAuthz } from '../../../../../machine_learning/authz';
import {
  getEmptyFindResult,
  getBulkDisableRuleActionRequest,
  getBulkActionEditRequest,
  getFindResultWithSingleHit,
  getFindResultWithMultiHits,
  getBulkActionEditAlertSuppressionRequest,
} from '../../../../routes/__mocks__/request_responses';
import { requestContextMock, serverMock, requestMock } from '../../../../routes/__mocks__';
import { performBulkActionRoute } from './route';
import {
  getPerformBulkActionEditSchemaMock,
  getBulkDisableRuleActionSchemaMock,
  getPerformBulkActionDuplicateSchemaMock,
} from '../../../../../../../common/api/detection_engine/rule_management/mocks';
import { BulkActionsDryRunErrCodeEnum } from '../../../../../../../common/api/detection_engine';
import { SecurityRuleChangeTrackingAction } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import { createMockEndpointAppContextService } from '../../../../../../endpoint/mocks';
import { validateRuleResponseActions as _validateRuleResponseActions } from '../../../../../../endpoint/services';
import { duplicateExceptions as _duplicateExceptions } from '../../../logic/actions/duplicate_exceptions';

jest.mock('../../../../../machine_learning/authz');
jest.mock('../../../logic/actions/duplicate_exceptions');

let bulkGetRulesMock: jest.Mock;

const validateRuleResponseActionsMock = _validateRuleResponseActions as jest.Mock;
const duplicateExceptionsMock = _duplicateExceptions as jest.Mock;

jest.mock('../../../../../../endpoint/services', () => {
  const actualModule = jest.requireActual('../../../../../../endpoint/services');
  return {
    ...actualModule,
    validateRuleResponseActions: jest.fn(actualModule.validateRuleResponseActions),
  };
});

describe('Perform bulk action route', () => {
  let server: ReturnType<typeof serverMock.create>;
  let clients: ReturnType<typeof requestContextMock.createTools>['clients'];
  let context: ReturnType<typeof requestContextMock.createTools>['context'];
  let ml: ReturnType<typeof mlServicesMock.createSetupContract>;
  const mockRule = getFindResultWithSingleHit().data[0];

  beforeEach(async () => {
    server = serverMock.create();
    ({ clients, context } = requestContextMock.createTools());
    ml = mlServicesMock.createSetupContract();
    bulkGetRulesMock = (await context.alerting.getRulesClient()).bulkGetRules as jest.Mock;

    context.securitySolution.getEndpointService.mockReturnValue(
      createMockEndpointAppContextService()
    );

    clients.rulesClient.find.mockResolvedValue(getFindResultWithSingleHit());
    clients.rulesClient.bulkDisableRules.mockResolvedValue({
      rules: [mockRule],
      errors: [],
      total: 1,
    });
    clients.rulesClient.create.mockResolvedValue(mockRule);
    duplicateExceptionsMock.mockResolvedValue([]);
    performBulkActionRoute(server.router, ml);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('status codes', () => {
    it('returns 200 when performing bulk action with all dependencies present', async () => {
      const response = await server.inject(
        getBulkDisableRuleActionRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(200);
      expect(response.body).toEqual({
        success: true,
        rules_count: 1,
        attributes: {
          results: someBulkActionResults(),
          summary: {
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          },
        },
      });
    });

    it("returns 200 when provided filter query doesn't match any rules", async () => {
      clients.rulesClient.find.mockResolvedValue(getEmptyFindResult());
      const response = await server.inject(
        getBulkDisableRuleActionRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(200);
      expect(response.body).toEqual({
        success: true,
        rules_count: 0,
        attributes: {
          results: someBulkActionResults(),
          summary: {
            failed: 0,
            skipped: 0,
            succeeded: 0,
            total: 0,
          },
        },
      });
    });

    it('returns 400 when provided filter query matches too many rules', async () => {
      clients.rulesClient.find.mockResolvedValue(
        getFindResultWithMultiHits({ data: [], total: Infinity })
      );
      const response = await server.inject(
        getBulkDisableRuleActionRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(400);
      expect(response.body).toEqual({
        message: 'More than 10000 rules matched the filter query. Try to narrow it down.',
        status_code: 400,
      });
    });

    it('returns 403 if alert suppression license is not sufficient', async () => {
      (context.licensing.license.hasAtLeast as jest.Mock).mockReturnValue(false);
      const response = await server.inject(
        getBulkActionEditAlertSuppressionRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.body).toEqual({
        message: 'Alert suppression is enabled with platinum license or above.',
        status_code: 403,
      });
    });

    it('returns 403 for dry run mode if alert suppression license is not sufficient', async () => {
      (context.licensing.license.hasAtLeast as jest.Mock).mockReturnValue(false);
      const response = await server.inject(
        { ...getBulkActionEditAlertSuppressionRequest(), query: { dry_run: 'true' } },
        requestContextMock.convertContext(context)
      );

      expect(response.body).toEqual({
        message: 'Alert suppression is enabled with platinum license or above.',
        status_code: 403,
      });
    });
  });

  describe('rules execution failures', () => {
    it('returns an error when rulesClient.bulkDisableRules fails', async () => {
      clients.rulesClient.bulkDisableRules.mockResolvedValue({
        rules: [],
        errors: [
          {
            message: 'Test error',
            rule: {
              id: mockRule.id,
              name: mockRule.name,
            },
          },
        ],
        total: 1,
      });
      const response = await server.inject(
        getBulkDisableRuleActionRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        message: 'Bulk edit failed',
        status_code: 500,
        attributes: {
          errors: [
            {
              message: 'Test error',
              status_code: 500,
              rules: [
                {
                  id: '04128c15-0d1b-4716-a4c5-46997ac7f3bd',
                  name: 'Detect Root/Admin Users',
                },
              ],
            },
          ],
          results: someBulkActionResults(),
          summary: {
            failed: 1,
            skipped: 0,
            succeeded: 0,
            total: 1,
          },
        },
      });
    });

    it('returns error if machine learning rule validation fails', async () => {
      (buildMlAuthz as jest.Mock).mockReturnValueOnce({
        validateRuleType: jest
          .fn()
          .mockResolvedValue({ valid: false, message: 'mocked validation message' }),
      });
      const response = await server.inject(
        getBulkDisableRuleActionRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        attributes: {
          errors: [
            {
              message: 'mocked validation message',
              err_code: BulkActionsDryRunErrCodeEnum.MACHINE_LEARNING_AUTH,
              status_code: 403,
              rules: [
                {
                  id: '04128c15-0d1b-4716-a4c5-46997ac7f3bd',
                  name: 'Detect Root/Admin Users',
                },
              ],
            },
          ],
          results: someBulkActionResults(),
          summary: {
            failed: 1,
            skipped: 0,
            succeeded: 0,
            total: 1,
          },
        },
        message: 'Bulk edit failed',
        status_code: 500,
      });
    });

    it('returns error if machine learning rule validation fails in dry run mode', async () => {
      (buildMlAuthz as jest.Mock).mockReturnValueOnce({
        validateRuleType: jest
          .fn()
          .mockResolvedValue({ valid: false, message: 'mocked validation message' }),
      });
      const response = await server.inject(
        { ...getBulkDisableRuleActionRequest(), query: { dry_run: 'true' } },
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        attributes: {
          errors: [
            {
              message: 'mocked validation message',
              err_code: BulkActionsDryRunErrCodeEnum.MACHINE_LEARNING_AUTH,
              status_code: 403,
              rules: [
                {
                  id: '04128c15-0d1b-4716-a4c5-46997ac7f3bd',
                  name: 'Detect Root/Admin Users',
                },
              ],
            },
          ],
          results: someBulkActionResults(),
          summary: {
            failed: 1,
            skipped: 0,
            succeeded: 0,
            total: 1,
          },
        },
        message: 'Bulk edit failed',
        status_code: 500,
      });
    });

    it('returns partial failure error if update of few rules fail', async () => {
      clients.rulesClient.bulkEdit.mockResolvedValue({
        rules: [mockRule, mockRule],
        skipped: [],
        errors: [
          {
            message: 'mocked validation message',
            rule: { id: 'failed-rule-id-1', name: 'Detect Root/Admin Users' },
          },
          {
            message: 'mocked validation message',
            rule: { id: 'failed-rule-id-2', name: 'Detect Root/Admin Users' },
          },
          {
            message: 'test failure',
            rule: { id: 'failed-rule-id-3', name: 'Detect Root/Admin Users' },
          },
        ],
        total: 5,
      });

      const response = await server.inject(
        getBulkActionEditRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        attributes: {
          summary: {
            failed: 3,
            succeeded: 2,
            skipped: 0,
            total: 5,
          },
          errors: [
            {
              message: 'mocked validation message',
              rules: [
                {
                  id: 'failed-rule-id-1',
                  name: 'Detect Root/Admin Users',
                },
                {
                  id: 'failed-rule-id-2',
                  name: 'Detect Root/Admin Users',
                },
              ],
              status_code: 500,
            },
            {
              message: 'test failure',
              rules: [
                {
                  id: 'failed-rule-id-3',
                  name: 'Detect Root/Admin Users',
                },
              ],
              status_code: 500,
            },
          ],
          results: someBulkActionResults(),
        },
        message: 'Bulk edit partially failed',
        status_code: 500,
      });
    });

    it('return error message limited to length of 1000, to prevent large response size', async () => {
      clients.rulesClient.bulkDisableRules.mockResolvedValue({
        rules: [],
        errors: [
          {
            message: 'a'.repeat(1_300),
            rule: {
              id: mockRule.id,
              name: mockRule.name,
            },
          },
        ],
        total: 1,
      });
      const response = await server.inject(
        getBulkDisableRuleActionRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(500);
      expect(response.body.attributes.errors[0].message.length).toEqual(1000);
    });

    it('returns partial failure error if one if rules from ids params can`t be fetched', async () => {
      bulkGetRulesMock.mockImplementation(() => ({
        rules: [mockRule],
        errors: [{ id: 'failed-mock-id', error: { statusCode: 404 } }],
      }));

      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getBulkDisableRuleActionSchemaMock(),
          ids: [mockRule.id, 'failed-mock-id'],
          query: undefined,
        },
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        attributes: {
          summary: {
            failed: 1,
            skipped: 0,
            succeeded: 1,
            total: 2,
          },
          errors: [
            {
              message: 'Rule not found',
              status_code: 500,
              rules: [
                {
                  id: 'failed-mock-id',
                },
              ],
            },
          ],
          results: someBulkActionResults(),
        },
        message: 'Bulk edit partially failed',
        status_code: 500,
      });
    });
  });

  describe('rule skipping', () => {
    it('returns partial failure error with skipped rules if some rule updates fail and others are skipped', async () => {
      clients.rulesClient.bulkEdit.mockResolvedValue({
        rules: [mockRule, mockRule],
        skipped: [
          { id: 'skipped-rule-id-1', name: 'Skipped Rule 1', skip_reason: 'RULE_NOT_MODIFIED' },
          { id: 'skipped-rule-id-2', name: 'Skipped Rule 2', skip_reason: 'RULE_NOT_MODIFIED' },
        ],
        errors: [
          {
            message: 'test failure',
            rule: { id: 'failed-rule-id-3', name: 'Detect Root/Admin Users' },
          },
        ],
        total: 5,
      });

      const response = await server.inject(
        getBulkActionEditRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        attributes: {
          summary: {
            failed: 1,
            skipped: 2,
            succeeded: 2,
            total: 5,
          },
          errors: [
            {
              message: 'test failure',
              rules: [
                {
                  id: 'failed-rule-id-3',
                  name: 'Detect Root/Admin Users',
                },
              ],
              status_code: 500,
            },
          ],
          results: someBulkActionResults(),
        },
        message: 'Bulk edit partially failed',
        status_code: 500,
      });
    });

    it('returns success with skipped rules if some rules are skipped, but no errors are reported', async () => {
      clients.rulesClient.bulkEdit.mockResolvedValue({
        rules: [mockRule, mockRule],
        skipped: [
          { id: 'skipped-rule-id-1', name: 'Skipped Rule 1', skip_reason: 'RULE_NOT_MODIFIED' },
          { id: 'skipped-rule-id-2', name: 'Skipped Rule 2', skip_reason: 'RULE_NOT_MODIFIED' },
        ],
        errors: [],
        total: 4,
      });

      const response = await server.inject(
        getBulkActionEditRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
      expect(response.body).toEqual({
        attributes: {
          summary: {
            failed: 0,
            skipped: 2,
            succeeded: 2,
            total: 4,
          },
          results: someBulkActionResults(),
        },
        rules_count: 4,
        success: true,
      });
    });

    it('returns 500 with skipped rules if some rules are skipped, but some errors are reported', async () => {
      clients.rulesClient.bulkEdit.mockResolvedValue({
        rules: [mockRule, mockRule],
        skipped: [
          { id: 'skipped-rule-id-1', name: 'Skipped Rule 1', skip_reason: 'RULE_NOT_MODIFIED' },
          { id: 'skipped-rule-id-2', name: 'Skipped Rule 2', skip_reason: 'RULE_NOT_MODIFIED' },
        ],
        errors: [
          {
            message: 'test failure',
            rule: { id: 'failed-rule-id-3', name: 'Detect Root/Admin Users' },
          },
        ],
        total: 5,
      });

      const response = await server.inject(
        getBulkActionEditRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        attributes: {
          summary: {
            failed: 1,
            skipped: 2,
            succeeded: 2,
            total: 5,
          },
          results: someBulkActionResults(),
          errors: [
            {
              message: 'test failure',
              rules: [{ id: 'failed-rule-id-3', name: 'Detect Root/Admin Users' }],
              status_code: 500,
            },
          ],
        },
        message: 'Bulk edit partially failed',
        status_code: 500,
      });
    });
  });

  describe('request validation', () => {
    it('rejects payloads with no action', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: { ...getBulkDisableRuleActionSchemaMock(), action: undefined },
      });
      const result = server.validate(request);
      expect(result.badRequest).toHaveBeenCalledWith(
        'action: Invalid input: expected "delete", action: Invalid input: expected "disable", action: Invalid input: expected "enable", action: Invalid input: expected "export", action: Invalid input: expected "duplicate", and 6 more'
      );
    });

    it('rejects payloads with unknown action', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: { ...getBulkDisableRuleActionSchemaMock(), action: 'unknown' },
      });
      const result = server.validate(request);
      expect(result.badRequest).toHaveBeenCalledWith(
        'action: Invalid input: expected "delete", action: Invalid input: expected "disable", action: Invalid input: expected "enable", action: Invalid input: expected "export", action: Invalid input: expected "duplicate", and 6 more'
      );
    });

    it('accepts payloads with no query', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: { ...getBulkDisableRuleActionSchemaMock(), query: undefined },
      });
      const result = server.validate(request);

      expect(result.ok).toHaveBeenCalled();
    });

    it('accepts payloads with query and action', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: getBulkDisableRuleActionSchemaMock(),
      });
      const result = server.validate(request);

      expect(result.ok).toHaveBeenCalled();
    });

    it('rejects payloads with incorrect typing for ids', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: { ...getBulkDisableRuleActionSchemaMock(), ids: 'test fake' },
      });
      const result = server.validate(request);
      expect(result.badRequest).toHaveBeenCalledWith(
        'ids: Invalid input: expected array, received string, action: Invalid input: expected "delete", ids: Invalid input: expected array, received string, ids: Invalid input: expected array, received string, action: Invalid input: expected "enable", and 13 more'
      );
    });

    it('rejects payload if there are more than 1000 ids in payload for any action', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getBulkDisableRuleActionSchemaMock(),
          query: undefined,
          ids: Array.from({ length: 1001 }).map(() => 'fake-id'),
        },
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(400);
      expect(response.body.message).toEqual('More than 1000 ids sent for bulk action.');
    });

    it('rejects payload if there are more than 1000 ids in payload for edit actions', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getPerformBulkActionEditSchemaMock(),
          query: undefined,
          ids: Array.from({ length: 1001 }).map(() => 'fake-id'),
        },
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(400);
      expect(response.body.message).toEqual('More than 1000 ids sent for bulk action.');
    });

    it('rejects payload if both query and ids defined', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getBulkDisableRuleActionSchemaMock(),
          query: '',
          ids: ['fake-id'],
        },
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(400);
      expect(response.body.message).toEqual(
        'Both query and ids are sent. Define either ids or query in request payload.'
      );
    });

    it('rejects payloads if ids is empty', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: { ...getBulkDisableRuleActionSchemaMock(), ids: [] },
      });
      const result = server.validate(request);
      expect(result.badRequest).toHaveBeenCalledWith(
        expect.stringContaining('ids: Too small: expected array to have >=1 items')
      );
    });

    it('rejects payloads if property "edit" actions is empty', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: { ...getPerformBulkActionEditSchemaMock(), edit: [] },
      });
      const result = server.validate(request);
      expect(result.badRequest).toHaveBeenCalledWith(
        expect.stringContaining('edit: Too small: expected array to have >=1 items')
      );
    });

    it('rejects payloads if search query dry_run is invalid', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: getPerformBulkActionEditSchemaMock(),
        query: { dry_run: 'invalid' },
      });
      const result = server.validate(request);
      expect(result.badRequest).toHaveBeenCalledWith(
        expect.stringContaining(
          'Invalid option: expected one of "true"|"false", Invalid input: expected boolean, received string'
        )
      );
    });

    it('rejects payload if both ids and gap range are defined', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getBulkDisableRuleActionSchemaMock(),
          query: undefined,
          ids: ['id'],
          gaps_range_start: '2025-01-01T00:00:00.000Z',
          gaps_range_end: '2025-01-02T00:00:00.000Z',
        },
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(400);
      expect(response.body.message).toEqual(
        'gaps_range_start, gaps_range_end and gap_fill_statuses must be provided together.'
      );
    });

    it('rejects payload if only gaps_range_start is defined without gaps_range_end', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getBulkDisableRuleActionSchemaMock(),
          query: '',
          gaps_range_start: '2025-01-01T00:00:00.000Z',
        },
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(400);
      expect(response.body.message).toEqual(
        'gaps_range_start, gaps_range_end and gap_fill_statuses must be provided together.'
      );
    });

    it('rejects payload if only gaps_range_end is defined without gaps_range_start', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getBulkDisableRuleActionSchemaMock(),
          query: '',
          gaps_range_end: '2025-01-02T00:00:00.000Z',
        },
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(400);
      expect(response.body.message).toEqual(
        'gaps_range_start, gaps_range_end and gap_fill_statuses must be provided together.'
      );
    });

    it('rejects payload if gaps range is provided without gap_fill_statuses', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getBulkDisableRuleActionSchemaMock(),
          query: '',
          gaps_range_start: '2025-01-01T00:00:00.000Z',
          gaps_range_end: '2025-01-02T00:00:00.000Z',
        },
      });
      const response = await server.inject(request, requestContextMock.convertContext(context));
      expect(response.status).toEqual(400);
      expect(response.body.message).toEqual(
        'gaps_range_start, gaps_range_end and gap_fill_statuses must be provided together.'
      );
    });

    it('rejects payload if gap_fill_statuses are provided without gaps range', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getBulkDisableRuleActionSchemaMock(),
          query: '',
          gap_fill_statuses: [gapFillStatus.UNFILLED],
        },
      });
      const response = await server.inject(request, requestContextMock.convertContext(context));
      expect(response.status).toEqual(400);
      expect(response.body.message).toEqual(
        'gaps_range_start, gaps_range_end and gap_fill_statuses must be provided together.'
      );
    });

    it('validates endpoint response actions for duplicate bulk action', async () => {
      bulkGetRulesMock.mockResolvedValue({
        rules: [mockRule],
        errors: [],
      });

      const request = requestMock.create({
        method: 'post',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: getPerformBulkActionDuplicateSchemaMock(),
      });

      await server.inject(request, requestContextMock.convertContext(context));

      expect(validateRuleResponseActionsMock).toHaveBeenCalledWith({
        checkOsqueryResponseActionAuthz: expect.any(Function),
        endpointAuthz: expect.any(Object),
        endpointService: expect.any(Object),
        spaceId: 'default',
        rulePayload: {},
        existingRule: mockRule,
      });
    });
  });

  describe('rule duplication', () => {
    beforeEach(() => {
      bulkGetRulesMock.mockResolvedValue({ rules: [mockRule], errors: [] });
    });

    it('creates the duplicate once with cloned exceptions and never calls update', async () => {
      const clonedExceptions = [
        {
          id: 'cloned-list-id',
          list_id: 'cloned-list',
          namespace_type: 'single' as const,
          type: 'rule_default' as const,
        },
      ];
      duplicateExceptionsMock.mockResolvedValue(clonedExceptions);

      const request = requestMock.create({
        method: 'post',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getPerformBulkActionDuplicateSchemaMock(),
          duplicate: { include_exceptions: true, include_expired_exceptions: true },
        },
      });

      await server.inject(request, requestContextMock.convertContext(context));

      expect(duplicateExceptionsMock).toHaveBeenCalledTimes(1);
      expect(clients.rulesClient.create).toHaveBeenCalledTimes(1);
      expect(clients.rulesClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            params: expect.objectContaining({ exceptionsList: clonedExceptions }),
          }),
          changeTracking: expect.objectContaining({
            action: SecurityRuleChangeTrackingAction.ruleDuplicate,
          }),
        })
      );
      expect(clients.rulesClient.update).not.toHaveBeenCalled();
    });

    it('skips exception duplication when include_exceptions is false but still creates once', async () => {
      const request = requestMock.create({
        method: 'post',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getPerformBulkActionDuplicateSchemaMock(),
          duplicate: { include_exceptions: false, include_expired_exceptions: false },
        },
      });

      await server.inject(request, requestContextMock.convertContext(context));

      expect(duplicateExceptionsMock).not.toHaveBeenCalled();
      expect(clients.rulesClient.create).toHaveBeenCalledTimes(1);
      expect(clients.rulesClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            params: expect.objectContaining({ exceptionsList: [] }),
          }),
        })
      );
      expect(clients.rulesClient.update).not.toHaveBeenCalled();
    });
  });

  describe('gap range functionality', () => {
    it('passes gap range and status to rules find when provided with query', async () => {
      const gapStartDate = '2025-01-01T00:00:00.000Z';
      const gapEndDate = '2025-01-02T00:00:00.000Z';

      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_BULK_ACTION,
        body: {
          ...getBulkDisableRuleActionSchemaMock(),
          query: '',
          gaps_range_start: gapStartDate,
          gaps_range_end: gapEndDate,
          gap_fill_statuses: [gapFillStatus.UNFILLED],
        },
      });

      await server.inject(request, requestContextMock.convertContext(context));

      expect(clients.rulesClient.getRuleIdsWithGaps).toHaveBeenCalledWith(
        expect.objectContaining({
          start: gapStartDate,
          end: gapEndDate,
          highestPriorityGapFillStatuses: ['unfilled'],
        })
      );
    });
  });

  it('should process large number of rules, larger than configured concurrency', async () => {
    const rulesNumber = 6_000;
    clients.rulesClient.find.mockResolvedValue(
      getFindResultWithMultiHits({
        data: Array.from({ length: rulesNumber }).map(() => mockRule),
        total: rulesNumber,
      })
    );
    clients.rulesClient.bulkDisableRules.mockResolvedValue({
      rules: Array.from({ length: rulesNumber }).map(() => mockRule),
      errors: [],
      total: rulesNumber,
    });

    const response = await server.inject(
      getBulkDisableRuleActionRequest(),
      requestContextMock.convertContext(context)
    );

    expect(response.status).toEqual(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        rules_count: rulesNumber,
        attributes: {
          summary: { failed: 0, skipped: 0, succeeded: rulesNumber, total: rulesNumber },
          results: someBulkActionResults(),
        },
      })
    );
  });
});

function someBulkActionResults() {
  return {
    created: expect.any(Array),
    deleted: expect.any(Array),
    updated: expect.any(Array),
    skipped: expect.any(Array),
  };
}
