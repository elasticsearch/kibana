/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import type { BulkOperationContainer } from '@elastic/elasticsearch/lib/api/types';
import type { RuleMigrationLastExecution } from '../../../../../common/siem_migrations/model/rule_migration.gen';
import type { MigrationDocument, Stored } from '../types';
import { SiemMigrationsDataBaseClient } from './siem_migrations_data_base_client';
import { isNotFoundError } from '../api/util/is_not_found_error';
import { MAX_ES_SEARCH_SIZE } from './constants';
import { dsl } from './dsl_queries';
import { MIGRATION_ID_NOT_FOUND } from '../translations';

export class SiemMigrationsDataMigrationClient<
  M extends MigrationDocument = MigrationDocument
> extends SiemMigrationsDataBaseClient {
  async create(name: string): Promise<string> {
    const migrationId = uuidV4();
    const index = await this.getIndexName();
    const profileUid = await this.getProfileUid();
    const createdAt = new Date().toISOString();

    await this.esClient
      .create({
        refresh: 'wait_for',
        id: migrationId,
        index,
        document: { name, created_by: profileUid, created_at: createdAt },
      })
      .catch((error) => {
        this.logger.error(`Error creating migration ${migrationId}: ${error}`);
        throw error;
      });

    return migrationId;
  }

  /**
   *
   * Gets the migration document by id or returns undefined if it does not exist.
   *
   * Migrations owned by another user are reported as non-existent so their existence is not disclosed.
   *
   * */
  async get(migrationId: string): Promise<Stored<M> | undefined> {
    const storedMigration = await this.fetch(migrationId);
    if (!storedMigration) {
      return undefined;
    }

    const isOwner = await this.isOwnedByCurrentUser(storedMigration.created_by);
    return isOwner ? storedMigration : undefined;
  }

  /** Gets the migration document by id without checking ownership, for internal bookkeeping only. */
  private async fetch(migrationId: string): Promise<Stored<M> | undefined> {
    const index = await this.getIndexName();
    return this.esClient
      .get<Stored<M>>({ index, id: migrationId })
      .then(this.processHit)
      .catch((error) => {
        if (isNotFoundError(error)) {
          return undefined;
        }
        this.logger.error(`Error getting migration ${migrationId}: ${error}`);
        throw error;
      });
  }

  /**
   * Gets all the migrations owned by the current user.
   */
  async getAll(): Promise<Stored<M>[]> {
    const index = await this.getIndexName();
    const ownerIds = await this.getOwnerIds();
    return this.esClient
      .search<Stored<M>>({
        index,
        size: MAX_ES_SEARCH_SIZE, // Adjust size as needed
        query: dsl.isOwnedBy(ownerIds),
        _source: true,
      })
      .then((result) => this.processResponseHits(result))
      .catch((error) => {
        this.logger.error(`Error getting all migrations:- ${error}`);
        throw error;
      });
  }

  /**
   *
   * Prepares bulk ES delete operation for a migration document based on its id.
   *
   */
  async prepareDelete(migrationId: string): Promise<BulkOperationContainer[]> {
    const index = await this.getIndexName();
    const migrationDeleteOperation = {
      delete: { _index: index, _id: migrationId },
    };
    return [migrationDeleteOperation];
  }

  /**
   * Saves a migration as started, updating the last execution parameters with the current timestamp.
   */
  async saveAsStarted({
    id,
    connectorId,
  }: { id: string; connectorId: string } & Record<string, unknown>): Promise<void> {
    await this.updateLastExecution(id, {
      started_at: new Date().toISOString(),
      connector_id: connectorId,
      is_stopped: false,
      error: null,
      finished_at: null,
    });
  }

  /**
   * Saves a migration as ended, updating the last execution parameters with the current timestamp.
   */
  async saveAsFinished({ id, error }: { id: string; error?: string }): Promise<void> {
    const currentMigrationDoc = await this.fetch(id);
    if (!currentMigrationDoc) {
      throw new Error(MIGRATION_ID_NOT_FOUND(id));
    }

    const finishedAt = new Date();
    let latestExecutionTimeMs = 0;

    // ideally started_at should always be defined here, but if it is not, we do not want to throw an error
    if (currentMigrationDoc.last_execution?.started_at) {
      latestExecutionTimeMs =
        finishedAt.getTime() - new Date(currentMigrationDoc.last_execution.started_at).getTime();
    }

    const currentExecutionTime = currentMigrationDoc?.last_execution?.total_execution_time_ms ?? 0;

    await this.updateLastExecution(id, {
      finished_at: finishedAt.toISOString(),
      total_execution_time_ms: currentExecutionTime + latestExecutionTimeMs,
      error,
    });
  }

  /**
   * Saves a migration as failed, updating the last execution parameters with the provided error message.
   */
  async saveAsFailed({ id, error }: { id: string; error: string }): Promise<void> {
    await this.saveAsFinished({ id, error });
  }

  /**
   * Sets `is_stopped` flag for migration document.
   * It does not update `finished_at` timestamp, `saveAsFinished` or `saveAsFailed` should be called separately.
   */
  async setIsStopped({ id }: { id: string }): Promise<void> {
    await this.updateLastExecution(id, { is_stopped: true });
  }

  /**
   * Updates the last execution parameters for a migration document.
   */
  protected async updateLastExecution(
    id: string,
    lastExecutionParams: RuleMigrationLastExecution
  ): Promise<void> {
    const index = await this.getIndexName();
    const doc = { last_execution: lastExecutionParams };
    await this.esClient
      .update({ index, id, refresh: 'wait_for', doc, retry_on_conflict: 1 })
      .catch((error) => {
        this.logger.error(`Error updating last execution for migration ${id}: ${error}`);
        throw error;
      });
  }

  /**
   * Updates the migration document with the provided values.
   */
  async update(id: string, doc: Partial<Stored<M>>): Promise<void> {
    const index = await this.getIndexName();
    await this.esClient
      .update({ index, id, doc, refresh: 'wait_for', retry_on_conflict: 1 })
      .catch((error) => {
        this.logger.error(`Error updating migration: ${error}`);
        throw error;
      });
  }
}
