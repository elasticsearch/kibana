/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { OpenAPIV3 } from 'openapi-types';
import type { Env } from '../../../generate_oas';
import { getIdFromRefString } from './mutations/utils';
import { describeSchemaCollision, OasSchemaCollisionError, schemasMatch } from './schema_collision';

/**
 * Behaviour when a shared schema is registered under an id that is already
 * present in the registry with a different shape.
 *
 * - `'throw'` (default): raise {@link OasSchemaCollisionError} with a diff of
 *   the conflicting properties. Catches silent overwrite bugs at OAS generate
 *   time (see https://github.com/elastic/kibana/issues/271809).
 * - `'warn'`: log a warning and let the new shape win (transitional).
 * - `'ignore'`: keep the existing legacy semantics (last-write-wins, silent).
 */
export type OnCollision = 'throw' | 'warn' | 'ignore';

export interface IContext {
  addSharedSchema: (id: string, schema: OpenAPIV3.SchemaObject) => void;
  derefSharedSchema: (id: string) => OpenAPIV3.SchemaObject | undefined;
  getSharedSchemas: () => { [id: string]: OpenAPIV3.SchemaObject };
  getEnv: () => Env;
}

interface Options {
  sharedSchemas?: Map<string, OpenAPIV3.SchemaObject>;
  env?: Env;
  onCollision?: OnCollision;
}

class Context implements IContext {
  private readonly sharedSchemas: Map<string, OpenAPIV3.SchemaObject>;
  private readonly namespace?: string;
  private readonly env: Env;
  private readonly onCollision: OnCollision;
  constructor(opts: Options) {
    this.sharedSchemas = opts.sharedSchemas ?? new Map();
    this.env = opts.env ?? { serverless: false };
    this.onCollision = opts.onCollision ?? 'throw';
  }

  public addSharedSchema(id: string, schema: OpenAPIV3.SchemaObject): void {
    if (this.onCollision !== 'ignore') {
      const existing = this.sharedSchemas.get(id);
      if (existing && !schemasMatch(existing, schema)) {
        const message = describeSchemaCollision(id, existing, schema);
        if (this.onCollision === 'throw') {
          throw new OasSchemaCollisionError(message, id);
        }
        // eslint-disable-next-line no-console
        console.warn(message);
      }
    }
    this.sharedSchemas.set(id, schema);
  }

  /** Assumes id is in the form of "#/components/schemas/my-schema-my-team" */
  public derefSharedSchema(id: string) {
    return this.sharedSchemas.get(getIdFromRefString(id));
  }

  public getSharedSchemas() {
    return Object.fromEntries(this.sharedSchemas.entries());
  }

  public getEnv() {
    return this.env;
  }

  public getNamespace() {
    return this.namespace;
  }
}

export const createCtx = (opts: Options = { sharedSchemas: new Map() }) => {
  return new Context(opts);
};

export { OasSchemaCollisionError } from './schema_collision';
