/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isAxiosError } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import type { ActionContext, ConnectorSpec } from '../../connector_spec';
import {
  AnalysisEnvironmentSchema,
  EmptyInputSchema,
  EnvironmentsResponseSchema,
  HistoryResponseSchema,
  IocsResponseSchema,
  LimitsResponseSchema,
  ListAnalysesInputSchema,
  ReportResponseSchema,
  StatusEventSchema,
  SubmissionResponseSchema,
  SubmitFileInputSchema,
  SubmitUrlInputSchema,
  TaskInputSchema,
  MAX_FILE_BYTES,
  MAX_IOCS,
  MAX_REPORT_ITEMS,
} from './types';
import type { ListAnalysesInput, SubmitFileInput, SubmitUrlInput, TaskInput } from './types';

const REGION_ENDPOINTS = {
  global: { apiUrl: 'https://api.any.run', appUrl: 'https://app.any.run' },
  us: { apiUrl: 'https://api.anyrun.us', appUrl: 'https://app.anyrun.us' },
} as const;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_OPTIONS: AxiosRequestConfig = {
  timeout: 30000,
  maxRedirects: 0,
  maxContentLength: MAX_RESPONSE_BYTES,
  maxBodyLength: MAX_FILE_BYTES + 65536,
  headers: { Accept: 'application/json' },
};

interface StatusStream extends AsyncIterable<Buffer | string> {
  destroy(error?: Error): void;
}

const getEndpoints = (ctx: ActionContext) => {
  const region = (ctx.config as { region?: unknown } | undefined)?.region ?? 'global';
  if (region !== 'global' && region !== 'us') {
    throw new Error('ANY.RUN connector has an invalid service region.');
  }
  return REGION_ENDPOINTS[region];
};

const isStatusStream = (value: unknown): value is StatusStream =>
  typeof value === 'object' &&
  value !== null &&
  Symbol.asyncIterator in value &&
  typeof (value as { destroy?: unknown }).destroy === 'function';

const parseResponse = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error('ANY.RUN returned an invalid response.');
  return result.data;
};

const getAuthHeaders = (ctx: ActionContext): { Authorization: string } => {
  const secrets = ctx.secrets as Record<string, unknown> | undefined;
  const token = typeof secrets?.apiToken === 'string' ? secrets.apiToken.trim() : '';
  if (!token) {
    throw new Error('ANY.RUN connector is missing the Sandbox API key.');
  }
  if (/^API-KEY\s+/i.test(token)) {
    throw new Error('Enter the bare ANY.RUN Sandbox API key without the API-KEY prefix.');
  }
  return { Authorization: `API-KEY ${token}` };
};

const requestOptions = (
  ctx: ActionContext,
  overrides: AxiosRequestConfig = {}
): AxiosRequestConfig => ({
  ...REQUEST_OPTIONS,
  ...overrides,
  headers: {
    ...REQUEST_OPTIONS.headers,
    ...overrides.headers,
    // api_key_header stores the bare secret under this name and configures it as a
    // default header. Suppress that storage-only header; send only Authorization.
    apiToken: null,
    ...getAuthHeaders(ctx),
  },
});

const request = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (!isAxiosError(error))
      throw new Error('ANY.RUN request failed. Check the API access and response format.');
    const status = error.response?.status;
    const guidance =
      status === 401
        ? 'Check the Sandbox API key.'
        : status === 403
        ? 'Check the Sandbox API key, API entitlement, team access, and access to the task.'
        : status === 402
        ? 'Check the Sandbox subscription and API quota.'
        : status === 429
        ? 'The API rate limit was reached. Wait before the next request.'
        : status === 404
        ? 'The task does not exist or is not accessible.'
        : status === 400
        ? 'Check the input and the limits of your Sandbox plan.'
        : 'The request failed. Check the service status and response size limit.';
    throw new Error(`ANY.RUN request failed${status ? ` (HTTP ${status})` : ''}. ${guidance}`);
  }
};

const getJson = async (ctx: ActionContext, path: string, params?: AxiosRequestConfig['params']) => {
  const { apiUrl } = getEndpoints(ctx);
  const options = requestOptions(ctx, { params });
  const response = await request(() => ctx.client.get(`${apiUrl}${path}`, options));
  return response.data;
};

const getAnalysisUrl = (ctx: ActionContext, taskId: string, providerUrl?: string) => {
  const fallback = `${getEndpoints(ctx).appUrl}/tasks/${encodeURIComponent(taskId)}`;
  if (!providerUrl) return fallback;
  try {
    const candidate = new URL(providerUrl);
    const expected = new URL(fallback);
    const validPath =
      candidate.pathname === expected.pathname || candidate.pathname === `${expected.pathname}/`;
    if (
      candidate.protocol === 'https:' &&
      candidate.origin === expected.origin &&
      validPath &&
      !candidate.username &&
      !candidate.password &&
      !candidate.search &&
      !candidate.hash
    ) {
      return providerUrl;
    }
  } catch {
    // Fall back to the configured regional application URL.
  }
  return fallback;
};

const submissionForm = (input: SubmitUrlInput | SubmitFileInput): FormData => {
  const form = new FormData();
  form.append('opt_privacy_type', input.privacy);
  form.append('opt_timeout', String(input.timeout));
  if (input.tags?.length) form.append('user_tags', [...new Set(input.tags)].join(','));
  if (input.environment) {
    form.append('env_os', input.environment.os);
    form.append('env_version', input.environment.version);
    form.append('env_bitness', String(input.environment.bitness));
    form.append('env_type', input.environment.type);
  }
  return form;
};

const submit = async (ctx: ActionContext, form: FormData) => {
  const { apiUrl } = getEndpoints(ctx);
  const options = requestOptions(ctx);
  const response = await request(() => ctx.client.post(`${apiUrl}/v1/analysis/`, form, options));
  const { data } = parseResponse(SubmissionResponseSchema, response.data);
  if (response.status === 201 && 'taskid' in data) {
    return {
      taskId: data.taskid,
      queueTaskId: null,
      analysisUrl: getAnalysisUrl(ctx, data.taskid),
      status: 'submitted',
    };
  }
  if (response.status === 202 && 'queueTaskId' in data) {
    return { taskId: null, queueTaskId: data.queueTaskId, analysisUrl: null, status: 'queued' };
  }
  throw new Error('ANY.RUN returned an invalid response for the submission status.');
};

const selectReport = (
  ctx: ActionContext,
  taskId: string,
  data: z.infer<typeof ReportResponseSchema>['data']
) => {
  const analysisUrl = getAnalysisUrl(ctx, taskId, data.analysis?.permanentUrl);
  const processes = data.processes ?? [];
  const incidents = data.incidents ?? [];
  const threats = data.network?.threats ?? [];
  const connections = data.network?.connections ?? [];
  const httpRequests = data.network?.httpRequests ?? [];
  const dnsRequests = data.network?.dnsRequests ?? [];

  return {
    taskId,
    analysisUrl,
    status: data.status,
    environment: data.environments?.os?.title ?? null,
    analysis: data.analysis
      ? {
          ...data.analysis,
          ...(data.analysis.permanentUrl ? { permanentUrl: analysisUrl } : {}),
        }
      : null,
    processes: processes.slice(0, MAX_REPORT_ITEMS),
    incidents: incidents.slice(0, MAX_REPORT_ITEMS),
    network: {
      threats: threats.slice(0, MAX_REPORT_ITEMS),
      connections: connections.slice(0, MAX_REPORT_ITEMS),
      httpRequests: httpRequests.slice(0, MAX_REPORT_ITEMS),
      dnsRequests: dnsRequests.slice(0, MAX_REPORT_ITEMS),
    },
    totals: {
      processes: processes.length,
      incidents: incidents.length,
      threats: threats.length,
      connections: connections.length,
      httpRequests: httpRequests.length,
      dnsRequests: dnsRequests.length,
    },
    truncated: {
      processes: processes.length > MAX_REPORT_ITEMS,
      incidents: incidents.length > MAX_REPORT_ITEMS,
      threats: threats.length > MAX_REPORT_ITEMS,
      connections: connections.length > MAX_REPORT_ITEMS,
      httpRequests: httpRequests.length > MAX_REPORT_ITEMS,
      dnsRequests: dnsRequests.length > MAX_REPORT_ITEMS,
    },
  };
};

const statusSnapshot = (ctx: ActionContext, data: unknown) => {
  const event = parseResponse(StatusEventSchema, data);
  if (event.error) return { taskId: null, analysisUrl: null, status: 'failed', progress: null };
  if (event.task) {
    const progress = event.task.status;
    const status =
      progress === -1
        ? 'failed'
        : progress === 100
        ? 'completed'
        : progress <= 20
        ? 'preparing'
        : 'running';
    return {
      taskId: event.task.uuid,
      analysisUrl: getAnalysisUrl(ctx, event.task.uuid),
      status,
      progress,
      ...(event.task.remaining !== undefined ? { remaining: event.task.remaining } : {}),
      ...(event.task.scores ? { verdict: event.task.scores.verdict } : {}),
    };
  }
  if (
    event.message === 'Task is queued and awaits execution.' ||
    event.message === 'Task will be launched soon.'
  ) {
    return { taskId: null, analysisUrl: null, status: 'queued', progress: null };
  }
  if (event.message === 'Task status is unknown or the task was canceled') {
    return { taskId: null, analysisUrl: null, status: 'unknown', progress: null };
  }
  throw new Error('ANY.RUN returned an invalid response for task status.');
};

const readStatus = async (ctx: ActionContext, taskId: string) => {
  const { apiUrl } = getEndpoints(ctx);
  const controller = new AbortController();
  const options = requestOptions(ctx, {
    headers: { Accept: 'text/event-stream' },
    responseType: 'stream',
    timeout: 10000,
  });
  let stream: StatusStream | undefined;
  const timeout = setTimeout(() => {
    controller.abort();
    stream?.destroy(new Error('ANY.RUN status read timed out.'));
  }, 10000);
  try {
    const response = await request(() =>
      ctx.client.get<StatusStream>(`${apiUrl}/v1/analysis/monitor/${encodeURIComponent(taskId)}`, {
        ...options,
        signal: controller.signal,
      })
    );
    if (!isStatusStream(response.data))
      throw new Error('ANY.RUN returned an invalid response stream.');
    stream = response.data;
    if (!String(response.headers['content-type']).includes('text/event-stream')) {
      throw new Error('ANY.RUN returned an invalid response content type.');
    }
    let buffer = '';
    let size = 0;
    // Read one complete SSE data event. The caller owns subsequent waits and polling.
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string')
        throw new Error('Invalid status chunk.');
      size += Buffer.byteLength(chunk);
      if (size > 65536) throw new Error('Status event exceeds 64 KiB.');
      buffer += chunk.toString();
      let separator = /\r?\n\r?\n/.exec(buffer);
      while (separator) {
        const frame = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const lines = frame.split(/\r?\n/).filter((line) => line.startsWith('data:'));
        if (lines.length) {
          const eventData = lines.map((line) => line.slice(5).replace(/^ /, '')).join('\n');
          return statusSnapshot(ctx, JSON.parse(eventData));
        }
        separator = /\r?\n\r?\n/.exec(buffer);
      }
    }
    throw new Error('Status stream ended before a complete event.');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('ANY.RUN request failed')) {
      throw error;
    }
    throw new Error(
      'ANY.RUN status request failed or returned an invalid response. Check API access, then retry this read action.'
    );
  } finally {
    clearTimeout(timeout);
    stream?.destroy();
  }
};

const getLimits = async (ctx: ActionContext) =>
  parseResponse(LimitsResponseSchema, await getJson(ctx, '/v1/user/')).data.limits;

export const AnyrunSandbox: ConnectorSpec = {
  metadata: {
    id: '.anyrun-sandbox',
    displayName: 'ANY.RUN Sandbox',
    description: i18n.translate('core.kibanaConnectorSpecs.anyrunSandbox.metadata.description', {
      defaultMessage:
        'Analyze files and URLs, monitor tasks, and read reports and indicators from ANY.RUN.',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['agentBuilder', 'workflows'],
  },
  auth: {
    types: [
      {
        type: 'api_key_header',
        isRecommended: true,
        defaults: { headerField: 'apiToken' },
        overrides: {
          meta: {
            headerField: { hidden: true },
            apiToken: {
              label: i18n.translate('connectorSpecs.anyrunSandbox.auth.apiKey.label', {
                defaultMessage: 'Sandbox API key',
              }),
              helpText: i18n.translate('connectorSpecs.anyrunSandbox.auth.apiKey.helpText', {
                defaultMessage:
                  'Enter the bare ANY.RUN Sandbox API key. Do not include API-KEY; the connector adds it to the Authorization header. Sandbox API access requires an eligible plan. Team actions also require team access.',
              }),
            },
          },
        },
      },
    ],
  },
  schema: lazySchema(() =>
    z.object({
      region: z
        .enum(['global', 'us'])
        .default('global')
        .describe('ANY.RUN service region for this account.')
        .meta({
          widget: 'select',
          label: i18n.translate('core.kibanaConnectorSpecs.anyrunSandbox.config.region.label', {
            defaultMessage: 'Service region',
          }),
          helpText: i18n.translate(
            'core.kibanaConnectorSpecs.anyrunSandbox.config.region.helpText',
            {
              defaultMessage:
                'Select Global for an any.run account or United States for an anyrun.us account. The region controls both API requests and analysis links.',
            }
          ),
        }),
    })
  ),
  policies: { retry: { maxRetries: 0 } },
  actions: {
    submitUrl: {
      isTool: false,
      scope: 'write',
      description:
        'Submit an HTTP or HTTPS URL to the remote sandbox. Requires explicit approval and uses API quota. Returns a permanent task ID and analysis URL or a temporary queue ID. Accepts a supported environment from listEnvironments. Only private visibility is allowed.',
      input: SubmitUrlInputSchema,
      handler: async (ctx, input: SubmitUrlInput) => {
        const form = submissionForm(input);
        form.append('obj_type', 'url');
        form.append('obj_url', input.url);
        return submit(ctx, form);
      },
    },
    submitFile: {
      isTool: false,
      scope: 'write',
      description:
        'Submit a Base64 file, at most 2 MiB decoded, to the remote sandbox. Requires explicit approval and uses API quota. File bytes persist in execution inputs. Does not fetch, decrypt, or extract Elastic Defend ZIP archives. Accepts a supported environment from listEnvironments. Returns a permanent task ID and analysis URL or a temporary queue ID.',
      input: SubmitFileInputSchema,
      handler: async (ctx, input: SubmitFileInput) => {
        const form = submissionForm(input);
        form.append('obj_type', 'file');
        form.append('file', new Blob([Buffer.from(input.file, 'base64')]), input.filename);
        return submit(ctx, form);
      },
    },
    getAnalysisStatus: {
      isTool: true,
      scope: 'read',
      description:
        'Read one task status event, then close the stream within ten seconds. Accepts a permanent or queued task ID. Returns status, progress, and a permanent task ID when available. Unknown does not mean completed. Add a wait between status reads; do not repeat a submission.',
      input: TaskInputSchema,
      handler: async (ctx, input: TaskInput) => readStatus(ctx, input.taskId),
    },
    getAnalysisReport: {
      isTool: true,
      scope: 'read',
      description:
        'Get the structured report for a permanent task ID. Use after getAnalysisStatus reports completed. The report includes verdict and available process and network data. Responses larger than 2 MiB fail. A report may still be incomplete while analysis is running.',
      input: TaskInputSchema,
      handler: async (ctx, input: TaskInput) => {
        const { data } = parseResponse(
          ReportResponseSchema,
          await getJson(ctx, `/v1/analysis/${encodeURIComponent(input.taskId)}`)
        );
        return selectReport(ctx, input.taskId, data);
      },
    },
    getAnalysisIocs: {
      isTool: true,
      scope: 'read',
      description:
        'Get indicators from a completed task, including type, value, and reputation. Use a permanent task ID, not a queued ID. Returns at most 1000 indicators, reports the total and truncation state, and rejects responses larger than 2 MiB.',
      input: TaskInputSchema,
      handler: async (ctx, input: TaskInput) => {
        const iocs = parseResponse(
          IocsResponseSchema,
          await getJson(ctx, `/report/${encodeURIComponent(input.taskId)}/ioc/json`)
        );
        return {
          iocs: iocs.slice(0, MAX_IOCS),
          total: iocs.length,
          truncated: iocs.length > MAX_IOCS,
        };
      },
    },
    listAnalyses: {
      isTool: true,
      scope: 'read',
      description:
        'List one page of recent analyses, with task IDs, stable analysis URLs, verdicts, dates, and tags. Use to find existing tasks before submitting another sample. Supports user or team history; team history requires team API access.',
      input: ListAnalysesInputSchema,
      handler: async (ctx, input: ListAnalysesInput) => {
        const { tasks } = parseResponse(
          HistoryResponseSchema,
          await getJson(ctx, '/v1/analysis/', input)
        ).data;
        return {
          tasks: tasks.map(({ related, ...task }) => ({
            ...task,
            analysisUrl: getAnalysisUrl(ctx, task.uuid, related),
          })),
        };
      },
    },
    getUserLimits: {
      isTool: true,
      scope: 'read',
      description:
        'Get API quotas and parallel task availability before a submission. Returns web, API, and parallel limits. A quota value of -1 means unlimited.',
      input: EmptyInputSchema,
      handler: async (ctx) => getLimits(ctx),
    },
    listEnvironments: {
      isTool: true,
      scope: 'read',
      description:
        'List plan-entitled analysis environments and identify which current combinations can be passed to submitUrl or submitFile. Deprecated or unsupported presets remain visible but cannot be submitted.',
      input: EmptyInputSchema,
      handler: async (ctx) => {
        const { environments } = parseResponse(
          EnvironmentsResponseSchema,
          await getJson(ctx, '/v1/environment/')
        ).data;
        return {
          environments: environments.map((environment) => ({
            ...environment,
            supportedForSubmission: AnalysisEnvironmentSchema.safeParse(environment).success,
          })),
        };
      },
    },
  },
  skill: [
    'Use existing analysis history for enrichment when a new submission is not needed.',
    'After an approved submission, retain both returned identifiers. Monitor queueTaskId until a permanent taskId is available.',
    'Use a wait between status reads. Stop on failed or unknown status. Fetch reports and indicators only after completion.',
    'Do not retry a submission automatically after a timeout. The service may have accepted it. Check history first to avoid a duplicate charge.',
    'Never change privacy to public to bypass a plan error. This connector supports owner and byteam only.',
    'Call listEnvironments before selecting an environment. Pass one exact item marked supportedForSubmission; your plan may not include every documented environment.',
    'Do not place credentials or confidential samples in action inputs. These inputs can be stored in execution history.',
    'This connector does not retrieve, decrypt, or extract Elastic Defend ZIP archives. Threat Intelligence Lookup is a separate API and is not included.',
  ].join('\n'),
  test: {
    enabled: true,
    description: 'Check the Sandbox API key by reading account limits. Does not submit a sample.',
    handler: getLimits,
  },
};
