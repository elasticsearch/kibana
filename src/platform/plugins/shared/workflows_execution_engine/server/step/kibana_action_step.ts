/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// TODO: Remove eslint exceptions comments and fix the issues
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HTTPAuthorizationHeader,
  isUiamCredential,
  UIAM_INTERNAL_CLIENT_AUTH_HEADER,
} from '@kbn/core-security-server';
import type { FetcherConfigSchema } from '@kbn/workflows';
import { buildKibanaRequest, KibanaHttpMethods } from '@kbn/workflows';
import type { KibanaGraphNode } from '@kbn/workflows/graph/types';
import type { z } from '@kbn/zod/v4';
import { ResponseSizeLimitError } from './errors';
import type { BaseStep, RunStepResult } from './node_implementation';
import { BaseAtomicNodeImplementation } from './node_implementation';
import {
  getOutboundEventChainHeaders,
  X_ELASTIC_INTERNAL_ORIGIN_REQUEST,
} from '../trigger_events/event_context/event_chain_context';
import { getKibanaUrl, isTextContentType, readResponseStream } from '../utils';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../workflow_event_logger';

/**
 * Fetcher configuration options for customizing HTTP requests
 * Derived from the Zod schema to ensure type safety and avoid duplication
 */
type FetcherOptions = NonNullable<z.infer<typeof FetcherConfigSchema>> & {
  // Allow additional undici Agent options to be passed through
  [key: string]: any;
};

/**
 * Describes a single field in a multipart/form-data upload.
 * Used by the `form_data` param of `kibana.request` steps.
 */
interface FormDataFieldSpec {
  /** The field value / file content (string). */
  content: string;
  /** Optional filename hint (e.g. "export.ndjson"). */
  filename?: string;
  /** MIME type of the field value (e.g. "application/ndjson"). */
  content_type?: string;
}

export class KibanaActionStepImpl extends BaseAtomicNodeImplementation<BaseStep> {
  constructor(
    private node: KibanaGraphNode,
    stepExecutionRuntime: StepExecutionRuntime,
    workflowRuntime: WorkflowExecutionRuntimeManager,
    private workflowLogger: IWorkflowEventLogger
  ) {
    const step = {
      name: node.stepId,
      type: node.stepType,
      stepId: node.stepId,
      'max-step-size': node.configuration['max-step-size'],
    };
    super(step, stepExecutionRuntime, undefined, workflowRuntime);
  }

  public getInput() {
    const stepWith = this.node.configuration?.with || {};
    return this.stepExecutionRuntime.contextManager.renderValueAccordingToContext(stepWith);
  }

  public async _run(withInputs?: any): Promise<RunStepResult> {
    const stepType = this.node.configuration.type;
    // Use rendered inputs if provided, otherwise fall back to raw configuration.with
    const stepWith = withInputs || this.node.configuration.with;
    // Extract meta params (not forwarded as HTTP request params)
    const {
      use_server_info = false,
      use_localhost = false,
      debug = false,
      ...httpParams
    } = stepWith;

    if (use_server_info && use_localhost) {
      throw new Error(
        'Cannot set both use_server_info and use_localhost — they are mutually exclusive. ' +
          'Use use_server_info to route via the internal server address, or use_localhost to route via localhost:5601.'
      );
    }

    try {
      this.workflowLogger.logInfo(`Executing Kibana action: ${stepType}`, {
        event: { action: 'kibana-action', outcome: 'unknown' },
        tags: ['kibana', 'internal-action'],
        labels: {
          step_type: stepType,
          connector_type: stepType,
          action_type: 'kibana',
        },
      });

      // Get Kibana base URL (respecting force flags)
      const kibanaUrl = this.getKibanaUrl(use_server_info, use_localhost);

      // Generic approach like Dev Console - just forward the request to Kibana
      const result = await this.executeKibanaRequest(kibanaUrl, stepType, httpParams, debug);

      this.workflowLogger.logInfo(`Kibana action completed: ${stepType}`, {
        event: { action: 'kibana-action', outcome: 'success' },
        tags: ['kibana', 'internal-action'],
        labels: {
          step_type: stepType,
          connector_type: stepType,
          action_type: 'kibana',
        },
      });

      return { input: stepWith, output: result, error: undefined };
    } catch (error) {
      this.workflowLogger.logError(`Kibana action failed: ${stepType}`, error as Error, {
        event: { action: 'kibana-action', outcome: 'failure' },
        tags: ['kibana', 'internal-action', 'error'],
        labels: {
          step_type: stepType,
          connector_type: stepType,
          action_type: 'kibana',
        },
      });

      const failure = this.handleFailure(stepWith, error);
      if (debug && failure.error) {
        const kibanaUrl = this.getKibanaUrl(use_server_info, use_localhost);
        failure.error = {
          type: failure.error.type,
          message: failure.error.message,
          details: { ...failure.error.details, _debug: { kibanaUrl } },
        };
      }
      return failure;
    }
  }

  private getKibanaUrl(use_server_info = false, use_localhost = false): string {
    const coreStart = this.stepExecutionRuntime.contextManager.getCoreStart();
    const { cloudSetup } = this.stepExecutionRuntime.contextManager.getDependencies();
    return getKibanaUrl(coreStart, cloudSetup, use_server_info, use_localhost);
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'kbn-xsrf': 'true',
    };

    // Get fakeRequest for authentication (created by Task Manager from taskInstance.apiKey)
    const fakeRequest = this.stepExecutionRuntime.contextManager.getFakeRequest();
    if (fakeRequest?.headers?.authorization) {
      // Use API key from fakeRequest if available
      headers.Authorization = fakeRequest.headers.authorization.toString();
      // When authenticating with an internal UIAM API key, mark the loopback request so the HTTP auth
      // provider attaches the UIAM client-authentication shared secret (which stays server-side). See
      // UIAM_INTERNAL_CLIENT_AUTH_HEADER.
      const parsedAuth = HTTPAuthorizationHeader.parseFromRequest(fakeRequest);
      if (parsedAuth && isUiamCredential(parsedAuth)) {
        headers[UIAM_INTERNAL_CLIENT_AUTH_HEADER] = 'true';
      }
    } else {
      throw new Error('No authentication headers found');
    }
    return headers;
  }

  private async executeKibanaRequest(
    kibanaUrl: string,
    stepType: string,
    params: any,
    debug: boolean = false
  ): Promise<any> {
    const spaceId = this.stepExecutionRuntime.contextManager.getWorkflowSpaceId();

    // Extract and remove fetcher configuration from params (it's only for our internal use)
    const { fetcher: fetcherOptions, ...cleanParams } = params;

    // Build the request config from either raw API format or connector definitions
    let requestConfig: {
      method: string;
      path: string;
      body?: any;
      formData?: Record<string, FormDataFieldSpec>;
      query?: any;
      headers?: Record<string, string>;
    };

    if (cleanParams.body && cleanParams.form_data) {
      throw new Error(
        'Cannot set both body and form_data — they are mutually exclusive. ' +
          'Use body for JSON requests, or form_data for multipart/form-data uploads.'
      );
    }

    const authHeaders = this.getAuthHeaders();
    const jsonContentType = { 'Content-Type': 'application/json' };

    if (cleanParams.request) {
      // Raw API format: { request: { method, path, body, query, headers } } - like Dev Console
      const { method = 'GET', path, body, query, headers: customHeaders } = cleanParams.request;
      requestConfig = {
        method,
        path,
        body,
        query,
        headers: { ...authHeaders, ...jsonContentType, ...customHeaders },
      };
    } else if (cleanParams.form_data) {
      // form_data mode: POST multipart/form-data (e.g. saved objects import).
      // Content-Type is intentionally omitted — fetch sets it automatically with the multipart boundary.
      const { form_data, method = 'POST', path, query, headers: customHeaders } = cleanParams;
      requestConfig = {
        method,
        path,
        formData: form_data as Record<string, FormDataFieldSpec>,
        query,
        headers: { ...authHeaders, ...(customHeaders as Record<string, string> | undefined) },
      };
    } else {
      // Use generated connector definitions to determine method and path (covers all 454+ Kibana APIs)
      const {
        method,
        path,
        body,
        query,
        headers: connectorHeaders,
      } = buildKibanaRequest(stepType, cleanParams, spaceId);
      requestConfig = {
        method,
        path,
        body,
        query,
        headers: { ...authHeaders, ...jsonContentType, ...connectorHeaders },
      };
    }

    const normalizedMethod = requestConfig.method?.toUpperCase();
    if (!normalizedMethod || !(KibanaHttpMethods as readonly string[]).includes(normalizedMethod)) {
      throw new Error(
        `Invalid HTTP method "${requestConfig.method}". Valid values: ${KibanaHttpMethods.join(
          ', '
        )}`
      );
    }
    requestConfig.method = normalizedMethod;

    // Use the local implementation to handle all requests including multipart and fetcher options.
    const result = await this.makeHttpRequest(kibanaUrl, requestConfig, fetcherOptions);

    if (debug) {
      // _debug is only meaningful for object responses (JSON). For Buffers / strings / null
      // it is intentionally skipped to preserve the existing body shape.
      if (
        result &&
        typeof result === 'object' &&
        !Buffer.isBuffer(result) &&
        !Array.isArray(result)
      ) {
        return {
          ...result,
          _debug: {
            fullUrl: this.buildFullUrl(kibanaUrl, requestConfig.path, requestConfig.query),
            method: requestConfig.method,
          },
        };
      }
    }

    return result;
  }

  private buildFullUrl(kibanaUrl: string, path: string, query?: Record<string, string>): string {
    let fullUrl = `${kibanaUrl}${path}`;
    if (query && Object.keys(query).length > 0) {
      fullUrl = `${fullUrl}?${new URLSearchParams(query).toString()}`;
    }
    return fullUrl;
  }

  private buildFormData(formData: Record<string, FormDataFieldSpec>): FormData {
    const fd = new FormData();
    for (const [fieldName, spec] of Object.entries(formData)) {
      if (spec.filename !== undefined) {
        // File field: include filename so the server gets Content-Disposition: form-data; filename="..."
        const blob = new Blob([spec.content], {
          type: spec.content_type ?? 'application/octet-stream',
        });
        fd.append(fieldName, blob, spec.filename);
      } else if (spec.content_type !== undefined) {
        // Typed blob without a filename (e.g. application/json fragment)
        const blob = new Blob([spec.content], { type: spec.content_type });
        fd.append(fieldName, blob);
      } else {
        // Plain text field — serialize as a string so Content-Disposition has no filename
        fd.append(fieldName, spec.content);
      }
    }
    return fd;
  }

  private async makeHttpRequest(
    kibanaUrl: string,
    requestConfig: {
      method: string;
      path: string;
      body?: any;
      formData?: Record<string, FormDataFieldSpec>;
      query?: any;
      headers?: Record<string, string>;
    },
    fetcherOptions?: FetcherOptions
  ): Promise<any> {
    const { method, path, body, formData, query, headers = {} } = requestConfig;

    // Two paths can lead to emitEvent: (1) In-process: a workflow step (e.g. kibana.createCase) runs in
    // the same process and gets the fakeRequest from step context; getCasesClient(fakeRequest) and later
    // emitEvent(fakeRequest) see the Symbol-set context — no headers needed. (2) Outbound HTTP: this
    // step (kibana.request) sends a new HTTP request; the route handler receives a new request object
    // with no Symbol. Inject these headers so the server can restore context (depth + sourceExecutionId)
    // and enforce the event-chain depth cap when that handler calls emitEvent.
    // X_ELASTIC_INTERNAL_ORIGIN_REQUEST sets isInternalApiRequest on the receiving KibanaRequest so
    // getEventChainContext will parse the event-chain headers. Note: this header can be set by any
    // HTTP caller, so it gates naive spoofing but is not a hard trust boundary.
    const fakeRequest = this.stepExecutionRuntime.contextManager.getFakeRequest();
    const workflowRunId = this.stepExecutionRuntime.workflowExecution?.id;
    const outboundHeaders = {
      ...headers,
      [X_ELASTIC_INTERNAL_ORIGIN_REQUEST]: 'Kibana',
      ...getOutboundEventChainHeaders(fakeRequest, workflowRunId),
    };

    // Build full URL with query parameters
    let fullUrl = `${kibanaUrl}${path}`;
    if (query && Object.keys(query).length > 0) {
      const queryString = new URLSearchParams(query).toString();
      fullUrl = `${fullUrl}?${queryString}`;
    }

    // Build fetch body: multipart FormData or JSON
    let fetchBody: RequestInit['body'];
    if (formData) {
      fetchBody = this.buildFormData(formData);
    } else {
      fetchBody = body != null ? JSON.stringify(body) : undefined;
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers: outboundHeaders,
      body: fetchBody,
    };

    // Apply undici Agent with fetcher options
    if (fetcherOptions && Object.keys(fetcherOptions).length > 0) {
      const { Agent } = await import('undici');

      const {
        skip_ssl_verification,
        follow_redirects,
        max_redirects,
        keep_alive,
        ...otherOptions
      } = fetcherOptions;

      const agentOptions: any = { ...otherOptions };

      // Map our options to undici Agent options
      if (skip_ssl_verification) {
        agentOptions.connect = { ...(agentOptions.connect || {}), rejectUnauthorized: false };
      }
      if (max_redirects !== undefined) {
        agentOptions.maxRedirections = max_redirects;
      }
      if (keep_alive !== undefined) {
        agentOptions.keepAliveTimeout = keep_alive ? 60000 : 0;
        agentOptions.keepAliveMaxTimeout = keep_alive ? 600000 : 0;
      }

      (fetchOptions as any).dispatcher = new Agent(agentOptions);

      // Handle redirect at fetch level
      if (follow_redirects === false) {
        fetchOptions.redirect = 'manual';
      }
    }

    // Make the HTTP request
    const response = await fetch(fullUrl, fetchOptions);

    if (!response.ok) {
      const errorBody = await this.readStreamWithLimit(response, {
        maxBytes: 1024 * 1024,
        onExceed: 'truncate',
      });
      throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }

    if (response.status === 204 || response.status === 304) {
      return {};
    }

    return this.readResponseBody(response);
  }

  /**
   * Reads a fetch Response body as a stream with size enforcement.
   * Binary content types are returned as a raw Buffer to preserve the original bytes.
   * Text/JSON content types are decoded as UTF-8 and parsed normally.
   *
   * NOTE: Binary responses are returned as a Node.js Buffer. This works correctly within
   * the same execution (e.g. download → base64_encode → use), but Buffers serialize to
   * JSON as { type: "Buffer", data: [n, n, ...] } which is ~4x larger than the raw bytes.
   * After ES persistence and reload the deserialized object is a plain object, not a Buffer,
   * so Buffer.isBuffer() and the base64_encode filter would not handle it correctly.
   * For now this is acceptable since binary data is typically consumed immediately.
   */
  private async readResponseBody(
    response: Response
  ): Promise<Buffer | Record<string, unknown> | string | null> {
    if (!response.body) {
      return null;
    }

    const contentType = response.headers.get('content-type');
    const maxSize = this.getMaxResponseBytes();
    const { buffer, truncated } = await readResponseStream(response, maxSize);

    if (truncated) {
      throw new ResponseSizeLimitError(maxSize, this.step.name);
    }
    if (buffer.byteLength === 0) return null;

    if (!isTextContentType(contentType)) {
      return buffer;
    }

    const text = buffer.toString('utf-8');
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * Reads a Response body stream as a UTF-8 string with truncation for error bodies.
   */
  private async readStreamWithLimit(
    response: Response,
    opts: { maxBytes: number; onExceed: 'truncate' }
  ): Promise<string> {
    const { buffer, truncated } = await readResponseStream(response, opts.maxBytes);
    const text = buffer.toString('utf-8');
    return truncated ? `${text}... [truncated]` : text;
  }
}
