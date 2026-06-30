/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext, AuthTypeDef } from '../../connector_spec';
import { generateSecretsSchemaFromSpec } from '../../lib/generate_secrets_schema_from_spec';
import { GmailConnector } from './gmail';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

describe('GmailConnector', () => {
  const mockClient = {
    get: jest.fn(),
  };

  const mockContext = {
    client: mockClient,
    log: { debug: jest.fn() },
  } as unknown as ActionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('metadata', () => {
    it('has required metadata', () => {
      expect(GmailConnector.metadata.id).toBe('.gmail');
      expect(GmailConnector.metadata.displayName).toBe('Gmail');
      expect(GmailConnector.metadata.supportedFeatureIds).toContain('workflows');
    });
  });

  describe('auth', () => {
    it('supports ears auth type as first visible option', () => {
      const visibleTypes = GmailConnector.auth?.types.filter(
        (t) => typeof t === 'string' || !(t as AuthTypeDef).isLegacy
      );
      expect(visibleTypes?.[0]).toEqual(expect.objectContaining({ type: 'ears' }));
    });

    it('bearer auth is hidden (not shown in picker) but retained for existing connectors', () => {
      const bearerDef = GmailConnector.auth?.types.find(
        (t): t is AuthTypeDef => typeof t === 'object' && t.type === 'bearer'
      );
      expect(bearerDef).toBeDefined();
      expect(bearerDef?.isLegacy).toBe(true);
    });

    it('existing connectors with bearer auth still pass schema validation', () => {
      const schema = generateSecretsSchemaFromSpec(GmailConnector.auth, {
        isEarsEnabled: true,
        isEarsExperimentalEnabled: true,
      });
      const result = schema.safeParse({ authType: 'bearer', token: 'some-legacy-token' });
      expect(result.success).toBe(true);
    });

    it('supports oauth_authorization_code with correct Google defaults', () => {
      const oauthType = GmailConnector.auth?.types.find(
        (t) => typeof t === 'object' && t.type === 'oauth_authorization_code'
      );
      expect(oauthType).toBeDefined();
      expect(oauthType).toMatchObject({
        type: 'oauth_authorization_code',
        defaults: {
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        },
      });
    });

    it('supports ears auth type with correct Google defaults and overrides', () => {
      const types = GmailConnector.auth?.types as Array<
        | string
        | {
            type: string;
            defaults?: Record<string, unknown>;
            overrides?: Record<string, unknown>;
          }
      >;
      expect(types.map((t) => (typeof t === 'string' ? t : t.type))).toContain('ears');

      const earsType = types.find((t) => typeof t === 'object' && t.type === 'ears');
      expect(earsType).toMatchObject({
        type: 'ears',
        defaults: {
          provider: 'google',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        },
        overrides: {
          meta: { scope: { disabled: true } },
        },
      });
    });
  });

  describe('actions', () => {
    it('exposes searchMessages, getMessage, getAttachment, listMessages actions', () => {
      expect(GmailConnector.actions.searchMessages).toBeDefined();
      expect(GmailConnector.actions.getMessage).toBeDefined();
      expect(GmailConnector.actions.getAttachment).toBeDefined();
      expect(GmailConnector.actions.listMessages).toBeDefined();
    });
  });

  describe('searchMessages', () => {
    it('should return messages and pass query and maxResults', async () => {
      const mockResponse = {
        data: {
          messages: [{ id: 'msg-1', threadId: 't1' }],
          nextPageToken: undefined,
          resultSizeEstimate: 1,
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await GmailConnector.actions.searchMessages.handler(mockContext, {
        query: 'from:alice@example.com is:unread',
        maxResults: 20,
      });

      expect(mockClient.get).toHaveBeenCalledWith(`${GMAIL_API_BASE}/messages`, {
        params: { maxResults: 20, q: 'from:alice@example.com is:unread' },
      });
      expect(result).toEqual({
        messages: mockResponse.data.messages,
        nextPageToken: undefined,
        resultSizeEstimate: 1,
      });
    });

    it('should include pageToken when provided', async () => {
      const mockResponse = {
        data: { messages: [], nextPageToken: 'next', resultSizeEstimate: 0 },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      await GmailConnector.actions.searchMessages.handler(mockContext, {
        query: 'is:unread',
        maxResults: 10,
        pageToken: 'token-123',
      });

      expect(mockClient.get).toHaveBeenCalledWith(`${GMAIL_API_BASE}/messages`, {
        params: { maxResults: 10, q: 'is:unread', pageToken: 'token-123' },
      });
    });

    it('should cap maxResults at 100', async () => {
      const mockResponse = { data: { messages: [], resultSizeEstimate: 0 } };
      mockClient.get.mockResolvedValue(mockResponse);

      await GmailConnector.actions.searchMessages.handler(mockContext, {
        maxResults: 500,
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${GMAIL_API_BASE}/messages`,
        expect.objectContaining({
          params: expect.objectContaining({ maxResults: 100 }),
        })
      );
    });

    it('should throw Gmail API error when present', async () => {
      mockClient.get.mockRejectedValue({
        response: { data: { error: { code: 403, message: 'Forbidden' } } },
      });

      await expect(
        GmailConnector.actions.searchMessages.handler(mockContext, { maxResults: 10 })
      ).rejects.toThrow('Gmail API error (403): Forbidden');
    });

    it('should rethrow original error when there is no Gmail API error body', async () => {
      const networkError = new Error('network error');
      mockClient.get.mockRejectedValue(networkError);

      await expect(
        GmailConnector.actions.searchMessages.handler(mockContext, { maxResults: 10 })
      ).rejects.toThrow('network error');
    });
  });

  describe('getMessage', () => {
    it('should fetch message by id with format', async () => {
      const mockResponse = {
        data: { id: 'msg-1', threadId: 't1', labelIds: ['INBOX'], snippet: 'Hello' },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await GmailConnector.actions.getMessage.handler(mockContext, {
        messageId: 'msg-1',
        format: 'full',
      });

      expect(mockClient.get).toHaveBeenCalledWith(`${GMAIL_API_BASE}/messages/msg-1`, {
        params: { format: 'full' },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should default format to minimal', async () => {
      const mockResponse = { data: { id: 'msg-1' } };
      mockClient.get.mockResolvedValue(mockResponse);

      await GmailConnector.actions.getMessage.handler(mockContext, { messageId: 'msg-1' });

      expect(mockClient.get).toHaveBeenCalledWith(`${GMAIL_API_BASE}/messages/msg-1`, {
        params: { format: 'minimal' },
      });
    });

    it('should throw Gmail API error when present', async () => {
      mockClient.get.mockRejectedValue({
        response: { data: { error: { code: 404, message: 'Not Found' } } },
      });

      await expect(
        GmailConnector.actions.getMessage.handler(mockContext, { messageId: 'bad-id' })
      ).rejects.toThrow('Gmail API error (404): Not Found');
    });

    it('should rethrow original error when there is no Gmail API error body', async () => {
      mockClient.get.mockRejectedValue(new Error('timeout'));

      await expect(
        GmailConnector.actions.getMessage.handler(mockContext, { messageId: 'msg-1' })
      ).rejects.toThrow('timeout');
    });
  });

  describe('getAttachment', () => {
    it('should fetch attachment by messageId and attachmentId', async () => {
      const mockResponse = { data: { data: 'base64urlEncodedContent' } };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await GmailConnector.actions.getAttachment.handler(mockContext, {
        messageId: 'msg-1',
        attachmentId: 'ANGjdJ1',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${GMAIL_API_BASE}/messages/msg-1/attachments/ANGjdJ1`
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should throw Gmail API error when present', async () => {
      mockClient.get.mockRejectedValue({
        response: { data: { error: { code: 404, message: 'Attachment not found' } } },
      });

      await expect(
        GmailConnector.actions.getAttachment.handler(mockContext, {
          messageId: 'msg-1',
          attachmentId: 'bad-att-id',
        })
      ).rejects.toThrow('Gmail API error (404): Attachment not found');
    });
  });

  describe('listMessages', () => {
    it('should return messages with default params', async () => {
      const mockResponse = {
        data: {
          messages: [{ id: 'm1', threadId: 't1' }],
          nextPageToken: undefined,
          resultSizeEstimate: 1,
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await GmailConnector.actions.listMessages.handler(mockContext, {});

      expect(mockClient.get).toHaveBeenCalledWith(`${GMAIL_API_BASE}/messages`, {
        params: { maxResults: 10 },
      });
      expect(result).toEqual({
        messages: mockResponse.data.messages,
        nextPageToken: undefined,
        resultSizeEstimate: 1,
      });
    });

    it('should include labelIds and pageToken when provided', async () => {
      const mockResponse = { data: { messages: [], resultSizeEstimate: 0 } };
      mockClient.get.mockResolvedValue(mockResponse);

      await GmailConnector.actions.listMessages.handler(mockContext, {
        maxResults: 50,
        labelIds: ['INBOX', 'SENT'],
        pageToken: 'page-2',
      });

      expect(mockClient.get).toHaveBeenCalledWith(`${GMAIL_API_BASE}/messages`, {
        params: { maxResults: 50, labelIds: ['INBOX', 'SENT'], pageToken: 'page-2' },
      });
    });

    it('should cap maxResults at 100', async () => {
      const mockResponse = { data: { messages: [], resultSizeEstimate: 0 } };
      mockClient.get.mockResolvedValue(mockResponse);

      await GmailConnector.actions.listMessages.handler(mockContext, { maxResults: 200 });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${GMAIL_API_BASE}/messages`,
        expect.objectContaining({
          params: expect.objectContaining({ maxResults: 100 }),
        })
      );
    });

    it('should throw Gmail API error when present', async () => {
      mockClient.get.mockRejectedValue({
        response: { data: { error: { code: 401, message: 'Invalid credentials' } } },
      });

      await expect(
        GmailConnector.actions.listMessages.handler(mockContext, { maxResults: 10 })
      ).rejects.toThrow('Gmail API error (401): Invalid credentials');
    });

    it('should rethrow original error when there is no Gmail API error body', async () => {
      mockClient.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        GmailConnector.actions.listMessages.handler(mockContext, { maxResults: 10 })
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('Gmail API error handling', () => {
    it('should use Unknown when error message is missing', async () => {
      mockClient.get.mockRejectedValue({
        response: { data: { error: { code: 500 } } },
      });

      await expect(
        GmailConnector.actions.searchMessages.handler(mockContext, { maxResults: 10 })
      ).rejects.toThrow('Gmail API error (500): Unknown');
    });
  });

  describe('test handler', () => {
    it('should return ok: true when profile is fetched', async () => {
      const mockResponse = {
        status: 200,
        data: { emailAddress: 'user@gmail.com' },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      if (!GmailConnector.test?.handler) {
        throw new Error('Test handler not defined');
      }
      const result = await GmailConnector.test.handler(mockContext);

      expect(mockClient.get).toHaveBeenCalledWith(`${GMAIL_API_BASE}/profile`);
      expect(result).toEqual({
        ok: true,
        message: 'Successfully connected to Gmail as user@gmail.com',
      });
    });

    it('should fall back to generic user when emailAddress is missing', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: {} });

      if (!GmailConnector.test?.handler) {
        throw new Error('Test handler not defined');
      }
      const result = await GmailConnector.test.handler(mockContext);

      expect(result).toEqual({
        ok: true,
        message: 'Successfully connected to Gmail as user',
      });
    });

    it('should return ok: false when API returns non-200 status', async () => {
      mockClient.get.mockResolvedValue({ status: 401, data: {} });

      if (!GmailConnector.test?.handler) {
        throw new Error('Test handler not defined');
      }
      const result = await GmailConnector.test.handler(mockContext);

      expect(result).toEqual({
        ok: false,
        message: 'Failed to connect to Gmail API',
      });
    });

    it('should return ok: false when API throws', async () => {
      mockClient.get.mockRejectedValue(new Error('Invalid credentials'));

      if (!GmailConnector.test?.handler) {
        throw new Error('Test handler not defined');
      }
      const result = await GmailConnector.test.handler(mockContext);

      expect(result).toEqual({
        ok: false,
        message: 'Failed to connect to Gmail API: Invalid credentials',
      });
    });
  });
});
