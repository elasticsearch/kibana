/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { SavedObjectsErrorHelpers, type Logger } from '@kbn/core/server';
import type { EntityType } from '../../../../common/domain/definitions/entity_schema';
import { RemoteLogExtractionState } from './constants';
import {
  deleteLegacyCcsLogExtractionState,
  readLegacyCcsLogExtractionState,
} from './legacy_ccs_log_extraction_state';
import { RemoteLogExtractionStateTypeName } from './types';

/** Persistence client for remote-extraction resume state (`entity-store-remote-state`). */
export class RemoteLogExtractionStateClient {
  constructor(
    private readonly soClient: SavedObjectsClientContract,
    private readonly namespace: string,
    private readonly logger: Logger
  ) {}

  async findOrInit(entityType: EntityType): Promise<RemoteLogExtractionState> {
    const id = this.getSavedObjectId(entityType);
    try {
      const { attributes } = await this.soClient.get<RemoteLogExtractionState>(
        RemoteLogExtractionStateTypeName,
        id
      );
      return RemoteLogExtractionState.parse(attributes);
    } catch (err) {
      if (SavedObjectsErrorHelpers.isNotFoundError(err)) {
        const legacyState = await readLegacyCcsLogExtractionState(
          this.soClient,
          entityType,
          this.namespace
        );
        if (legacyState) {
          this.logger.debug(
            `${RemoteLogExtractionStateTypeName}: migrating legacy remote state for ${entityType}`
          );
          try {
            await this.soClient.create<RemoteLogExtractionState>(
              RemoteLogExtractionStateTypeName,
              legacyState,
              { id }
            );
          } catch (createErr) {
            // A concurrent findOrInit already migrated the legacy row — treat as success.
            if (!SavedObjectsErrorHelpers.isConflictError(createErr)) {
              throw createErr;
            }
          }
          await deleteLegacyCcsLogExtractionState(this.soClient, entityType, this.namespace);
          return legacyState;
        }

        this.logger.debug(
          `${RemoteLogExtractionStateTypeName}: log extraction state not found for ${entityType}, creating default`
        );
        const defaultState = RemoteLogExtractionState.parse({});
        try {
          await this.soClient.create<RemoteLogExtractionState>(
            RemoteLogExtractionStateTypeName,
            defaultState,
            { id }
          );
          return defaultState;
        } catch (createErr) {
          // A concurrent findOrInit won the race — read and return what it created.
          if (SavedObjectsErrorHelpers.isConflictError(createErr)) {
            const { attributes } = await this.soClient.get<RemoteLogExtractionState>(
              RemoteLogExtractionStateTypeName,
              id
            );
            return RemoteLogExtractionState.parse(attributes);
          }
          throw createErr;
        }
      }
      throw err;
    }
  }

  async update(entityType: EntityType, state: Partial<RemoteLogExtractionState>): Promise<void> {
    const id = this.getSavedObjectId(entityType);
    await this.soClient.update<RemoteLogExtractionState>(
      RemoteLogExtractionStateTypeName,
      id,
      state,
      {
        refresh: 'wait_for',
        mergeAttributes: true,
      }
    );
  }

  async clearRecoveryId(entityType: EntityType): Promise<void> {
    await this.update(entityType, { paginationRecoveryId: null });
  }

  async delete(entityType: EntityType): Promise<void> {
    const id = this.getSavedObjectId(entityType);
    await this.soClient.delete(RemoteLogExtractionStateTypeName, id).catch((err) => {
      if (!SavedObjectsErrorHelpers.isNotFoundError(err)) {
        throw err;
      }
    });
    await deleteLegacyCcsLogExtractionState(this.soClient, entityType, this.namespace);
  }

  private getSavedObjectId(entityType: EntityType): string {
    return `${RemoteLogExtractionStateTypeName}-${entityType}-${this.namespace}`;
  }
}
