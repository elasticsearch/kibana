/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Rejects if `promise` does not settle before `ms`. The original work may still run. */
export const withTimeout = <T>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  // `finally` re-rejects when `promise` rejects. Swallow that so a late gRPC
  // failure after the timeout cannot become an unhandledRejection and crash Kibana.
  void promise.finally(() => undefined).catch(() => undefined);

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(message));
      }, ms);
      void promise.finally(() => clearTimeout(timer)).catch(() => undefined);
    }),
  ]);
};
