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
import { SavedObjectsErrorHelpers, type Logger } from '@kbn/core/server';
import Boom from '@hapi/boom';
import {
  EntityStoreGlobalState,
  EntityStoreGlobalStateOverrides,
  HistorySnapshotState,
  LogExtractionConfig,
  type LogExtractionOverride,
} from './constants';
import { EntityStoreGlobalStateTypeName } from './types';
import { getLegacyLogExtractionOverrides } from './legacy_defaults';
import { retryOnConflict, type RetryOnConflictOptions } from '../../../infra/elasticsearch';

const getLogsExtractionOverrides = (attrs: EntityStoreGlobalStateOverrides) =>
  attrs.defaultsVersion === 'latest'
    ? attrs.logsExtraction ?? {}
    : getLegacyLogExtractionOverrides(attrs.logsExtraction ?? {});

/** Applies incoming overrides on top of the stored ones. `undefined` leaves a key alone, `null` deletes it. */
const applyLogExtractionOverrides = (
  stored: Partial<LogExtractionConfig>,
  incoming: LogExtractionOverride = {}
): Partial<LogExtractionConfig> => {
  const next: Partial<LogExtractionConfig> = { ...stored };
  for (const key of Object.keys(incoming) as Array<keyof LogExtractionOverride>) {
    const value = incoming[key];
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
};

/** Write-path input. Like the persisted overrides, but each log extraction field also accepts `null` to delete it. */
export type GlobalStateOverridesInput = Omit<EntityStoreGlobalStateOverrides, 'logsExtraction'> & {
  logsExtraction?: LogExtractionOverride;
};

// takes existing config, strips legacy defaults (if exists) and merges with new overrides
const mergeOverrides = (
  raw: EntityStoreGlobalStateOverrides,
  overrides: GlobalStateOverridesInput
): EntityStoreGlobalStateOverrides =>
  EntityStoreGlobalStateOverrides.parse({
    defaultsVersion: 'latest',
    historySnapshot: {
      ...HistorySnapshotState.parse(raw.historySnapshot ?? {}),
      ...overrides.historySnapshot,
    },
    logsExtraction: applyLogExtractionOverrides(
      getLogsExtractionOverrides(raw),
      overrides.logsExtraction
    ),
  });

// Read path: stored attributes in, full config out (missing fields get the current defaults).
const getWithLatestDefaults = (state: EntityStoreGlobalStateOverrides): EntityStoreGlobalState =>
  EntityStoreGlobalState.parse({
    historySnapshot: HistorySnapshotState.parse(state.historySnapshot ?? {}),
    logsExtraction: LogExtractionConfig.parse(getLogsExtractionOverrides(state)),
  });

export class EntityStoreGlobalStateClient {
  constructor(
    private readonly soClient: SavedObjectsClientContract,
    private readonly namespace: string,
    private readonly logger: Logger
  ) {}

  async find(): Promise<EntityStoreGlobalState | undefined> {
    const raw = await this.findRaw();
    return raw === undefined ? undefined : getWithLatestDefaults(raw.attributes);
  }

  async findOrThrow(): Promise<EntityStoreGlobalState> {
    const response = await this.find();
    if (response === undefined) {
      throw SavedObjectsErrorHelpers.createGenericNotFoundError(
        'No global state found for this namespace'
      );
    }
    return response;
  }

  /** Store-wide log extraction overrides without the code defaults applied. The layered merge needs this sparse view, not `find()`. */
  async findLogExtractionOverrides(): Promise<Partial<LogExtractionConfig>> {
    const raw = await this.findRaw();
    return raw === undefined ? {} : getLogsExtractionOverrides(raw.attributes);
  }

  async init(initialState?: GlobalStateOverridesInput): Promise<EntityStoreGlobalState> {
    const raw = await this.findRaw();
    if (raw !== undefined) {
      return this.update(initialState ?? {});
    }

    const id = this.getSavedObjectId();
    this.logger.debug(`Creating global state with id ${id}`);

    const { attributes } = await this.soClient.create<EntityStoreGlobalStateOverrides>(
      EntityStoreGlobalStateTypeName,
      EntityStoreGlobalStateOverrides.parse({
        ...initialState,
        logsExtraction: applyLogExtractionOverrides({}, initialState?.logsExtraction),
        defaultsVersion: 'latest',
      }),
      { id }
    );

    return getWithLatestDefaults(attributes);
  }

  async update(
    overrides: GlobalStateOverridesInput,
    retryOpts?: RetryOnConflictOptions
  ): Promise<EntityStoreGlobalState> {
    // retries on version conflict, so concurrent writers
    // (e.g. the history snapshot task vs a config update) cannot overwrite each other
    return retryOnConflict(async () => {
      const raw = await this.findRaw();
      if (raw === undefined) {
        throw SavedObjectsErrorHelpers.createGenericNotFoundError(
          'No global state found for this namespace'
        );
      }
      return this.replace(mergeOverrides(raw.attributes, overrides), raw.version);
    }, retryOpts);
  }

  private async replace(
    overrides: EntityStoreGlobalStateOverrides,
    version?: string
  ): Promise<EntityStoreGlobalState> {
    const { attributes } = await this.soClient.update<EntityStoreGlobalStateOverrides>(
      EntityStoreGlobalStateTypeName,
      this.getSavedObjectId(),
      overrides,
      { refresh: 'wait_for', mergeAttributes: false, version }
    );

    return getWithLatestDefaults(attributes);
  }

  async delete(): Promise<void> {
    const response = await this.findSO();
    if (response.total === 0) {
      return;
    }

    try {
      const id = response.saved_objects[0].id;
      this.logger.debug(`Deleting global state with id ${id}`);
      await this.soClient.delete(EntityStoreGlobalStateTypeName, id);
    } catch (error) {
      if (Boom.isBoom(error, 404)) {
        return;
      }
      throw error;
    }
  }

  private getSavedObjectId(): string {
    return `${EntityStoreGlobalStateTypeName}-${this.namespace}`;
  }

  private async findRaw(): Promise<
    { attributes: EntityStoreGlobalStateOverrides; version?: string } | undefined
  > {
    const response = await this.findSO();
    if (response.total === 0) {
      return undefined;
    }

    const { attributes, version } = response.saved_objects[0];
    return { attributes, version };
  }

  private findSO(): Promise<SavedObjectsFindResponse<EntityStoreGlobalStateOverrides>> {
    return this.soClient.find<EntityStoreGlobalStateOverrides>({
      type: EntityStoreGlobalStateTypeName,
      namespaces: [this.namespace],
      perPage: 1,
    });
  }
}
