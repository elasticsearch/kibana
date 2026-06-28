/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObjectsClientContract,
  SavedObjectsFindResponse,
} from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/core/server';
import { EntityStorePreferences } from './constants';
import { EntityStorePreferencesTypeName } from './types';

/**
 * Persists the user's Entity Store preferences for a namespace. Currently this only holds the
 * `autoInstall` flag, which records whether the store should be auto-installed on Security
 * Solution navigation. It is intentionally separate from the engine descriptors and global
 * state so the user's intent survives an uninstall.
 */
export class EntityStorePreferencesClient {
  constructor(
    private readonly soClient: SavedObjectsClientContract,
    private readonly namespace: string,
    private readonly logger: Logger
  ) {}

  async get<K extends keyof EntityStorePreferences>(key: K): Promise<EntityStorePreferences[K]> {
    const preferences = await this.findOrDefault();
    return preferences[key];
  }

  async set<K extends keyof EntityStorePreferences>(
    key: K,
    value: EntityStorePreferences[K]
  ): Promise<void> {
    const id = this.getSavedObjectId();
    const response = await this.findSO();

    if (response.total === 0) {
      this.logger.debug(`Creating entity store preferences with id ${id}`);
      // Parse fills the remaining preferences with their defaults.
      await this.soClient.create<EntityStorePreferences>(
        EntityStorePreferencesTypeName,
        EntityStorePreferences.parse({ [key]: value }),
        { id, refresh: 'wait_for' }
      );
      return;
    }

    await this.soClient.update<EntityStorePreferences>(
      EntityStorePreferencesTypeName,
      id,
      { [key]: value },
      { refresh: 'wait_for', mergeAttributes: true }
    );
  }

  private async findOrDefault(): Promise<EntityStorePreferences> {
    const response = await this.findSO();
    if (response.total === 0) {
      // No preferences persisted yet → fall back to defaults (e.g. auto-install enabled).
      return EntityStorePreferences.parse({});
    }
    return EntityStorePreferences.parse(response.saved_objects[0].attributes);
  }

  private getSavedObjectId(): string {
    return `${EntityStorePreferencesTypeName}-${this.namespace}`;
  }

  private findSO(): Promise<SavedObjectsFindResponse<EntityStorePreferences>> {
    return this.soClient.find<EntityStorePreferences>({
      type: EntityStorePreferencesTypeName,
      namespaces: [this.namespace],
      perPage: 1,
    });
  }
}
