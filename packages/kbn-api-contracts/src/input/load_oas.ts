/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFile } from 'fs/promises';
import { parse } from 'yaml';

export interface OpenAPISpec {
  openapi: string;
  info: Record<string, unknown>;
  paths?: Record<string, unknown>;
  components?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function loadOas(filePath: string): Promise<OpenAPISpec> {
  const fileContent = await readFile(filePath, 'utf-8');
  const spec = parse(fileContent) as OpenAPISpec;

  if (!spec.openapi) {
    throw new Error(`Invalid OpenAPI spec at ${filePath}: missing "openapi" field`);
  }

  return spec;
}
