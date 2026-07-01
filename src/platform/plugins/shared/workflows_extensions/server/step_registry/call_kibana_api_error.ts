/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Thrown by `ContextManager.callKibanaApi` (and the engine helper that backs it) on a non-2xx
 * response (other than 304).
 *
 * The `message` keeps the historical `HTTP <status>: <body>` shape so default logging/error
 * output is unchanged for step authors that don't catch. In addition, the **parsed** response
 * is exposed on {@link status}, {@link headers}, and {@link body} (honoring the configured
 * response-size limit, not the message cap), so step authors can recover a structured
 * partial-success response with a regular `try/catch` + `instanceof` check instead of
 * string-parsing `message`:
 *
 * ```ts
 * try {
 *   const { body } = await context.contextManager.callKibanaApi({ method, path, body });
 *   return { output: body };
 * } catch (err) {
 *   if (err instanceof KibanaApiCallError && err.status === 500 && isPartialSuccess(err.body)) {
 *     return { output: err.body }; // recovered, structured, untruncated
 *   }
 *   throw err; // anything else -> real failure
 * }
 * ```
 *
 * Intentionally a plain `Error` subclass (not `ExecutionError`) so this leaf module — which is
 * re-exported from the `@kbn/workflows-extensions` server barrel — does not import the heavy
 * `@kbn/workflows/server` barrel and create a class-init import cycle (`extends undefined`).
 *
 * When an uncaught instance reaches the engine, it is normalized to an `ExecutionError` that
 * persists `type: 'KibanaApiCallError'` + `details: { status }`. Only the safe scalar `status`
 * is persisted; the potentially large/sensitive `body` and `headers` stay as plain instance
 * fields here (never serialized to ES), available purely for in-process `try/catch` recovery.
 */
export class KibanaApiCallError extends Error {
  public readonly status: number;
  public readonly headers: Record<string, string>;
  public readonly body: unknown;

  constructor(args: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
    message: string;
  }) {
    super(args.message);
    this.name = 'KibanaApiCallError';
    this.status = args.status;
    this.headers = args.headers;
    this.body = args.body;
  }
}
