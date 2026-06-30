/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/logging';
import type { DocLinksServiceStart } from '@kbn/core-doc-links-server';
import type { NodeRoles } from '@kbn/core-node-server';
import type {
  ElasticsearchClient,
  ElasticsearchCapabilities,
} from '@kbn/core-elasticsearch-server';
import type {
  ISavedObjectTypeRegistry,
  ISavedObjectsSerializer,
} from '@kbn/core-saved-objects-server';
import type {
  SavedObjectsMigrationConfigType,
  MigrationResult,
  IDocumentMigrator,
} from '@kbn/core-saved-objects-base-server-internal';
import type { Histogram } from '@opentelemetry/api';
import { buildMigratorConfigs } from './utils';
import { migrateIndex } from './migrate_index';

export interface RunZeroDowntimeMigrationOpts {
  /** The current Kibana version */
  kibanaVersion: string;
  /** The Kibana system index prefix. e.g `.kibana` or `.kibana_task_manager` */
  kibanaIndexPrefix: string;
  /** The SO type registry to use for the migration */
  typeRegistry: ISavedObjectTypeRegistry;
  /** Logger to use for migration output */
  logger: Logger;
  /** The document migrator to use to convert the document */
  documentMigrator: IDocumentMigrator;
  /** The migration config to use for the migration */
  migrationConfig: SavedObjectsMigrationConfigType;
  /** docLinks contract to use to link to documentation */
  docLinks: DocLinksServiceStart;
  /** SO serializer to use for migration */
  serializer: ISavedObjectsSerializer;
  /** The client to use for communications with ES */
  elasticsearchClient: ElasticsearchClient;
  /** The node roles of the Kibana instance */
  nodeRoles: NodeRoles;
  /** Capabilities of the ES cluster we're using */
  esCapabilities: ElasticsearchCapabilities;
  /** The OTel Histogram metric to record the duration of each migrator */
  meter: Histogram;
}

export const runZeroDowntimeMigration = async (
  options: RunZeroDowntimeMigrationOpts
): Promise<MigrationResult[]> => {
  const migratorConfigs = buildMigratorConfigs({
    kibanaIndexPrefix: options.kibanaIndexPrefix,
    typeRegistry: options.typeRegistry,
  });

  return await Promise.all(
    migratorConfigs.map(async (migratorConfig) => {
      const startTime = performance.now();
      try {
        const result = await migrateIndex({
          ...options,
          ...migratorConfig,
        });
        const duration = performance.now() - startTime;
        options.meter.record(duration, {
          'kibana.saved_objects.migrations.migrator': migratorConfig.indexPrefix,
        });
        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        options.meter.record(duration, {
          'kibana.saved_objects.migrations.migrator': migratorConfig.indexPrefix,
          'error.type': error.message, // Ideally, we had codes for each error instead.
        });
        throw error;
      }
    })
  );
};
