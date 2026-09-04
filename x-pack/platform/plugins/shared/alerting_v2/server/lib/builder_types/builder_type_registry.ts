/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { injectable } from 'inversify';
import { stringifyZodError } from '@kbn/zod-helpers/v4';
import { treeifyError } from '@kbn/zod/v4';
import {
  MAX_BUILDER_FIELDS_ARRAY_ITEMS,
  MAX_BUILDER_FIELDS_BYTES,
  MAX_BUILDER_FIELDS_STRING_LENGTH,
} from '@kbn/alerting-v2-constants';
import { BuilderQueryGenerationError } from '@kbn/alerting-v2-rule-builders';
import { ALERTING_ERROR_CODES } from '../errors/error_codes';
import { assertBoundedSchema } from '../bounded_schema';
import { assertValidDefinition } from './assert_valid_definition';
import type { GeneratedQuery, OpaqueBuilderFields, RegisteredBuilderType } from './types';

const BUILDER_FIELDS_SUBJECT = {
  kind: 'Builder type',
  schemaProperty: 'builderFieldsSchema',
  rootPath: 'builder_fields',
  limits: {
    stringLength: MAX_BUILDER_FIELDS_STRING_LENGTH,
    arrayItems: MAX_BUILDER_FIELDS_ARRAY_ITEMS,
    totalBytes: MAX_BUILDER_FIELDS_BYTES,
  },
} as const;

@injectable()
export class BuilderTypeRegistry {
  private readonly types = new Map<string, RegisteredBuilderType>();

  public register(definition: RegisteredBuilderType): void {
    assertValidDefinition(definition);
    assertBoundedSchema(definition.builderFieldsSchema, definition.type, BUILDER_FIELDS_SUBJECT);

    if (this.types.has(definition.type)) {
      throw new Error(`Builder type "${definition.type}" is already registered`);
    }

    this.types.set(definition.type, Object.freeze({ ...definition }));
  }

  public get(type: string): RegisteredBuilderType | undefined {
    return this.types.get(type);
  }

  public has(type: string): boolean {
    return this.types.has(type);
  }

  public getAll(): RegisteredBuilderType[] {
    return [...this.types.values()];
  }

  public generate(builderType: string, builderFields: OpaqueBuilderFields): GeneratedQuery {
    const definition = this.types.get(builderType);
    if (!definition) {
      throw Boom.badRequest(
        `Unknown rule builder type "${builderType}". Registered types: ${
          this.describeRegistered() || 'none'
        }.`,
        {
          code: ALERTING_ERROR_CODES.UNKNOWN_BUILDER_TYPE,
          details: { builder_type: builderType, registered: [...this.types.keys()] },
        }
      );
    }

    const fields = this.parseFields(definition, builderFields);

    try {
      return definition.generateQuery(fields);
    } catch (error) {
      if (error instanceof BuilderQueryGenerationError) {
        throw Boom.badRequest(
          `Rule builder "${builderType}" could not generate a query: ${error.message}`,
          {
            code: ALERTING_ERROR_CODES.BUILDER_QUERY_GENERATION_FAILED,
            details: {
              builder_type: builderType,
              ...(error.path === undefined ? {} : { path: error.path }),
            },
          }
        );
      }
      throw error;
    }
  }

  /**
   * Runs `builderFields` through the registered schema. Limits are enforced
   * once, at registration, where `assertBoundedSchema` proves every registrable
   * schema is fully bounded.
   */
  private parseFields(
    definition: RegisteredBuilderType,
    builderFields: OpaqueBuilderFields
  ): OpaqueBuilderFields {
    const invalid = (message: string, errors?: unknown): Boom.Boom =>
      Boom.badRequest(message, {
        code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS,
        details: {
          builder_type: definition.type,
          ...(errors === undefined ? {} : { errors }),
        },
      });

    let result;
    try {
      result = definition.builderFieldsSchema.safeParse(builderFields);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw invalid(
        `builder_fields for builder type "${definition.type}" failed validation: ${message}`
      );
    }

    if (!result.success) {
      throw invalid(
        `builder_fields for builder type "${definition.type}" are invalid: ${stringifyZodError(
          result.error
        )}`,
        treeifyError(result.error)
      );
    }

    return result.data;
  }

  private describeRegistered(): string {
    return [...this.types.keys()].map((type) => `"${type}"`).join(', ');
  }
}

/** Injectable token alias — the class itself is the service identifier. */
export type BuilderTypeRegistryContract = BuilderTypeRegistry;
