/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Runtime utilities for connector error handling and response size estimation.
 * These helpers are used by connector implementations (e.g. Google Drive, S3)
 * and the generated executor to attach size metadata to errors and estimate
 * output sizes before downloads complete.
 */

export interface ConnectorActionErrorMeta {
  /**
   * Raw/provider-declared response size in bytes, for example `content-length`
   * or a provider metadata field.
   */
  contentLengthBytes?: number;
  /**
   * Estimated size in bytes of the connector action output after transformation
   * (for example, base64 expansion).
   */
  estimatedOutputBytes?: number;
}

const connectorActionErrorMeta = new WeakMap<object, ConnectorActionErrorMeta>();

/** Parses a value as a finite non-negative number. Returns `undefined` for NaN, Infinity, negatives, or non-numeric types. Accepts string representations. */
export const getFinitePositiveNumber = (value: unknown): number | undefined => {
  const numericValue = typeof value === 'string' ? Number(value) : value;
  if (typeof numericValue !== 'number' || !Number.isFinite(numericValue) || numericValue < 0) {
    return undefined;
  }
  return numericValue;
};

/**
 * Safe upper bound for the JSON wrapper that surrounds binary content in a
 * connector step output. Connectors that download files (e.g. Google Drive
 * `downloadFile`, Amazon S3 `getObject`) return a JSON object like
 * `{ content: "<base64>", encoding: "base64", name: "...", mimeType: "..." }`.
 * This constant accounts for the JSON key names, punctuation, and short
 * metadata values so that `getEstimatedBase64OutputBytes` can predict the
 * serialized step output size before the download completes.
 * The real overhead is a few hundred bytes; 1 KB is a safe ceiling.
 */
export const ESTIMATED_JSON_OUTPUT_OVERHEAD_BYTES = 1024;

/**
 * Estimates the serialized step output size for a binary download of
 * `rawBytes`. Base64 encoding expands every 3 raw bytes into 4 characters,
 * and the result is wrapped in a JSON envelope (see
 * `ESTIMATED_JSON_OUTPUT_OVERHEAD_BYTES`).
 */
export const getEstimatedBase64OutputBytes = (rawBytes: number): number =>
  Math.ceil(rawBytes / 3) * 4 + ESTIMATED_JSON_OUTPUT_OVERHEAD_BYTES;

/** Case-insensitive header lookup. Returns the raw value (may be string or string[]). */
export const getHeaderValue = ({
  headers,
  headerName,
}: {
  headers: unknown;
  headerName: string;
}): unknown => {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const normalizedHeaderName = headerName.toLowerCase();
  const headersRecord = headers as Record<string, unknown>;
  const matchingHeaderName = Object.keys(headersRecord).find(
    (key) => key.toLowerCase() === normalizedHeaderName
  );

  return matchingHeaderName ? headersRecord[matchingHeaderName] : undefined;
};

/** Extracts content-length from an Axios-like error's response or request headers. */
export const getResponseContentLengthBytes = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const axiosError = error as {
    response?: { headers?: unknown };
    request?: { res?: { headers?: unknown } };
  };
  const headerValue =
    getHeaderValue({ headers: axiosError.response?.headers, headerName: 'content-length' }) ??
    getHeaderValue({ headers: axiosError.request?.res?.headers, headerName: 'content-length' });

  return getFinitePositiveNumber(Array.isArray(headerValue) ? headerValue[0] : headerValue);
};

export const setConnectorActionErrorMeta = (
  error: unknown,
  meta: ConnectorActionErrorMeta
): void => {
  if (!error || typeof error !== 'object') {
    return;
  }

  const contentLengthBytes = getFinitePositiveNumber(meta.contentLengthBytes);
  const estimatedOutputBytes = getFinitePositiveNumber(meta.estimatedOutputBytes);
  const sanitizedMeta = {
    ...(contentLengthBytes !== undefined ? { contentLengthBytes } : {}),
    ...(estimatedOutputBytes !== undefined ? { estimatedOutputBytes } : {}),
  };

  connectorActionErrorMeta.set(error, {
    ...connectorActionErrorMeta.get(error),
    ...sanitizedMeta,
  });
};

export const getConnectorActionErrorMeta = (
  error: unknown
): ConnectorActionErrorMeta | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  return connectorActionErrorMeta.get(error);
};

/** Strips trailing slashes from a URL base, e.g. `https://host/` → `https://host`. */
export const normalizeUrl = (url: string): string => url.replace(/\/+$/, '');
