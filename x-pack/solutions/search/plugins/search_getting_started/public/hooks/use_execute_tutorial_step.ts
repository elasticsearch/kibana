/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core/public';
import type { TutorialStep, SnippetVariableKey } from './use_tutorial_content';
import { useKibana } from './use_kibana';

export interface ParsedSnippet {
  method: string;
  path: string;
  body: string | undefined;
}

export interface EsResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

export interface StepExecutionResult {
  response: EsResponse;
  extractedValues: Record<SnippetVariableKey, string>;
  explanation: string;
}

export class StepExecutionError extends Error {
  public readonly response: EsResponse;
  constructor(message: string, response: EsResponse) {
    super(message);
    this.name = 'StepExecutionError';
    this.response = response;
  }
}

const KIBANA_API_PREFIX = 'kbn:';

/**
 * Parses a Console-style API snippet ("GET /index/_search\n{...}") into
 * method, path, and optional JSON body.
 */
export const parseApiSnippet = (apiSnippet: string): ParsedSnippet => {
  const lines = apiSnippet.trim().split('\n');
  const firstLine = lines[0].trim();
  const spaceIndex = firstLine.indexOf(' ');
  const method = firstLine.substring(0, spaceIndex).toUpperCase();
  const path = firstLine.substring(spaceIndex + 1).trim();
  const body = lines.length > 1 ? lines.slice(1).join('\n').trim() : undefined;
  return { method, path, body: body || undefined };
};

type HttpMethod = 'get' | 'post' | 'delete' | 'put' | 'patch' | 'head';

/**
 * Executes a Kibana API request directly (paths starting with "kbn:").
 * Mirrors how Kibana Console handles the kbn: prefix — strips the prefix
 * and sends the request to Kibana's own API instead of through the ES proxy.
 */
const executeKibanaRequest = async (
  http: HttpSetup,
  { method, path, body }: ParsedSnippet
): Promise<EsResponse> => {
  const kibanaPath = `/${path.replace(KIBANA_API_PREFIX, '').replace(/^\/+/, '')}`;
  const httpMethod = method.toLowerCase() as HttpMethod;
  const hasBody = ['post', 'put', 'patch'].includes(httpMethod);

  const response = await http[httpMethod]<Record<string, unknown>>(kibanaPath, {
    body: hasBody ? body : undefined,
    asResponse: true,
  });

  const statusCode = response.response?.status ?? 200;

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof response.body === 'string' ? JSON.parse(response.body) : response.body ?? {};
  } catch {
    // Non-JSON response
  }

  return { statusCode, body: parsed };
};

/**
 * Executes a parsed ES request through the Console proxy endpoint.
 * This is the same mechanism the Dev Tools Console uses internally.
 */
const executeEsProxyRequest = async (
  http: HttpSetup,
  { method, path, body }: ParsedSnippet
): Promise<EsResponse> => {
  const response = await http.post<string>('/api/console/proxy', {
    query: { method, path },
    body,
    asResponse: true,
  });

  const statusCode = parseInt(
    response.response?.headers.get('x-console-proxy-status-code') ?? '200',
    10
  );

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof response.body === 'string' ? JSON.parse(response.body) : response.body ?? {};
  } catch {
    // Non-JSON response (e.g. acknowledged: true as plain text)
  }

  return { statusCode, body: parsed };
};

/**
 * Routes the request to either Kibana's API (kbn: prefix) or the ES proxy.
 */
export const executeEsRequest = async (
  http: HttpSetup,
  snippet: ParsedSnippet
): Promise<EsResponse> => {
  if (snippet.path.startsWith(KIBANA_API_PREFIX)) {
    return executeKibanaRequest(http, snippet);
  }
  return executeEsProxyRequest(http, snippet);
};

/**
 * Resolves a dot-bracket path like "hits.hits[0]._score" against a nested object.
 */
export const resolveResponsePath = (obj: unknown, responsePath: string): string => {
  const segments = responsePath.replace(/\[(\d+)]/g, '.$1').split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[segment];
  }
  return String(current ?? '');
};

export const insertValues = (template: string, values: Record<string, string>): string => {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
    template
  );
};

/**
 * Runs a single tutorial step: substitutes saved variables into the snippet,
 * executes it via the Console proxy, and extracts values from the response.
 */
export const executeTutorialStep = async (
  http: HttpSetup,
  step: TutorialStep,
  savedValues: Record<SnippetVariableKey, string>
): Promise<StepExecutionResult> => {
  const snippet = insertValues(step.apiSnippet, savedValues);
  const parsed = parseApiSnippet(snippet);
  const response = await executeEsRequest(http, parsed);

  const hasBodyError = Boolean(response.body.error);
  const bodyStatus = typeof response.body.status === 'number' ? response.body.status : 0;
  if (hasBodyError || bodyStatus >= 400) {
    const errorObj = response.body.error as Record<string, unknown> | undefined;
    const errorType = (errorObj?.type as string) ?? 'unknown_error';
    const errorReason = (errorObj?.reason as string) ?? 'Request failed';
    throw new StepExecutionError(`${errorType}: ${errorReason}`, response);
  }

  const extractedValues: Record<SnippetVariableKey, string> = {};
  for (const [key, responsePath] of Object.entries(step.valuesToSave)) {
    extractedValues[key] = resolveResponsePath(response.body, responsePath);
  }

  const mergedValues = { ...savedValues, ...extractedValues };
  const explanation = insertValues(step.explanation, mergedValues);

  return { response, extractedValues, explanation };
};

export const useExecuteTutorialStep = () => {
  const { http } = useKibana().services;

  return (step: TutorialStep, savedValues: Record<SnippetVariableKey, string>) =>
    executeTutorialStep(http, step, savedValues);
};
