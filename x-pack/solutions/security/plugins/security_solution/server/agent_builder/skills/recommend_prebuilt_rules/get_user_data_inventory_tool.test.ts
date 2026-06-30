/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common';
import {
  createToolHandlerContext,
  createToolTestMocks,
  setupMockCoreStartServices,
} from '../../__mocks__/test_helpers';
import {
  GET_USER_DATA_INVENTORY_INLINE_TOOL_ID,
  createGetUserDataInventoryTool,
} from './get_user_data_inventory_tool';

const makePackage = (name: string, status: string) => ({ name, status });

const createMockDeps = (fleetAvailable = true) => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const mockCoreStart = setupMockCoreStartServices(mockCore, mockEsClient);
  const getPackagesMock = jest.fn();

  const fleetPlugin = fleetAvailable
    ? { packageService: { asScoped: jest.fn().mockReturnValue({ getPackages: getPackagesMock }) } }
    : undefined;

  mockCore.getStartServices.mockResolvedValue([mockCoreStart, { fleet: fleetPlugin }, {}] as never);

  return { getStartServices: mockCore.getStartServices, mockLogger, mockRequest, getPackagesMock };
};

describe('createGetUserDataInventoryTool', () => {
  describe('tool definition', () => {
    it('has the correct tool id constant', () => {
      expect(GET_USER_DATA_INVENTORY_INLINE_TOOL_ID).toBe('security.get_user_data_inventory');
    });
  });

  describe('handler — happy path', () => {
    it('returns installed packages mapped to package names', async () => {
      const { getStartServices, mockLogger, mockRequest, getPackagesMock } = createMockDeps();
      getPackagesMock.mockResolvedValue([
        makePackage('endpoint', 'installed'),
        makePackage('windows', 'installed'),
        makePackage('okta', 'not_installed'),
        makePackage('aws', 'installed'),
      ]);

      const tool = createGetUserDataInventoryTool({ getStartServices, logger: mockLogger });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      expect('results' in result).toBe(true);
      if ('results' in result) {
        expect(result.results[0].type).toBe(ToolResultType.other);
        expect(result.results[0].data).toEqual({
          integrations: [{ package: 'endpoint' }, { package: 'windows' }, { package: 'aws' }],
        });
      }
    });

    it('returns empty integrations when no packages are installed', async () => {
      const { getStartServices, mockLogger, mockRequest, getPackagesMock } = createMockDeps();
      getPackagesMock.mockResolvedValue([
        makePackage('okta', 'not_installed'),
        makePackage('aws', 'not_installed'),
      ]);

      const tool = createGetUserDataInventoryTool({ getStartServices, logger: mockLogger });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      expect('results' in result).toBe(true);
      if ('results' in result) {
        expect(result.results[0].data).toEqual({ integrations: [] });
      }
    });
  });

  describe('handler — Fleet unavailable', () => {
    it('returns empty integrations (not error) when Fleet plugin is absent', async () => {
      const { getStartServices, mockLogger, mockRequest } = createMockDeps(false);

      const tool = createGetUserDataInventoryTool({ getStartServices, logger: mockLogger });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      expect('results' in result).toBe(true);
      if ('results' in result) {
        expect(result.results[0].type).toBe(ToolResultType.other);
        expect(result.results[0].data).toEqual({ integrations: [] });
      }
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('unavailable'));
    });

    it('returns ToolResultType.error and logs when Fleet API throws', async () => {
      const { getStartServices, mockLogger, mockRequest, getPackagesMock } = createMockDeps();
      getPackagesMock.mockRejectedValue(new Error('Fleet is down'));

      const tool = createGetUserDataInventoryTool({ getStartServices, logger: mockLogger });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      expect('results' in result).toBe(true);
      if ('results' in result) {
        expect(result.results[0].type).toBe(ToolResultType.error);
        expect(result.results[0].data).toEqual({
          message: expect.stringContaining('Fleet is down'),
        });
      }
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Fleet is down'));
    });
  });
});
