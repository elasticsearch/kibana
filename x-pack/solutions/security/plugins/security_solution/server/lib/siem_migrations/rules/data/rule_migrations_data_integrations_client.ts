/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import type { PackageList, PackageListItem } from '@kbn/fleet-plugin/common';
import {
  estimateTokens,
  truncateTokens,
} from '@kbn/agent-builder-genai-utils/tools/utils/token_count';
import type { RuleMigrationIntegration } from '../types';
import { SiemMigrationsDataBaseClient } from '../../common/data/siem_migrations_data_base_client';

const INTEGRATION_WEIGHTS = [
  // These integrations should be boosted because in many cases they are used as fallback.
  { ids: ['endpoint'], weight: 10 },
  { ids: ['network_traffic'], weight: 10 },
];

const PATH_PATTERNS_TO_INCLUDE_IN_KB = ['sample_event', 'knowledge_base'];
const MAX_KB_TOKENS = 80_000;

/**
 * excludes Splunk, QRadar and Elastic Security integrations since automatic migrations
 * intends to work with customers actual data instead of data improted from vendors
 * for which artifacts are being migrated
 *
 * */
const EXCLUDED_INTEGRATIONS = [
  'splunk',
  'elastic_security',
  'ibm_qradar',
  'microsoft_sentinel',
  'sentinel_one',
  'sentinel_one_cloud_funnel',
];

/* The minimum score required for a integration to be considered correct, might need to change this later */
const MIN_SCORE = 7 as const;
/* The number of integrations the RAG will return, sorted by score */
const RETURNED_INTEGRATIONS = 5 as const;
const PACKAGE_METADATA_CONCURRENCY = 30 as const;

export class RuleMigrationsDataIntegrationsClient extends SiemMigrationsDataBaseClient {
  /** Returns the Security integration packages that have "logs" type `data_streams` configured, including pre-release packages */
  public async getSecurityLogsPackages(): Promise<PackageList | undefined> {
    const packages = await this.dependencies.packageService?.asInternalUser.getPackages({
      prerelease: true,
      category: 'security',
    });
    return packages?.filter((pkg) => pkg.data_streams?.some(({ type }) => type === 'logs'));
  }

  private async processIntegration(pkg: PackageListItem): Promise<RuleMigrationIntegration | null> {
    const logsDataStreams = pkg.data_streams?.filter(({ type }) => type === 'logs');
    if (!logsDataStreams?.length) {
      return null;
    }

    let fieldsMetadata: Record<string, Record<string, unknown>> | undefined;
    try {
      if (this.dependencies.packageService) {
        fieldsMetadata =
          await this.dependencies.packageService.asInternalUser.getPackageFieldsMetadata({
            packageName: pkg.name,
          });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch fields metadata for package ${pkg.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const packageKnowledgeBase = await this.fetchPackageKnowledgeBase(pkg);

    return {
      title: pkg.title,
      id: pkg.name,
      description: pkg?.description || '',
      knowledge_base: packageKnowledgeBase,
      data_streams: logsDataStreams.map((stream) => ({
        dataset: stream.dataset,
        index_pattern: `${stream.type}-${stream.dataset}-*`,
        title: stream.title,
      })),
      elser_embedding: [
        pkg.title,
        pkg.description,
        ...logsDataStreams.map((stream) => stream.title),
        packageKnowledgeBase,
      ].join(' - '),
      fields_metadata: fieldsMetadata,
    };
  }

  private async fetchPackageKnowledgeBase(pkg: PackageListItem): Promise<string> {
    let packageKnowledgeBase = '';

    try {
      const packageArchive = await this.dependencies.packageService?.asInternalUser.getPackage(
        pkg.name,
        pkg.version
      );

      const allPaths = await packageArchive?.archiveIterator?.getPaths();
      const relevantPaths = allPaths?.filter((path) =>
        PATH_PATTERNS_TO_INCLUDE_IN_KB.some((includedPath) => path.includes(includedPath))
      );

      let currentTokens = 0;
      await packageArchive?.archiveIterator?.traverseEntries(
        async (entry) => {
          if (!entry.buffer || !relevantPaths?.includes(entry.path)) {
            return;
          }
          if (currentTokens >= MAX_KB_TOKENS) {
            return;
          }
          const content = entry.buffer.toString('utf8');
          const nextChunk = `\n Source : ${entry.path}\n${content}`;
          const chunkTokens = estimateTokens(nextChunk);
          const remainingBudget = MAX_KB_TOKENS - currentTokens;

          if (chunkTokens > remainingBudget) {
            packageKnowledgeBase += `\n Source : ${entry.path}\n${truncateTokens(
              content,
              remainingBudget
            )}`;
            currentTokens = MAX_KB_TOKENS;
            this.logger.debug(
              `Truncated ${entry.path} for ${pkg.name}: token limit (${MAX_KB_TOKENS}) reached`
            );
          } else {
            packageKnowledgeBase += nextChunk;
            currentTokens += chunkTokens;
          }
        },
        (path) => relevantPaths?.includes(path) ?? false
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch package archive for ${pkg.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    return packageKnowledgeBase;
  }

  /** Indexes an array of integrations to be used with ELSER semantic search queries */
  public async populate(): Promise<void> {
    const index = await this.getIndexName();
    const packages = await this.getSecurityLogsPackages();
    if (packages) {
      const ragIntegrations = await pMap(packages, (pkg) => this.processIntegration(pkg), {
        concurrency: PACKAGE_METADATA_CONCURRENCY,
      });

      const validIntegrations = ragIntegrations.filter(
        (integration): integration is RuleMigrationIntegration => integration !== null
      );

      if (validIntegrations.length === 0) {
        this.logger.debug('No security integrations with logs data streams found to index');
        return;
      }

      await this.esClient
        .bulk(
          {
            refresh: 'wait_for',
            operations: validIntegrations.flatMap(({ id, ...doc }) => [
              { update: { _index: index, _id: id } },
              { doc, doc_as_upsert: true },
            ]),
          },
          { requestTimeout: 10 * 60 * 1000 } // 10 minutes
        )
        .then((response) => {
          if (response.errors) {
            // use the first error to throw
            const reason = response.items.find((item) => item.update?.error)?.update?.error?.reason;
            throw new Error(reason ?? 'Unknown error');
          }
        })
        .catch((error) => {
          this.logger.error(`Error indexing integrations embeddings: ${error.message}`);
          throw error;
        });
    } else {
      this.logger.warn('Package service not available, not able not populate integrations index');
    }
  }

  /** Retrieves the integration details for a given semantic query */
  public async semanticSearch(semanticQuery: string): Promise<RuleMigrationIntegration[]> {
    const index = await this.getIndexName();
    const query = {
      function_score: {
        query: {
          bool: {
            must: { semantic: { query: semanticQuery, field: 'elser_embedding' } },
            must_not: { ids: { values: EXCLUDED_INTEGRATIONS } },
            filter: { exists: { field: 'data_streams' } },
          },
        },
        functions: INTEGRATION_WEIGHTS.map(({ ids, weight }) => ({
          filter: { ids: { values: ids } },
          weight,
        })),
        score_mode: 'multiply' as const,
        boost_mode: 'multiply' as const,
      },
    };

    const results = await this.esClient
      .search<RuleMigrationIntegration>({
        index,
        query,
        size: RETURNED_INTEGRATIONS,
        min_score: MIN_SCORE,
      })
      .then(this.processResponseHits.bind(this))
      .catch((error) => {
        this.logger.error(`Error querying integration details for ELSER: ${error.message}`);
        throw error;
      });

    return results;
  }
}
