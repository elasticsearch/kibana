/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type {
  ToolHandlerContext,
  ToolHandlerStandardReturn,
} from '@kbn/agent-builder-server/tools';
import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import { createAttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import { getConnectorSpec } from '@kbn/connector-specs';
import { createListConnectorTypesTool } from './list_connector_types';
import { createProposeConnectorTool } from './propose_connector';
import { CONNECTOR_SETUP_ATTACHMENT_TYPE } from '../../../common/attachments';
import { createConnectorSetupAttachmentType } from '../../attachment_types/connector_setup';

const githubSpec = {
  metadata: {
    id: '.github',
    displayName: 'GitHub',
    description: 'Search repositories and issues',
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },
  auth: { types: ['bearer', { type: 'oauth_authorization_code' }] },
  actions: {
    searchRepositories: { isTool: true, description: 'Search repos', handler: jest.fn() },
    internalAction: { isTool: false, description: 'Internal', handler: jest.fn() },
  },
};

const alertingOnlySpec = {
  metadata: {
    id: '.email',
    displayName: 'Email',
    description: 'Send email',
    minimumLicense: 'basic',
    supportedFeatureIds: ['alerting'],
  },
  actions: {},
};

jest.mock('@kbn/connector-specs', () => ({
  connectorsSpecs: {},
  getConnectorSpec: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const connectorSpecsModule = require('@kbn/connector-specs');
const getConnectorSpecMock = getConnectorSpec as jest.MockedFunction<typeof getConnectorSpec>;

/**
 * Build a minimal `ToolHandlerContext` carrying a real `AttachmentStateManager`
 * wired to the real `connector_setup` attachment type, so `propose_connector`
 * exercises the same validation pipeline the production runner uses (catching
 * drift between the tool schema and the attachment type's `validate`).
 */
const createTestContext = () => {
  const setupType = createConnectorSetupAttachmentType();
  const attachments = createAttachmentStateManager([], {
    getTypeDefinition: (type) =>
      type === CONNECTOR_SETUP_ATTACHMENT_TYPE
        ? (setupType as unknown as AttachmentTypeDefinition)
        : undefined,
  });
  const context = { attachments } as unknown as ToolHandlerContext;
  return { context, attachments };
};

describe('connector-authoring inline tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectorSpecsModule.connectorsSpecs = {
      GithubConnector: githubSpec,
      EmailConnector: alertingOnlySpec,
    };
  });

  describe('list_connector_types', () => {
    it('returns only spec-backed connectors that support agentBuilder', async () => {
      const tool = createListConnectorTypesTool();
      const result = (await tool.handler(
        {},
        {} as ToolHandlerContext
      )) as ToolHandlerStandardReturn;

      const [first] = result.results;
      expect(first.type).toBe(ToolResultType.other);
      const data = first.data as {
        connector_types: Array<Record<string, unknown>>;
        total: number;
      };
      expect(data.total).toBe(1);
      expect(data.connector_types[0]).toEqual(
        expect.objectContaining({
          connector_type: '.github',
          name: 'GitHub',
          auth_methods: ['bearer', 'oauth_authorization_code'],
          tool_actions: [{ name: 'searchRepositories', description: 'Search repos' }],
        })
      );
    });
  });

  describe('propose_connector', () => {
    it('creates a connector_setup attachment for a known connector type', async () => {
      getConnectorSpecMock.mockReturnValue(githubSpec as never);
      const tool = createProposeConnectorTool();
      const { context, attachments } = createTestContext();

      const result = (await tool.handler(
        { connector_type: '.github', reason: 'Investigate issues' },
        context
      )) as ToolHandlerStandardReturn;

      const [first] = result.results;
      expect(first.type).toBe(ToolResultType.other);
      const data = first.data as { attachment_id: string; version: number };
      expect(data.version).toBe(1);

      const stored = attachments.get(data.attachment_id);
      expect(stored?.type).toBe(CONNECTOR_SETUP_ATTACHMENT_TYPE);
      expect(stored?.data.data).toMatchObject({
        connector_type: '.github',
        connector_type_name: 'GitHub',
        reason: 'Investigate issues',
      });
    });

    it('returns an error for an unknown connector type without persisting', async () => {
      getConnectorSpecMock.mockReturnValue(undefined);
      const tool = createProposeConnectorTool();
      const { context, attachments } = createTestContext();

      const result = (await tool.handler(
        { connector_type: '.nope' },
        context
      )) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.error);
      expect(attachments.getActive()).toHaveLength(0);
    });

    it('rejects a spec-backed connector that does not support Agent Builder', async () => {
      // .email resolves to a real spec, but it is alerting-only (no agentBuilder
      // support), so the agent could not use it afterwards - it must not be proposable.
      getConnectorSpecMock.mockReturnValue(alertingOnlySpec as never);
      const tool = createProposeConnectorTool();
      const { context, attachments } = createTestContext();

      const result = (await tool.handler(
        { connector_type: '.email' },
        context
      )) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.error);
      expect(attachments.getActive()).toHaveLength(0);
    });
  });
});
