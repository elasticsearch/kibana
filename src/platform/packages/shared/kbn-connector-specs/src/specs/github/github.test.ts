/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext } from '../../connector_spec';
import { generateSecretsSchemaFromSpec } from '../../lib/generate_secrets_schema_from_spec';
import { GithubConnector } from './github';

// Mock withMcpClient so action handlers don't need a real MCP transport.
// The mock immediately invokes the callback with a fake McpClient.
const mockCallTool = jest.fn();
const mockListTools = jest.fn();

jest.mock('../../lib/mcp/with_mcp_client', () => ({
  withMcpClient: jest.fn(async (_ctx: unknown, fn: (mcp: unknown) => Promise<unknown>) => {
    return fn({ callTool: mockCallTool, listTools: mockListTools });
  }),
}));

// Helper: parse raw input through the action schema the way the framework does,
// so Zod defaults are applied before the handler receives the input.
const parse = <K extends keyof typeof GithubConnector.actions>(
  action: K,
  raw: Record<string, unknown>
) => GithubConnector.actions[action].input.parse(raw);

describe('GithubConnector', () => {
  const mockContext = {
    client: {},
    log: {},
    config: { serverUrl: 'https://api.githubcopilot.com/mcp/' },
  } as unknown as ActionContext;

  const mockJson = { ok: true };
  const mockContent = [{ type: 'text', text: JSON.stringify(mockJson) }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallTool.mockResolvedValue({ content: mockContent });
    mockListTools.mockResolvedValue({ tools: [{ name: 'get_me' }, { name: 'search_code' }] });
  });

  describe('auth', () => {
    it('supports bearer auth labeled as Personal Access Token (PAT)', () => {
      const bearerType = GithubConnector.auth?.types.find(
        (t) => typeof t === 'object' && t.type === 'bearer'
      );
      expect(bearerType).toEqual(
        expect.objectContaining({
          type: 'bearer',
          overrides: expect.objectContaining({ label: 'Personal Access Token (PAT)' }),
        })
      );
    });

    it('existing connectors with bearer auth still pass schema validation', () => {
      const schema = generateSecretsSchemaFromSpec(GithubConnector.auth, {
        isEarsEnabled: true,
        isEarsExperimentalEnabled: true,
      });
      const result = schema.safeParse({ authType: 'bearer', token: 'some-legacy-token' });
      expect(result.success).toBe(true);
    });

    it('supports oauth_authorization_code with correct GitHub defaults', () => {
      const oauthType = GithubConnector.auth?.types.find(
        (t) => typeof t === 'object' && t.type === 'oauth_authorization_code'
      );
      expect(oauthType).toBeDefined();
      expect(oauthType).toMatchObject({
        type: 'oauth_authorization_code',
        defaults: {
          authorizationUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
          scope: 'repo',
        },
      });
    });
  });

  describe('getMe action', () => {
    it('calls get_me tool and returns content', async () => {
      const result = await GithubConnector.actions.getMe.handler(mockContext, {});

      expect(mockCallTool).toHaveBeenCalledWith({ name: 'get_me', arguments: {} });
      expect(result).toEqual(mockJson);
    });
  });

  describe('searchCode action', () => {
    it('applies default pagination when omitted', async () => {
      const input = parse('searchCode', { query: 'elastic' });
      await GithubConnector.actions.searchCode.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_code',
        arguments: { query: 'elastic', page: 1, perPage: 10 },
      });
    });

    it('passes custom page and perPage', async () => {
      await GithubConnector.actions.searchCode.handler(mockContext, {
        query: 'elastic',
        page: 2,
        perPage: 5,
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_code',
        arguments: { query: 'elastic', page: 2, perPage: 5 },
      });
    });
  });

  describe('searchRepositories action', () => {
    it('applies default pagination when omitted', async () => {
      const input = parse('searchRepositories', { query: 'kibana' });
      await GithubConnector.actions.searchRepositories.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_repositories',
        arguments: { query: 'kibana', page: 1, perPage: 10 },
      });
    });
  });

  describe('searchIssues action', () => {
    it('applies defaults for order, sort, and pagination when omitted', async () => {
      const input = parse('searchIssues', { query: 'bug' });
      await GithubConnector.actions.searchIssues.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_issues',
        arguments: { query: 'bug', order: 'desc', sort: 'created', page: 1, perPage: 10 },
      });
    });

    it('passes custom order and sort', async () => {
      const input = parse('searchIssues', { query: 'bug', order: 'asc', sort: 'updated' });
      await GithubConnector.actions.searchIssues.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_issues',
        arguments: { query: 'bug', order: 'asc', sort: 'updated', page: 1, perPage: 10 },
      });
    });
  });

  describe('searchPullRequests action', () => {
    it('applies defaults when omitted', async () => {
      const input = parse('searchPullRequests', { query: 'fix memory leak' });
      await GithubConnector.actions.searchPullRequests.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_pull_requests',
        arguments: {
          query: 'fix memory leak',
          order: 'desc',
          sort: 'created',
          page: 1,
          perPage: 10,
        },
      });
    });
  });

  describe('searchUsers action', () => {
    it('applies default pagination when omitted', async () => {
      const input = parse('searchUsers', { query: 'torvalds' });
      await GithubConnector.actions.searchUsers.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_users',
        arguments: { query: 'torvalds', page: 1, perPage: 10 },
      });
    });
  });

  describe('listIssues action', () => {
    it('applies defaults for state and first when omitted', async () => {
      const input = parse('listIssues', { owner: 'elastic', repo: 'kibana' });
      await GithubConnector.actions.listIssues.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_issues',
        arguments: {
          owner: 'elastic',
          repo: 'kibana',
          state: 'open',
          first: 10,
          after: undefined,
        },
      });
    });

    it('passes cursor and state overrides', async () => {
      await GithubConnector.actions.listIssues.handler(mockContext, {
        owner: 'elastic',
        repo: 'kibana',
        state: 'closed',
        first: 5,
        after: 'cursor123',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_issues',
        arguments: {
          owner: 'elastic',
          repo: 'kibana',
          state: 'closed',
          first: 5,
          after: 'cursor123',
        },
      });
    });
  });

  describe('listPullRequests action', () => {
    it('applies defaults for state and first when omitted', async () => {
      const input = parse('listPullRequests', { owner: 'elastic', repo: 'kibana' });
      await GithubConnector.actions.listPullRequests.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_pull_requests',
        arguments: {
          owner: 'elastic',
          repo: 'kibana',
          state: 'open',
          first: 10,
          after: undefined,
        },
      });
    });
  });

  describe('listCommits action', () => {
    it('applies default first when omitted', async () => {
      const input = parse('listCommits', { owner: 'elastic', repo: 'kibana' });
      await GithubConnector.actions.listCommits.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_commits',
        arguments: {
          owner: 'elastic',
          repo: 'kibana',
          sha: undefined,
          first: 10,
          after: undefined,
        },
      });
    });
  });

  describe('listBranches action', () => {
    it('applies default first when omitted', async () => {
      const input = parse('listBranches', { owner: 'elastic', repo: 'kibana' });
      await GithubConnector.actions.listBranches.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_branches',
        arguments: { owner: 'elastic', repo: 'kibana', first: 10, after: undefined },
      });
    });
  });

  describe('listReleases action', () => {
    it('applies default first when omitted', async () => {
      const input = parse('listReleases', { owner: 'elastic', repo: 'kibana' });
      await GithubConnector.actions.listReleases.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_releases',
        arguments: { owner: 'elastic', repo: 'kibana', first: 10, after: undefined },
      });
    });
  });

  describe('listTags action', () => {
    it('applies default first when omitted', async () => {
      const input = parse('listTags', { owner: 'elastic', repo: 'kibana' });
      await GithubConnector.actions.listTags.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_tags',
        arguments: { owner: 'elastic', repo: 'kibana', first: 10, after: undefined },
      });
    });
  });

  describe('getCommit action', () => {
    it('calls get_commit with all required args', async () => {
      await GithubConnector.actions.getCommit.handler(mockContext, {
        owner: 'elastic',
        repo: 'kibana',
        sha: 'abc123',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_commit',
        arguments: { owner: 'elastic', repo: 'kibana', sha: 'abc123' },
      });
    });
  });

  describe('getLatestRelease action', () => {
    it('calls get_latest_release', async () => {
      await GithubConnector.actions.getLatestRelease.handler(mockContext, {
        owner: 'elastic',
        repo: 'kibana',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_latest_release',
        arguments: { owner: 'elastic', repo: 'kibana' },
      });
    });
  });

  describe('pullRequestRead action', () => {
    it('defaults method to get', async () => {
      const input = parse('pullRequestRead', { owner: 'elastic', repo: 'kibana', pullNumber: 42 });
      await GithubConnector.actions.pullRequestRead.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'pull_request_read',
        arguments: { owner: 'elastic', repo: 'kibana', pullNumber: 42, method: 'get' },
      });
    });

    it('passes get_diff method', async () => {
      await GithubConnector.actions.pullRequestRead.handler(mockContext, {
        owner: 'elastic',
        repo: 'kibana',
        pullNumber: 42,
        method: 'get_diff',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'pull_request_read',
        arguments: { owner: 'elastic', repo: 'kibana', pullNumber: 42, method: 'get_diff' },
      });
    });

    it('passes get_review_comments method', async () => {
      await GithubConnector.actions.pullRequestRead.handler(mockContext, {
        owner: 'elastic',
        repo: 'kibana',
        pullNumber: 42,
        method: 'get_review_comments',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'pull_request_read',
        arguments: {
          owner: 'elastic',
          repo: 'kibana',
          pullNumber: 42,
          method: 'get_review_comments',
        },
      });
    });
  });

  describe('getFileContents action', () => {
    it('calls get_file_contents with required args', async () => {
      await GithubConnector.actions.getFileContents.handler(mockContext, {
        owner: 'elastic',
        repo: 'kibana',
        path: 'README.md',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_file_contents',
        arguments: { owner: 'elastic', repo: 'kibana', path: 'README.md', ref: undefined },
      });
    });

    it('passes optional ref', async () => {
      await GithubConnector.actions.getFileContents.handler(mockContext, {
        owner: 'elastic',
        repo: 'kibana',
        path: 'src/index.ts',
        ref: 'main',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_file_contents',
        arguments: { owner: 'elastic', repo: 'kibana', path: 'src/index.ts', ref: 'main' },
      });
    });
  });

  describe('getIssue action', () => {
    it('calls issue_read with required args', async () => {
      await GithubConnector.actions.getIssue.handler(mockContext, {
        owner: 'elastic',
        repo: 'kibana',
        issueNumber: 123,
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'issue_read',
        arguments: { owner: 'elastic', repo: 'kibana', issue_number: 123, method: 'get' },
      });
    });
  });

  describe('getIssueComments action', () => {
    it('calls get_issue_comments with required args', async () => {
      await GithubConnector.actions.getIssueComments.handler(mockContext, {
        owner: 'elastic',
        repo: 'kibana',
        issueNumber: 123,
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'issue_read',
        arguments: { owner: 'elastic', repo: 'kibana', issue_number: 123, method: 'get_comments' },
      });
    });
  });

  describe('listTools action', () => {
    it('returns the list of available tools', async () => {
      const result = await GithubConnector.actions.listTools.handler(mockContext, {});

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toEqual([{ name: 'get_me' }, { name: 'search_code' }]);
    });
  });

  describe('callTool action', () => {
    it('calls the named tool with provided arguments', async () => {
      const result = await GithubConnector.actions.callTool.handler(mockContext, {
        name: 'search_code',
        arguments: { query: 'elastic', page: 1, perPage: 5 },
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_code',
        arguments: { query: 'elastic', page: 1, perPage: 5 },
      });
      expect(result).toEqual(mockContent);
    });

    it('calls the named tool with no arguments when omitted', async () => {
      await GithubConnector.actions.callTool.handler(mockContext, { name: 'get_me' });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_me',
        arguments: {},
      });
    });
  });

  describe('test handler', () => {
    it('returns ok with tool count on successful connection', async () => {
      if (!GithubConnector.test) {
        throw new Error('test handler not defined');
      }
      const result = await GithubConnector.test.handler(mockContext);

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        message: 'Connected to GitHub MCP server. 2 tools available.',
      });
    });

    it('propagates errors thrown by withMcpClient', async () => {
      const { withMcpClient } = jest.requireMock('../../lib/mcp/with_mcp_client');
      withMcpClient.mockRejectedValueOnce(new Error('connection refused'));

      if (!GithubConnector.test) {
        throw new Error('test handler not defined');
      }

      await expect(GithubConnector.test.handler(mockContext)).rejects.toThrow('connection refused');
    });
  });
});
