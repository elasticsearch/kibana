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
  MAX_ARTIFACT_ARRAY_ITEMS,
  MAX_ARTIFACT_DATA_BYTES,
  MAX_ARTIFACT_STRING_LENGTH,
} from '@kbn/alerting-v2-constants';
import { ALERTING_ERROR_CODES } from '../errors/error_codes';
import { assertBoundedSchema } from '../bounded_schema';
import { assertValidDefinition } from './assert_valid_definition';
import type { ArtifactTypeDefinition, RuleArtifactLike } from './types';

const invalidArtifactData = (
  artifact: RuleArtifactLike,
  message: string,
  errors?: unknown
): Boom.Boom =>
  Boom.badRequest(message, {
    code: ALERTING_ERROR_CODES.INVALID_ARTIFACT_DATA,
    details: {
      artifact_id: artifact.id,
      artifact_type: artifact.type,
      ...(errors === undefined ? {} : { errors }),
    },
  });

/**
 * Server-side registry of artifact type definitions. Populated during plugin
 * setup via `registerArtifactType`; read-only afterward for request validation
 * and reference extract/inject.
 */
@injectable()
export class ArtifactTypeRegistry {
  private readonly types = new Map<string, ArtifactTypeDefinition>();

  public register(def: ArtifactTypeDefinition): void {
    assertValidDefinition(def);
    assertBoundedSchema(def.dataSchema, def.type, {
      kind: 'Artifact type',
      schemaProperty: 'dataSchema',
      rootPath: 'data',
      limits: {
        stringLength: MAX_ARTIFACT_STRING_LENGTH,
        arrayItems: MAX_ARTIFACT_ARRAY_ITEMS,
        totalBytes: MAX_ARTIFACT_DATA_BYTES,
      },
    });

    if (this.types.has(def.type)) {
      throw new Error(`Artifact type "${def.type}" is already registered`);
    }

    // Copy and freeze the descriptors too: the caller keeps its own array, so a
    // shared reference would let a plugin mutate e.g. `savedObjectType` after boot.
    this.types.set(
      def.type,
      Object.freeze({
        ...def,
        references: def.references?.map((descriptor) => Object.freeze({ ...descriptor })),
      })
    );
  }

  public get(type: string): ArtifactTypeDefinition | undefined {
    return this.types.get(type);
  }

  public getAll(): ArtifactTypeDefinition[] {
    return [...this.types.values()];
  }

  /**
   * Validates each artifact's `data` against its registered `dataSchema`.
   * Limits are enforced once, at registration, where `assertBoundedSchema`
   * proves every registrable schema is fully bounded.
   */
  public validate(artifacts: RuleArtifactLike[] | undefined): void {
    if (!artifacts?.length) {
      return;
    }

    for (const artifact of artifacts) {
      const def = this.types.get(artifact.type);
      if (!def) {
        continue;
      }

      let result;
      try {
        result = def.dataSchema.safeParse(artifact.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw invalidArtifactData(
          artifact,
          `Artifact "${artifact.id}" of type "${artifact.type}" failed validation: ${message}`
        );
      }

      if (!result.success) {
        throw invalidArtifactData(
          artifact,
          `Artifact "${artifact.id}" of type "${
            artifact.type
          }" has invalid data: ${stringifyZodError(result.error)}`,
          treeifyError(result.error)
        );
      }
    }
  }
}

/** Injectable token alias — the class itself is the service identifier. */
export type ArtifactTypeRegistryContract = ArtifactTypeRegistry;
