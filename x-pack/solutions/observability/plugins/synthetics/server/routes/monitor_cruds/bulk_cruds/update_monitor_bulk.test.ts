/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Type } from '@kbn/config-schema';
import { SYNTHETICS_API_URLS } from '../../../../common/constants';
import { updateSyntheticsMonitorBulkRoute } from './update_monitor_bulk';

jest.mock('../services/update_monitor_api', () => ({
  UpdateMonitorAPI: jest.fn(),
}));

jest.mock('./edit_monitor_bulk', () => ({
  syncEditedMonitorBulk: jest.fn(),
}));

jest.mock('../../../synthetics_service/get_private_locations', () => ({
  getPrivateLocationsForNamespaces: jest.fn().mockResolvedValue([]),
}));

const mockResponse = () => {
  const ok = jest.fn((opts: any) => ({ status: 200, ...opts }));
  const badRequest = jest.fn((opts: any) => ({ status: 400, ...opts }));
  const customError = jest.fn((opts: any) => ({ status: opts.statusCode, ...opts }));
  return { ok, badRequest, customError };
};

const updatesFor = (ids: string[], attributes: Record<string, unknown>) =>
  ids.map((id) => ({ id, attributes }));

const mockRouteContext = (response = mockResponse()) =>
  ({
    request: { body: { updates: [] } } as any,
    response,
    spaceId: 'default',
    server: {
      logger: { error: jest.fn() },
      coreStart: { savedObjects: { createInternalRepository: jest.fn().mockReturnValue({}) } },
    } as any,
    savedObjectsClient: {} as any,
    monitorConfigRepository: {} as any,
    syntheticsMonitorClient: {} as any,
  } as any);

const installPreprocessResult = (preprocess: any) => {
  const { UpdateMonitorAPI } = jest.requireMock('../services/update_monitor_api');
  const execute = jest.fn().mockResolvedValue(preprocess);
  UpdateMonitorAPI.mockImplementation(() => ({ execute, result: preprocess }));
  return { execute };
};

const installSyncResult = (syncResult: unknown) => {
  const { syncEditedMonitorBulk } = jest.requireMock('./edit_monitor_bulk');
  syncEditedMonitorBulk.mockReset();
  if (syncResult instanceof Error) {
    syncEditedMonitorBulk.mockRejectedValue(syncResult);
  } else {
    syncEditedMonitorBulk.mockResolvedValue(syncResult);
  }
  return syncEditedMonitorBulk;
};

describe('updateSyntheticsMonitorBulkRoute', () => {
  const route = updateSyntheticsMonitorBulkRoute();

  beforeEach(() => {
    jest.clearAllMocks();
    const { getPrivateLocationsForNamespaces } = jest.requireMock(
      '../../../synthetics_service/get_private_locations'
    );
    getPrivateLocationsForNamespaces.mockResolvedValue([]);
  });

  describe('route shape', () => {
    it('uses PUT on the bulk update path', () => {
      expect(route.method).toBe('PUT');
      expect(route.path).toBe(SYNTHETICS_API_URLS.SYNTHETICS_MONITORS_BULK_UPDATE);
    });
  });

  describe('body schema', () => {
    const bodySchema = (route.validation as { request: { body: Type<unknown> } }).request.body;

    it('accepts a non-empty updates array of { id, attributes }', () => {
      expect(() =>
        bodySchema.validate({
          updates: [
            { id: 'monitor-id-1', attributes: { enabled: false } },
            { id: 'monitor-id-2', attributes: { tags: ['x'] } },
          ],
        })
      ).not.toThrow();
    });

    it('allows unknown keys inside attributes — schema uses unknowns: allow', () => {
      expect(() =>
        bodySchema.validate({
          updates: [
            {
              id: 'monitor-id-1',
              attributes: {
                completely_made_up_key: 'value',
                another_fake_field: 42,
              },
            },
          ],
        })
      ).not.toThrow();
    });

    it('rejects an empty updates array', () => {
      expect(() => bodySchema.validate({ updates: [] })).toThrow(
        /array size is \[0\], but cannot be smaller than \[1\]/
      );
    });

    it('rejects a missing updates field', () => {
      expect(() => bodySchema.validate({})).toThrow(
        /\[updates\]: expected value of type \[array\] but got \[undefined\]/
      );
    });

    it('rejects an update item missing id', () => {
      expect(() => bodySchema.validate({ updates: [{ attributes: { enabled: false } }] })).toThrow(
        /\[updates\.0\.id\]: expected value of type \[string\] but got \[undefined\]/
      );
    });

    it('rejects an update item with an empty id', () => {
      expect(() =>
        bodySchema.validate({ updates: [{ id: '', attributes: { enabled: false } }] })
      ).toThrow(
        /\[updates\.0\.id\]: value has length \[0\] but it must have a minimum length of \[1\]/
      );
    });

    it('rejects an update item with a non-string id', () => {
      expect(() => bodySchema.validate({ updates: [{ id: 1, attributes: {} }] })).toThrow(
        /\[updates\.0\.id\]: expected value of type \[string\]/
      );
    });

    it('treats a missing attributes field as an empty update — handler enforces non-empty', () => {
      const value = bodySchema.validate({ updates: [{ id: 'monitor-id-1' }] }) as {
        updates: Array<{ id: string; attributes: Record<string, unknown> }>;
      };
      expect(value.updates[0].attributes).toEqual({});
    });

    it('rejects more than 500 updates', () => {
      const updates = Array.from({ length: 501 }, (_, i) => ({
        id: `monitor-id-${i}`,
        attributes: { enabled: false },
      }));
      expect(() => bodySchema.validate({ updates })).toThrow(
        /array size is \[501\], but cannot be greater than \[500\]/
      );
    });

    it('rejects an id longer than 1024 characters', () => {
      expect(() =>
        bodySchema.validate({
          updates: [{ id: 'a'.repeat(1025), attributes: { enabled: false } }],
        })
      ).toThrow(
        /\[updates\.0\.id\]: value has length \[1025\] but it must have a maximum length of \[1024\]/
      );
    });
  });

  describe('handler', () => {
    it('returns 400 when an update has empty attributes', async () => {
      const ctx = mockRouteContext();
      ctx.request.body = { updates: [{ id: 'mon-1', attributes: {} }] };

      const result: any = await route.handler(ctx);

      expect(ctx.response.badRequest).toHaveBeenCalledTimes(1);
      expect(result.body.message).toMatch(/`attributes` is required/);
    });

    it('returns 400 when an id appears more than once', async () => {
      const ctx = mockRouteContext();
      ctx.request.body = {
        updates: [
          { id: 'dup', attributes: { enabled: false } },
          { id: 'dup', attributes: { tags: ['x'] } },
        ],
      };

      const result: any = await route.handler(ctx);

      expect(ctx.response.badRequest).toHaveBeenCalledTimes(1);
      expect(result.body.message).toMatch(/Duplicate monitor id dup/);
    });

    it('skips the sync when every id pre-failed', async () => {
      const { execute } = installPreprocessResult({
        survivors: [],
        perIdErrors: {
          'mon-1': { code: 'not_found', message: 'Monitor id mon-1 not found!' },
          'mon-2': { code: 'invalid_origin', message: 'Origin "project" rejected' },
        },
      });
      const sync = installSyncResult({});

      const ctx = mockRouteContext();
      ctx.request.body = { updates: updatesFor(['mon-1', 'mon-2'], { enabled: false }) };

      const result: any = await route.handler(ctx);

      expect(execute).toHaveBeenCalledWith({
        updates: updatesFor(['mon-1', 'mon-2'], { enabled: false }),
      });
      expect(sync).not.toHaveBeenCalled();
      expect(result.body).toEqual({
        result: [
          { id: 'mon-1', updated: false, error: 'Monitor id mon-1 not found!' },
          { id: 'mon-2', updated: false, error: 'Origin "project" rejected' },
        ],
      });
    });

    it('marks every survivor that round-trips through the sync as updated', async () => {
      const survivor = (id: string) => ({
        normalizedMonitor: { id, locations: [], spaces: [] },
        monitorWithRevision: { id },
        decryptedPreviousMonitor: { id, attributes: {} },
      });
      installPreprocessResult({
        survivors: [survivor('mon-1'), survivor('mon-2')],
        perIdErrors: {},
      });
      const sync = installSyncResult({
        editedMonitors: [{ id: 'mon-1' }, { id: 'mon-2' }],
        failedConfigs: undefined,
        errors: [],
      });

      const ctx = mockRouteContext();
      ctx.request.body = { updates: updatesFor(['mon-1', 'mon-2'], { enabled: false }) };

      const result: any = await route.handler(ctx);

      expect(sync).toHaveBeenCalledTimes(1);
      expect(result.body).toEqual({
        result: [
          { id: 'mon-1', updated: true },
          { id: 'mon-2', updated: true },
        ],
      });
    });

    it('preserves the request id order in the result array (mixed outcomes)', async () => {
      const survivor = (id: string) => ({
        normalizedMonitor: { id, locations: [], spaces: [] },
        monitorWithRevision: { id },
        decryptedPreviousMonitor: { id, attributes: {} },
      });
      installPreprocessResult({
        survivors: [survivor('mon-ok'), survivor('mon-fleet')],
        perIdErrors: {
          'mon-bad': { code: 'validation_failed', message: 'Schedule invalid' },
          'mon-missing': { code: 'not_found', message: 'Monitor id mon-missing not found!' },
        },
      });
      installSyncResult({
        editedMonitors: [{ id: 'mon-ok' }],
        failedConfigs: {
          'mon-fleet': { config: { config_id: 'mon-fleet' }, error: new Error('Fleet timeout') },
        },
        errors: [],
      });

      const ctx = mockRouteContext();
      ctx.request.body = {
        updates: updatesFor(['mon-bad', 'mon-ok', 'mon-missing', 'mon-fleet'], { enabled: false }),
      };

      const result: any = await route.handler(ctx);

      expect(result.body.result).toEqual([
        { id: 'mon-bad', updated: false, error: 'Schedule invalid' },
        { id: 'mon-ok', updated: true },
        { id: 'mon-missing', updated: false, error: 'Monitor id mon-missing not found!' },
        { id: 'mon-fleet', updated: false, error: 'Fleet timeout' },
      ]);
    });

    it('surfaces Synthetics service sync errors as a top-level `errors` array', async () => {
      const survivor = (id: string) => ({
        normalizedMonitor: { id, locations: [], spaces: [] },
        monitorWithRevision: { id },
        decryptedPreviousMonitor: { id, attributes: {} },
      });
      installPreprocessResult({
        survivors: [survivor('mon-1')],
        perIdErrors: {},
      });
      installSyncResult({
        editedMonitors: [{ id: 'mon-1' }],
        errors: [{ locationId: 'us_central', error: { reason: 'Timeout' } }],
      });

      const ctx = mockRouteContext();
      ctx.request.body = { updates: updatesFor(['mon-1'], { enabled: false }) };

      const result: any = await route.handler(ctx);

      expect(result.body.result).toEqual([{ id: 'mon-1', updated: true }]);
      expect(result.body.errors).toEqual([
        { locationId: 'us_central', error: { reason: 'Timeout' } },
      ]);
    });

    it('omits `errors` from the response when there are no sync errors', async () => {
      const survivor = (id: string) => ({
        normalizedMonitor: { id, locations: [], spaces: [] },
        monitorWithRevision: { id },
        decryptedPreviousMonitor: { id, attributes: {} },
      });
      installPreprocessResult({
        survivors: [survivor('mon-1')],
        perIdErrors: {},
      });
      installSyncResult({ editedMonitors: [{ id: 'mon-1' }], errors: [] });

      const ctx = mockRouteContext();
      ctx.request.body = { updates: updatesFor(['mon-1'], { enabled: false }) };

      const result: any = await route.handler(ctx);

      expect(result.body).not.toHaveProperty('errors');
    });

    it('routes per-monitor SO bulkUpdate errors to the matching id', async () => {
      const survivor = (id: string) => ({
        normalizedMonitor: { id, locations: [], spaces: [] },
        monitorWithRevision: { id },
        decryptedPreviousMonitor: { id, attributes: {} },
      });
      installPreprocessResult({
        survivors: [survivor('mon-1'), survivor('mon-2')],
        perIdErrors: {},
      });
      installSyncResult({
        editedMonitors: [
          { id: 'mon-1' },
          { id: 'mon-2', error: { message: 'version_conflict_engine_exception' } },
        ],
        errors: [],
      });

      const ctx = mockRouteContext();
      ctx.request.body = { updates: updatesFor(['mon-1', 'mon-2'], { enabled: false }) };

      const result: any = await route.handler(ctx);

      expect(result.body.result).toEqual([
        { id: 'mon-1', updated: true },
        { id: 'mon-2', updated: false, error: 'version_conflict_engine_exception' },
      ]);
    });

    it('returns 500 with the original message when sync throws', async () => {
      const survivor = (id: string) => ({
        normalizedMonitor: { id, locations: [], spaces: [] },
        monitorWithRevision: { id },
        decryptedPreviousMonitor: { id, attributes: {} },
      });
      installPreprocessResult({
        survivors: [survivor('mon-1')],
        perIdErrors: {},
      });
      installSyncResult(new Error('ES connection refused'));

      const ctx = mockRouteContext();
      ctx.request.body = { updates: updatesFor(['mon-1'], { enabled: false }) };

      const result: any = await route.handler(ctx);

      expect(ctx.response.customError).toHaveBeenCalledWith({
        statusCode: 500,
        body: { message: 'ES connection refused' },
      });
      expect(result.status).toBe(500);
      expect(ctx.server.logger.error).toHaveBeenCalled();
    });
  });

  describe('private location lookup', () => {
    it('passes the union of request space and survivor spaces to getPrivateLocationsForNamespaces', async () => {
      const { getPrivateLocationsForNamespaces } = jest.requireMock(
        '../../../synthetics_service/get_private_locations'
      );
      const survivor = (id: string, spaces: string[]) => ({
        normalizedMonitor: { id, locations: [], spaces },
        monitorWithRevision: { id },
        decryptedPreviousMonitor: { id, attributes: {} },
      });
      installPreprocessResult({
        survivors: [survivor('mon-1', ['default']), survivor('mon-2', ['team-a', 'team-b'])],
        perIdErrors: {},
      });
      installSyncResult({ editedMonitors: [{ id: 'mon-1' }, { id: 'mon-2' }], errors: [] });

      const ctx = mockRouteContext();
      ctx.request.body = { updates: updatesFor(['mon-1', 'mon-2'], { enabled: false }) };

      await route.handler(ctx);

      expect(getPrivateLocationsForNamespaces).toHaveBeenCalledTimes(1);
      const namespacesArg = getPrivateLocationsForNamespaces.mock.calls[0][1];
      expect(new Set(namespacesArg)).toEqual(new Set(['default', 'team-a', 'team-b']));
    });

    it('does not call getPrivateLocationsForNamespaces when every id pre-failed', async () => {
      const { getPrivateLocationsForNamespaces } = jest.requireMock(
        '../../../synthetics_service/get_private_locations'
      );
      installPreprocessResult({
        survivors: [],
        perIdErrors: { 'mon-1': { code: 'not_found', message: 'gone' } },
      });
      installSyncResult({});

      const ctx = mockRouteContext();
      ctx.request.body = { updates: updatesFor(['mon-1'], { enabled: false }) };

      await route.handler(ctx);

      expect(getPrivateLocationsForNamespaces).not.toHaveBeenCalled();
    });
  });
});
