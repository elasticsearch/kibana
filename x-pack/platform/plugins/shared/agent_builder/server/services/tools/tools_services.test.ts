/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { isAllowedBuiltinTool } from '@kbn/agent-builder-server/allow_lists';
import { ToolsService } from './tools_service';
import { createMockedBuiltinTool } from '../../test_utils/tools';

jest.mock('@kbn/agent-builder-server/allow_lists');

const isAllowedBuiltinToolMock = isAllowedBuiltinTool as jest.MockedFunction<
  typeof isAllowedBuiltinTool
>;

describe('ToolsService', () => {
  let logger: ReturnType<typeof loggerMock.create>;
  let service: ToolsService;

  beforeEach(() => {
    logger = loggerMock.create();
    service = new ToolsService();
  });

  afterEach(() => {
    isAllowedBuiltinToolMock.mockReset();
  });

  describe('#setup', () => {
    it('allows registering allowed built-in tools', () => {
      isAllowedBuiltinToolMock.mockReturnValue(true);

      const serviceSetup = service.setup({
        logger,
        config: {
          enabled: true,
          githubBaseUrl: 'https://github.com',
          topSnippets: { numSnippets: 2, numWords: 750 },
          tracing: {
            exporters: [],
            scheduledDelay: 1000,
            opik_distributed_tracing: false,
          },
        },
      });

      expect(() => serviceSetup.register(createMockedBuiltinTool())).not.toThrow();
    });

    it('throws an error trying to register non-allowed built-in tools', () => {
      isAllowedBuiltinToolMock.mockReturnValue(false);

      const serviceSetup = service.setup({
        logger,
        config: {
          enabled: true,
          githubBaseUrl: 'https://github.com',
          topSnippets: { numSnippets: 2, numWords: 750 },
          tracing: {
            exporters: [],
            scheduledDelay: 1000,
            opik_distributed_tracing: false,
          },
        },
      });

      expect(() => serviceSetup.register(createMockedBuiltinTool()))
        .toThrowErrorMatchingInlineSnapshot(`
        "Built-in tool with id \\"test-tool\\" is not in the list of allowed built-in tools.
                     Please add it to the list of allowed built-in tools in the \\"@kbn/agent-builder-server/allow_lists.ts\\" file."
      `);
    });
  });
});
