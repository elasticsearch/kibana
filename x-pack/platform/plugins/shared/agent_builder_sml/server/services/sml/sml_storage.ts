/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { isResponseError } from '@kbn/es-errors';

/** The Elastic AI index. Kibana owns its creation; Elasticsearch owns its mappings. */
export const smlIndexName = '.ai-index-idx-elastic-index';

/**
 * Elasticsearch-managed index template that owns the SML data index mappings (`ai-index@mappings`
 * plus `ai-index-managed@mappings`). SML has no template of its own.
 */
const smlIndexTemplateName = 'ai-index-idx-managed';

/**
 * Records in the index's own `_meta` which template version its mappings came from, so a
 * template bump can be detected without diffing mappings Elasticsearch has already normalized.
 */
const templateVersionMetaKey = 'ai_index_template_version';

/**
 * Plain description of what this index holds. Shared by the Context Engine AI index registration
 * and the Agent Builder system prompt, so the two cannot drift apart.
 */
export const smlAiIndexDescription =
  'Kibana resources available for use in Agent Builder, including dashboards, visualizations, ' +
  'connectors, workflows, alerting rules, action policies, and significant events.';

const isAlreadyExists = (error: unknown): boolean =>
  isResponseError(error) &&
  error.statusCode === 400 &&
  (error.body as { error?: { type?: string } } | undefined)?.error?.type ===
    'resource_already_exists_exception';

/** Version of the Elasticsearch-managed template, `undefined` when it is not installed. */
const getTemplateVersion = async (esClient: ElasticsearchClient): Promise<number | undefined> => {
  try {
    const { index_templates: templates } = await esClient.indices.getIndexTemplate({
      name: smlIndexTemplateName,
    });
    return templates[0]?.index_template.version;
  } catch (error) {
    if (isResponseError(error) && error.statusCode === 404) return undefined;
    throw error;
  }
};

/** Template version the live mappings were built from, `undefined` when never stamped. */
const getAppliedTemplateVersion = async (
  esClient: ElasticsearchClient
): Promise<number | undefined> => {
  const response = await esClient.indices.getMapping({ index: smlIndexName });
  const meta = response[smlIndexName]?.mappings._meta as Record<string, unknown> | undefined;
  const version = meta?.[templateVersionMetaKey];
  return typeof version === 'number' ? version : undefined;
};

/** Creates the index bare — `smlIndexTemplateName` supplies the mappings. */
const createIndex = async ({
  esClient,
  logger,
  templateVersion,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
  templateVersion: number | undefined;
}): Promise<void> => {
  logger.info(`SML storage: creating index '${smlIndexName}'`);

  try {
    await esClient.indices.create({ index: smlIndexName });
  } catch (error) {
    // Another Kibana node won the race; the version stamp below still applies.
    if (!isAlreadyExists(error)) throw error;
  }

  await esClient.indices.putMapping({
    index: smlIndexName,
    _meta: { [templateVersionMetaKey]: templateVersion },
  });
};

const applyTemplateMappings = async ({
  esClient,
  templateVersion,
}: {
  esClient: ElasticsearchClient;
  templateVersion: number | undefined;
}): Promise<void> => {
  const { template } = await esClient.indices.simulateIndexTemplate({ name: smlIndexName });

  // Only the two keys the AI index components actually set; not every `MappingTypeMapping` key
  // is valid on put_mapping.
  await esClient.indices.putMapping({
    index: smlIndexName,
    dynamic: template?.mappings?.dynamic,
    properties: template?.mappings?.properties,
    _meta: { [templateVersionMetaKey]: templateVersion },
  });
};

/**
 * Create the SML data index when missing, and bring its mappings in line with the
 * Elasticsearch-managed template.
 *
 * Elasticsearch applies templates at index creation only, so a template version bump has to be
 * pushed onto the live index. A rejected push is logged and left alone rather than resolved by
 * dropping the index: crawled entries would be rebuilt, but `ingestion_method: 'manual'` entries
 * are user-curated and unrecoverable.
 */
export const reconcileSmlIndex = async ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<void> => {
  const templateVersion = await getTemplateVersion(esClient);

  if (!(await esClient.indices.exists({ index: smlIndexName }))) {
    await createIndex({ esClient, logger, templateVersion });
    return;
  }

  const appliedVersion = await getAppliedTemplateVersion(esClient);
  if (appliedVersion === templateVersion) return;

  logger.info(
    `SML storage: index '${smlIndexName}' carries template version ${
      appliedVersion ?? 'unknown'
    } — applying version ${templateVersion ?? 'unknown'}`
  );

  try {
    await applyTemplateMappings({ esClient, templateVersion });
  } catch (error) {
    if (!isResponseError(error)) throw error;

    // Deliberately not stamped, so this retries on the next crawl tick.
    logger.error(
      `SML storage: could not apply template version ${templateVersion ?? 'unknown'} to ` +
        `'${smlIndexName}' (${error.statusCode} ${
          (error.body as { error?: { type?: string } })?.error?.type ?? error.message
        }) — it keeps its current mappings.`
    );
  }
};
