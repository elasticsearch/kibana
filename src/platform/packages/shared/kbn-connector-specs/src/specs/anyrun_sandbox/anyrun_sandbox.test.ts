/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AxiosHeaders, type AxiosInstance } from 'axios';
import { loggerMock } from '@kbn/logging-mocks';
import type { ActionContext } from '../../connector_spec';
import { AnyrunSandbox } from './anyrun_sandbox';
import {
  SubmitFileInputSchema,
  SubmitUrlInputSchema,
  MAX_FILE_BYTES,
  MAX_IOCS,
  MAX_REPORT_ITEMS,
} from './types';

const TASK_ID = '123e4567-e89b-12d3-a456-426614174000';
const QUEUE_ID = '7261f5d1-0939-4abe-8761-b598d46cfc8d';
const API = 'https://api.any.run';
const APP = 'https://app.any.run';
const US_API = 'https://api.anyrun.us';
const US_APP = 'https://app.anyrun.us';
const QUOTA = { minute: -1, hour: -1, day: -1, month: 250 };

interface StatusStreamMock extends AsyncIterable<string> {
  readonly destroyed: boolean;
  destroy(error?: Error): void;
}

const createStatusStream = (chunks: string[]): StatusStreamMock => {
  let destroyed = false;
  return {
    get destroyed() {
      return destroyed;
    },
    destroy() {
      destroyed = true;
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        if (destroyed) return;
        yield chunk;
      }
    },
  };
};

const createSilentStatusStream = (): StatusStreamMock => {
  let destroyed = false;
  let finish: (() => void) | undefined;
  return {
    get destroyed() {
      return destroyed;
    },
    destroy() {
      destroyed = true;
      finish?.();
    },
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          new Promise<IteratorResult<string>>((resolve) => {
            finish = () => resolve({ done: true, value: undefined });
          }),
      };
    },
  };
};

describe('ANY.RUN Sandbox', () => {
  const get = jest.fn();
  const post = jest.fn();
  const context: ActionContext = {
    client: { get, post } as unknown as AxiosInstance,
    getClient: jest.fn(),
    log: loggerMock.create(),
    config: { region: 'global' },
    secrets: { authType: 'api_key_header', apiToken: 'test-api-key' },
  };

  const execute = async (action: string, input = {}) => {
    const definition = AnyrunSandbox.actions[action];
    return definition.handler(context, definition.input.parse(input));
  };
  const streamResponse = (data: object) => {
    const stream = createStatusStream([`data: ${JSON.stringify(data)}\n\n`]);
    get.mockResolvedValue({ data: stream, headers: { 'content-type': 'text/event-stream' } });
    return stream;
  };

  beforeEach(() => jest.clearAllMocks());

  it('supports Agent Builder and Workflows', () => {
    expect(AnyrunSandbox.metadata.supportedFeatureIds).toEqual(['agentBuilder', 'workflows']);
  });

  it('stores a bare API key and does not retry submissions', () => {
    expect(AnyrunSandbox.auth?.types).toEqual([
      expect.objectContaining({
        type: 'api_key_header',
        defaults: { headerField: 'apiToken' },
        overrides: expect.objectContaining({
          meta: expect.objectContaining({ headerField: { hidden: true } }),
        }),
      }),
    ]);
    expect(AnyrunSandbox.policies?.retry?.maxRetries).toBe(0);
    expect(AnyrunSandbox.test.enabled).toBe(true);
  });

  it('accepts only the global and US service regions and defaults to global', () => {
    const schema = AnyrunSandbox.schema;
    if (!schema) throw new Error('ANY.RUN connector spec is missing a config schema.');
    expect(schema.safeParse({}).data).toEqual({ region: 'global' });
    expect(schema.safeParse({ region: 'global' }).success).toBe(true);
    expect(schema.safeParse({ region: 'us' }).success).toBe(true);
    expect(schema.safeParse({ region: 'eu' }).success).toBe(false);
    expect(schema.safeParse({ rootUrl: 'example.com' }).data).toEqual({
      region: 'global',
    });
  });

  it('exposes exactly two approval-gated submissions and six read tools', () => {
    expect(Object.keys(AnyrunSandbox.actions)).toEqual([
      'submitUrl',
      'submitFile',
      'getAnalysisStatus',
      'getAnalysisReport',
      'getAnalysisIocs',
      'listAnalyses',
      'getUserLimits',
      'listEnvironments',
    ]);
    for (const name of ['submitUrl', 'submitFile']) {
      expect(AnyrunSandbox.actions[name]).toEqual(
        expect.objectContaining({ isTool: false, scope: 'write' })
      );
    }
    for (const name of [
      'getAnalysisStatus',
      'getAnalysisReport',
      'getAnalysisIocs',
      'listAnalyses',
      'getUserLimits',
      'listEnvironments',
    ]) {
      expect(AnyrunSandbox.actions[name]).toEqual(
        expect.objectContaining({ isTool: true, scope: 'read' })
      );
    }
  });

  it('submits a private URL with the exact documented multipart fields', async () => {
    post.mockResolvedValue({ status: 201, data: { error: false, data: { taskid: TASK_ID } } });
    await expect(
      execute('submitUrl', {
        url: 'https://example.com',
        timeout: 120,
        tags: ['elastic-test'],
        environment: { os: 'windows', version: '11', bitness: 64, type: 'complete' },
      })
    ).resolves.toEqual({
      taskId: TASK_ID,
      queueTaskId: null,
      analysisUrl: `${APP}/tasks/${TASK_ID}`,
      status: 'submitted',
    });
    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe(`${API}/v1/analysis/`);
    expect(Object.fromEntries(body.entries())).toEqual({
      obj_type: 'url',
      obj_url: 'https://example.com',
      env_bitness: '64',
      env_os: 'windows',
      env_type: 'complete',
      env_version: '11',
      opt_privacy_type: 'owner',
      opt_timeout: '120',
      user_tags: 'elastic-test',
    });
    expect(options).toEqual(expect.objectContaining({ maxRedirects: 0, timeout: 30000 }));
    expect(options.headers).toEqual({
      Accept: 'application/json',
      apiToken: null,
      Authorization: 'API-KEY test-api-key',
    });
    expect(new AxiosHeaders(options.headers).toJSON()).toEqual({
      Accept: 'application/json',
      Authorization: 'API-KEY test-api-key',
    });
    expect(options.headers).not.toHaveProperty('Content-Type');
  });

  it('rejects a stored API-KEY prefix instead of sending a double prefix', async () => {
    const definition = AnyrunSandbox.actions.getUserLimits;
    const prefixedContext = {
      ...context,
      secrets: { authType: 'api_key_header', apiToken: 'API-KEY test-api-key' },
    } as ActionContext;
    await expect(definition.handler(prefixedContext, definition.input.parse({}))).rejects.toThrow(
      'bare ANY.RUN Sandbox API key'
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a missing API key before making a request', async () => {
    const definition = AnyrunSandbox.actions.getUserLimits;
    const missingKeyContext = { ...context, secrets: {} } as ActionContext;
    await expect(definition.handler(missingKeyContext, definition.input.parse({}))).rejects.toThrow(
      'missing the Sandbox API key'
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('preserves a queued submission identifier without claiming it is a permanent task', async () => {
    post.mockResolvedValue({
      status: 202,
      data: { error: false, data: { queueTaskId: QUEUE_ID } },
    });
    await expect(
      execute('submitUrl', { url: 'https://example.com', privacy: 'byteam' })
    ).resolves.toEqual({
      taskId: null,
      queueTaskId: QUEUE_ID,
      analysisUrl: null,
      status: 'queued',
    });
    expect(post.mock.calls[0][1].get('opt_privacy_type')).toBe('byteam');
  });

  it('submits exact decoded file bytes without archive extraction', async () => {
    post.mockResolvedValue({ status: 201, data: { error: false, data: { taskid: TASK_ID } } });
    await execute('submitFile', {
      file: 'dGVzdA==',
      filename: 'sample.txt',
      environment: { os: 'linux', version: '22.04.2', bitness: 64, type: 'complete' },
    });
    const body: FormData = post.mock.calls[0][1];
    const file = body.get('file');
    expect(file).toBeInstanceOf(Blob);
    if (!(file instanceof Blob)) throw new Error('Expected file part');
    expect(await file.text()).toBe('test');
    expect(body.get('obj_type')).toBe('file');
    expect(body.get('obj_url')).toBeNull();
    expect(body.get('opt_privacy_type')).toBe('owner');
    expect(body.get('env_os')).toBe('linux');
    expect(body.get('env_version')).toBe('22.04.2');
    expect(body.get('env_bitness')).toBe('64');
    expect(body.get('env_type')).toBe('complete');
  });

  it.each([
    {},
    { error: false, data: {} },
    { error: true, data: { taskid: TASK_ID } },
    { error: 'false,', data: { queueTaskId: QUEUE_ID } },
  ])('rejects malformed or unsuccessful submission envelopes: %j', async (data) => {
    post.mockResolvedValue({ status: 201, data });
    await expect(execute('submitUrl', { url: 'https://example.com' })).rejects.toThrow(
      'invalid response'
    );
  });

  it.each(['public', 'bylink'])('rejects unsafe privacy mode %s', async (privacy) => {
    await expect(execute('submitUrl', { url: 'https://example.com', privacy })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    { os: 'windows', version: '11', bitness: 64, type: 'development' },
    { os: 'windows', version: '11', bitness: 32, type: 'complete' },
    { os: 'windows', version: 'server 2025', bitness: 32, type: 'complete' },
    { os: 'linux', version: '22.04.2', bitness: 32, type: 'complete' },
    { os: 'android', version: '15', bitness: 64, type: 'complete' },
    { os: 'macos', version: '15', bitness: 64, type: 'development' },
  ])('rejects an unsupported environment combination: %j', (environment) => {
    expect(
      SubmitUrlInputSchema.safeParse({ url: 'https://example.com', environment }).success
    ).toBe(false);
  });

  it.each([
    { os: 'windows', version: '7', bitness: 32, type: 'complete' },
    { os: 'windows', version: '11', bitness: 64, type: 'complete' },
    { os: 'windows', version: 'server 2025', bitness: 64, type: 'complete' },
    { os: 'windows', version: '10', bitness: 64, type: 'development' },
    { os: 'linux', version: '12.2', bitness: 64, type: 'complete' },
    { os: 'android', version: '14', bitness: 64, type: 'complete' },
    { os: 'macos', version: '15', bitness: 64, type: 'complete' },
  ])('accepts a documented environment combination: %j', (environment) => {
    expect(
      SubmitUrlInputSchema.safeParse({ url: 'https://example.com', environment }).success
    ).toBe(true);
  });

  it.each(['file:///etc/passwd', 'ftp://example.com', 'https://user:password@example.com', 'bad'])(
    'rejects invalid URLs: %s',
    (url) => expect(SubmitUrlInputSchema.safeParse({ url }).success).toBe(false)
  );

  it.each(['dGVzdA', 'dGVzdA===', 'data:text/plain;base64,dGVzdA==', '%%%%', ''])(
    'rejects noncanonical Base64: %s',
    (file) =>
      expect(SubmitFileInputSchema.safeParse({ file, filename: 'sample.txt' }).success).toBe(false)
  );

  it('accepts the file size boundary and rejects one extra byte', () => {
    expect(
      SubmitFileInputSchema.safeParse({
        file: Buffer.alloc(MAX_FILE_BYTES).toString('base64'),
        filename: 'sample.txt',
      }).success
    ).toBe(true);
    expect(
      SubmitFileInputSchema.safeParse({
        file: Buffer.alloc(MAX_FILE_BYTES + 1).toString('base64'),
        filename: 'sample.txt',
      }).success
    ).toBe(false);
  });

  it.each(['../sample.txt', 'path\\sample.txt', 'bad\nname', '.', '..'])(
    'rejects filename %s',
    (filename) => {
      expect(SubmitFileInputSchema.safeParse({ file: 'dGVzdA==', filename }).success).toBe(false);
    }
  );

  it.each([-1, 0, 20, 21, 99, 100])(
    'reads and closes one status event with progress %i',
    async (progress) => {
      const stream = streamResponse({
        error: false,
        completed: progress === 100,
        task: { uuid: TASK_ID, status: progress },
      });
      const result = await execute('getAnalysisStatus', { taskId: QUEUE_ID });
      expect(result.taskId).toBe(TASK_ID);
      expect(result.analysisUrl).toBe(`https://app.any.run/tasks/${TASK_ID}`);
      expect(result.progress).toBe(progress);
      expect(result.status).toBe(
        progress === -1
          ? 'failed'
          : progress === 100
          ? 'completed'
          : progress <= 20
          ? 'preparing'
          : 'running'
      );
      expect(stream.destroyed).toBe(true);
      expect(get).toHaveBeenCalledWith(
        `${API}/v1/analysis/monitor/${QUEUE_ID}`,
        expect.objectContaining({ responseType: 'stream', maxRedirects: 0 })
      );
    }
  );

  it.each([
    ['Task is queued and awaits execution.', 'queued'],
    ['Task will be launched soon.', 'queued'],
    ['Task status is unknown or the task was canceled', 'unknown'],
  ])('maps %s without falsely claiming completion', async (message, status) => {
    streamResponse({ error: false, message });
    expect(await execute('getAnalysisStatus', { taskId: QUEUE_ID })).toEqual({
      taskId: null,
      analysisUrl: null,
      status,
      progress: null,
    });
  });

  it('treats a prelaunch error as failed, without echoing the provider message', async () => {
    streamResponse({ error: true, message: 'secret sentinel' });
    expect(await execute('getAnalysisStatus', { taskId: QUEUE_ID })).toEqual({
      taskId: null,
      analysisUrl: null,
      status: 'failed',
      progress: null,
    });
  });

  it('handles heartbeat comments and split CRLF frames', async () => {
    const stream = createStatusStream([
      ':heartbeat\r\n\r\n',
      'data: {"error":false,"message":"Task is queued and awaits execution."}\r',
      '\n\r\n',
    ]);
    get.mockResolvedValue({ data: stream, headers: { 'content-type': 'text/event-stream' } });
    expect((await execute('getAnalysisStatus', { taskId: QUEUE_ID })).status).toBe('queued');
    expect(stream.destroyed).toBe(true);
  });

  it('rejects oversized or malformed status events and closes the stream', async () => {
    for (const chunk of ['data: not-json\n\n', 'x'.repeat(65537), 'data: {}\n\n']) {
      const stream = createStatusStream([chunk]);
      get.mockResolvedValue({ data: stream, headers: { 'content-type': 'text/event-stream' } });
      await expect(execute('getAnalysisStatus', { taskId: QUEUE_ID })).rejects.toThrow();
      expect(stream.destroyed).toBe(true);
    }
  });

  it('closes a silent status stream after ten seconds', async () => {
    jest.useFakeTimers();
    try {
      const stream = createSilentStatusStream();
      get.mockResolvedValue({ data: stream, headers: { 'content-type': 'text/event-stream' } });
      const result = expect(execute('getAnalysisStatus', { taskId: QUEUE_ID })).rejects.toThrow();
      await jest.advanceTimersByTimeAsync(10000);
      await result;
      expect(stream.destroyed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('preserves sanitized HTTP guidance for a failed status request', async () => {
    get.mockRejectedValue({
      isAxiosError: true,
      message: 'secret sentinel',
      response: { status: 403, data: { message: 'secret sentinel' } },
    });
    await expect(execute('getAnalysisStatus', { taskId: QUEUE_ID })).rejects.toThrow('HTTP 403');
    await expect(execute('getAnalysisStatus', { taskId: QUEUE_ID })).rejects.toThrow('API key');
    await expect(execute('getAnalysisStatus', { taskId: QUEUE_ID })).rejects.not.toThrow(
      'secret sentinel'
    );
  });

  it('uses the bounded US service region for API and analysis URLs', async () => {
    const usContext = { ...context, config: { region: 'us' } } as ActionContext;
    const limits = { web: QUOTA, api: QUOTA, parallels: { total: 1, available: 1 } };
    get.mockResolvedValueOnce({ data: { error: false, data: { limits } } });
    await AnyrunSandbox.actions.getUserLimits.handler(
      usContext,
      AnyrunSandbox.actions.getUserLimits.input.parse({})
    );
    expect(get.mock.calls[0][0]).toBe(`${US_API}/v1/user/`);

    post.mockResolvedValueOnce({
      status: 201,
      data: { error: false, data: { taskid: TASK_ID } },
    });
    const result = await AnyrunSandbox.actions.submitUrl.handler(
      usContext,
      AnyrunSandbox.actions.submitUrl.input.parse({ url: 'https://example.com' })
    );
    expect(post.mock.calls[0][0]).toBe(`${US_API}/v1/analysis/`);
    expect(result.analysisUrl).toBe(`${US_APP}/tasks/${TASK_ID}`);

    const stream = createStatusStream([
      `data: ${JSON.stringify({
        error: false,
        completed: true,
        task: { uuid: TASK_ID, status: 100 },
      })}\n\n`,
    ]);
    get.mockResolvedValueOnce({
      data: stream,
      headers: { 'content-type': 'text/event-stream' },
    });
    const status = await AnyrunSandbox.actions.getAnalysisStatus.handler(
      usContext,
      AnyrunSandbox.actions.getAnalysisStatus.input.parse({ taskId: TASK_ID })
    );
    expect(get.mock.calls[1][0]).toBe(`${US_API}/v1/analysis/monitor/${TASK_ID}`);
    expect(status.analysisUrl).toBe(`${US_APP}/tasks/${TASK_ID}`);
  });

  it('rejects an invalid runtime region before making a request', async () => {
    const invalidContext = { ...context, config: { region: 'eu' } } as ActionContext;
    await expect(
      AnyrunSandbox.actions.getUserLimits.handler(
        invalidContext,
        AnyrunSandbox.actions.getUserLimits.input.parse({})
      )
    ).rejects.toThrow('invalid service region');
    expect(get).not.toHaveBeenCalled();
  });

  it('returns selected, bounded report fields without HTTP bodies or unknown provider data', async () => {
    const processes = Array.from({ length: MAX_REPORT_ITEMS + 1 }, (_, index) => ({
      fileName: `process-${index}.exe`,
      pid: index,
      providerOnly: 'drop me',
    }));
    const report = {
      status: 'finished',
      environments: { os: { title: 'Windows 11' }, providerOnly: 'drop me' },
      analysis: {
        uuid: TASK_ID,
        permanentUrl: `${APP}/tasks/${TASK_ID}/`,
        creationText: '2026-09-04T00:00:00Z',
        scores: {
          verdict: { score: 5, threatLevel: 2, threatLevelText: 'Malicious activity' },
        },
        providerOnly: 'drop me',
      },
      processes,
      network: {
        connections: [
          {
            ip: '203.0.113.10',
            port: 443,
            protocol: 'tcp',
            reputation: 'neutral',
          },
        ],
        httpRequests: [
          {
            method: 'GET',
            url: 'https://example.com/',
            httpCode: 200,
            body: 'provider response body is not returned',
          },
        ],
        dnsRequests: [
          {
            domain: 'example.com',
            ips: ['203.0.113.10'],
            reputation: 'neutral',
            reputationNumber: 0,
          },
        ],
      },
      providerOnly: { arbitrary: 'drop me' },
    };
    get.mockResolvedValue({ data: { error: false, data: report } });
    const result = await execute('getAnalysisReport', { taskId: TASK_ID });
    expect(result.taskId).toBe(TASK_ID);
    expect(result.analysisUrl).toBe(`${APP}/tasks/${TASK_ID}/`);
    expect(result.environment).toBe('Windows 11');
    expect(result.processes).toHaveLength(MAX_REPORT_ITEMS);
    expect(result.processes[0]).toEqual({ fileName: 'process-0.exe', pid: 0 });
    expect(result.network.httpRequests[0]).toEqual({
      method: 'GET',
      url: 'https://example.com/',
      httpCode: 200,
    });
    expect(result.network.connections[0].reputation).toBe('neutral');
    expect(result.network.dnsRequests[0]).toEqual({
      domain: 'example.com',
      ips: ['203.0.113.10'],
      reputation: 'neutral',
      reputationNumber: 0,
    });
    expect(result.totals.processes).toBe(MAX_REPORT_ITEMS + 1);
    expect(result.truncated.processes).toBe(true);
    expect(result).not.toHaveProperty('providerOnly');
    expect(get).toHaveBeenCalledWith(
      `${API}/v1/analysis/${TASK_ID}`,
      expect.objectContaining({ maxContentLength: 2 * 1024 * 1024 })
    );
  });

  it('falls back to the configured analysis host for an unexpected provider URL', async () => {
    get.mockResolvedValue({
      data: {
        error: false,
        data: {
          status: 'finished',
          analysis: { uuid: TASK_ID, permanentUrl: `https://example.com/tasks/${TASK_ID}` },
        },
      },
    });
    const result = await execute('getAnalysisReport', { taskId: TASK_ID });
    expect(result.analysisUrl).toBe(`${APP}/tasks/${TASK_ID}`);
    expect(result.analysis?.permanentUrl).toBe(`${APP}/tasks/${TASK_ID}`);
  });

  it('reads and bounds the bare IOC array without expecting a data envelope', async () => {
    const iocs = Array.from({ length: MAX_IOCS + 1 }, (_, index) => ({
      category: 'Network',
      type: 'domain',
      ioc: `ioc-${index}.example`,
      reputation: 0,
    }));
    get.mockResolvedValue({ data: iocs });
    const result = await execute('getAnalysisIocs', { taskId: TASK_ID });
    expect(result.iocs).toHaveLength(MAX_IOCS);
    expect(result.total).toBe(MAX_IOCS + 1);
    expect(result.truncated).toBe(true);
    expect(get.mock.calls[0][0]).toBe(`${API}/report/${TASK_ID}/ioc/json`);
  });

  it('uses documented history pagination query parameters', async () => {
    get.mockResolvedValue({
      data: {
        error: false,
        data: {
          tasks: [
            {
              uuid: TASK_ID,
              verdict: 'No threats detected',
              related: `${APP}/tasks/${TASK_ID}/`,
              date: '2026-09-04T00:00:00Z',
              tags: ['elastic-test', { users: true, tag: 'triage' }],
            },
          ],
        },
      },
    });
    const result = await execute('listAnalyses', { limit: 10, skip: 20, team: true });
    expect(result.tasks[0].uuid).toBe(TASK_ID);
    expect(result.tasks[0].analysisUrl).toBe(`${APP}/tasks/${TASK_ID}/`);
    expect(get).toHaveBeenCalledWith(
      `${API}/v1/analysis/`,
      expect.objectContaining({ params: { limit: 10, skip: 20, team: true } })
    );
  });

  it('checks API limits through the same read action as the connection test', async () => {
    const limits = { web: QUOTA, api: QUOTA, parallels: { total: 1, available: 1 } };
    get.mockResolvedValue({ data: { error: false, data: { limits } } });
    expect(await execute('getUserLimits')).toEqual(limits);
    expect(await AnyrunSandbox.test.handler(context)).toEqual(limits);
  });

  it('lists environment metadata without returning installed software', async () => {
    get.mockResolvedValue({
      data: {
        error: false,
        data: {
          environments: [
            { os: 'windows', version: '11', bitness: 64, type: 'complete', software: { apps: [] } },
            { os: 'windows', version: '7', bitness: 32, type: 'clean', software: { apps: [] } },
          ],
        },
      },
    });
    expect(await execute('listEnvironments')).toEqual({
      environments: [
        {
          os: 'windows',
          version: '11',
          bitness: 64,
          type: 'complete',
          supportedForSubmission: true,
        },
        {
          os: 'windows',
          version: '7',
          bitness: 32,
          type: 'clean',
          supportedForSubmission: false,
        },
      ],
    });
  });

  it.each([
    'getAnalysisReport',
    'getAnalysisIocs',
    'listAnalyses',
    'getUserLimits',
    'listEnvironments',
  ])('rejects malformed successful responses for %s', async (action) => {
    get.mockResolvedValue({ data: { error: false, data: {} } });
    await expect(
      execute(action, action.startsWith('getAnalysis') ? { taskId: TASK_ID } : {})
    ).rejects.toThrow('invalid response');
  });

  it.each([400, 401, 402, 403, 404, 429, 500])(
    'sanitizes HTTP %i without copying response data or secrets',
    async (status) => {
      get.mockRejectedValue({
        isAxiosError: true,
        message: 'secret sentinel',
        config: { headers: { Authorization: 'secret sentinel' } },
        response: { status, data: { message: 'secret sentinel' } },
      });
      try {
        await execute('getUserLimits');
        throw new Error('Expected rejection');
      } catch (error) {
        expect(String(error)).toContain(`HTTP ${status}`);
        expect(String(error)).not.toContain('secret sentinel');
      }
    }
  );

  it('sends the official API-KEY authorization prefix on every read request', async () => {
    const limits = { web: QUOTA, api: QUOTA, parallels: { total: 1, available: 1 } };
    get.mockResolvedValue({ data: { error: false, data: { limits } } });
    await execute('getUserLimits');
    expect(get.mock.calls[0][1].headers).toEqual({
      Accept: 'application/json',
      apiToken: null,
      Authorization: 'API-KEY test-api-key',
    });
  });
});
