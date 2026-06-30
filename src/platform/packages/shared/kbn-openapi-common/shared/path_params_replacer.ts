/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Replaces placeholders in a path string with provided param value
 *
 * @param path Path string with placeholders for params
 * @param params Object with params to replace
 * @returns Path string with params replaced
 *
 * @example
 * Having a path string `my/path/{param1}/to/{param2}` and params object
 *
 * ```ts
 * const params = {
 *   param1: 'value1',
 *   param2: 'value2,
 * }
 * ```
 *
 * and invoking the function
 *
 * ```ts
 * replaceParams('my/path/{param1}/to/{param2}', params);
 * ```
 *
 * it will return `my/path/value1/to/value2`.
 *
 */
export function replaceParams(path: string, params: Record<string, string | number>): string {
  let output = path;
  Object.entries(params).forEach(([param, value]) => {
    output = output.replace(`{${param}}`, `${value}`);
  });
  return output;
}
