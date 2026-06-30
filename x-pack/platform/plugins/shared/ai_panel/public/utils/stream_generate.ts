/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart, HttpResponse } from '@kbn/core/public';

// Generic NDJSON streaming helper — reads { token, error } events from any streaming route.
export async function streamNdjson(
  http: HttpStart,
  path: string,
  body: unknown,
  onToken: (token: string) => void,
  signal: AbortSignal
): Promise<void> {
  const httpResponse = await http.post(path, {
    body: JSON.stringify(body),
    asResponse: true,
    rawResponse: true,
    signal,
  });

  const reader = (httpResponse as HttpResponse<unknown>).response?.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  const processLine = (line: string) => {
    if (!line.trim()) return;
    let event: { token?: string; error?: string };
    try {
      event = JSON.parse(line) as { token?: string; error?: string };
    } catch {
      return;
    }
    if (event.error) throw new Error(event.error);
    if (event.token) onToken(event.token);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        processLine(line);
      }
    }
    // Flush any final line sent without a trailing newline
    const remaining = buffer.trim();
    if (remaining) {
      processLine(remaining);
    }
  } finally {
    reader.releaseLock();
  }
}

interface GenerateParams {
  prompt: string;
  esqlQuery?: string;
  timeRange?: { from: string; to: string };
  colorMode: 'LIGHT' | 'DARK';
}

export async function streamGenerate(
  http: HttpStart,
  params: GenerateParams,
  onToken: (token: string) => void,
  signal: AbortSignal
): Promise<void> {
  return streamNdjson(http, '/internal/ai_panel/generate', params, onToken, signal);
}
