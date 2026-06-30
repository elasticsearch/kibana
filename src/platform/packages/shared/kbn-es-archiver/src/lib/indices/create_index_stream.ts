/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Readable } from 'stream';
import { Transform } from 'stream';
import { inspect } from 'util';

import type { estypes } from '@elastic/elasticsearch';
import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';

import type { IndicesPutIndexTemplateRequest } from '@elastic/elasticsearch/lib/api/types';
import {
  MAIN_SAVED_OBJECT_INDEX,
  TASK_MANAGER_SAVED_OBJECT_INDEX,
} from '@kbn/core-saved-objects-server';
import type { Stats } from '../stats';
import {
  cleanSavedObjectIndices,
  deleteSavedObjectIndices,
  isSavedObjectIndex,
} from './kibana_index';
import { deleteIndex } from './delete_index';
import { deleteDataStream } from './delete_data_stream';
import { ES_CLIENT_HEADERS } from '../../client_headers';

interface DocRecord {
  value: estypes.IndicesIndexState & {
    index: string;
    type: string;
    data_stream?: string;
    template?: IndicesPutIndexTemplateRequest;
  };
}

export function createCreateIndexStream({
  client,
  stats,
  skipExisting = false,
  docsOnly = false,
  isArchiveInExceptionList = false,
  log,
  targetsWithoutIdGeneration = [],
}: {
  client: Client;
  stats: Stats;
  skipExisting?: boolean;
  docsOnly?: boolean;
  isArchiveInExceptionList?: boolean;
  log: ToolingLog;
  targetsWithoutIdGeneration?: string[];
}) {
  const skipDocsFromIndices = new Set();

  // If we're trying to import Kibana index docs, we need to ensure that
  // previous indices are removed so we're starting w/ a clean slate for
  // migrations. This only needs to be done once per archive load operation.
  let kibanaIndicesAlreadyDeleted = false;
  let kibanaTaskManagerIndexAlreadyDeleted = false;

  // if we detect saved object documents defined in the data.json, we will cleanup their indices
  let kibanaIndicesAlreadyCleaned = false;
  let kibanaTaskManagerIndexAlreadyCleaned = false;

  async function handleDoc(stream: Readable, record: DocRecord) {
    const { index, data_stream: dataStream } = record.value;

    // For data stream docs, the `index` field is the backing index
    // (e.g. `.ds-synthetics-browser-default-2022.12.27-000001`) while
    // `skipDocsFromIndices` stores the data stream name
    // (e.g. `synthetics-browser-default`). Check both so that
    // `skipExisting` correctly skips docs for existing data streams.
    if (skipDocsFromIndices.has(index) || (dataStream && skipDocsFromIndices.has(dataStream))) {
      return;
    }

    if (!skipExisting) {
      if (index?.startsWith(TASK_MANAGER_SAVED_OBJECT_INDEX)) {
        if (!kibanaTaskManagerIndexAlreadyDeleted && !kibanaTaskManagerIndexAlreadyCleaned) {
          await cleanSavedObjectIndices({ client, stats, log, index });
          kibanaTaskManagerIndexAlreadyCleaned = true;
          log.debug(`Cleaned saved object index [${index}]`);
        }
      } else if (index?.startsWith(MAIN_SAVED_OBJECT_INDEX)) {
        if (!kibanaIndicesAlreadyDeleted && !kibanaIndicesAlreadyCleaned) {
          await cleanSavedObjectIndices({ client, stats, log });
          kibanaIndicesAlreadyCleaned = kibanaTaskManagerIndexAlreadyCleaned = true;
          log.debug(`Cleaned all saved object indices`);
        }
      }
    }

    stream.push(record);
  }

  async function handleDataStream(record: DocRecord, attempts = 1) {
    if (docsOnly) return;

    const { data_stream: dataStream, template } = record.value as {
      data_stream: string;
      template: IndicesPutIndexTemplateRequest;
    };

    try {
      await client.indices.putIndexTemplate(template, {
        headers: ES_CLIENT_HEADERS,
      });

      await client.indices.createDataStream(
        { name: dataStream },
        {
          headers: ES_CLIENT_HEADERS,
        }
      );
      stats.createdDataStream(dataStream, template.name, { template });
      targetsWithoutIdGeneration.push(dataStream);
    } catch (err) {
      if (err?.meta?.body?.error?.type !== 'resource_already_exists_exception' || attempts >= 3) {
        throw err;
      }

      if (skipExisting) {
        skipDocsFromIndices.add(dataStream);
        stats.skippedIndex(dataStream);
        return;
      }

      await deleteDataStream(client, dataStream, template.name);
      stats.deletedDataStream(dataStream, template.name);
      await handleDataStream(record, attempts + 1);
    }
  }

  async function handleIndex(record: DocRecord) {
    const { index, settings, mappings, aliases } = record.value;
    const isKibanaTaskManager = index.startsWith(TASK_MANAGER_SAVED_OBJECT_INDEX);
    const isKibana = index.startsWith(MAIN_SAVED_OBJECT_INDEX) && !isKibanaTaskManager;

    if (docsOnly) {
      return;
    }

    if (isSavedObjectIndex(index) && !isArchiveInExceptionList) {
      throw new Error(
        `'esArchiver' no longer supports defining saved object indices, your archive is modifying '${index}'.
      The recommendation is to use 'kbnArchiver' to import saved objects in your tests.
      If you absolutely need to load some non-importable SOs, please stick to the official saved object indices created by Kibana at startup.
      You can achieve that by simply removing your saved object index definitions from 'mappings.json' (likely removing the file altogether).
      Find more information here: https://github.com/elastic/kibana/issues/161882`
      );
    }

    async function attemptToCreate(attemptNumber = 1) {
      try {
        if (isKibana && !kibanaIndicesAlreadyDeleted) {
          await deleteSavedObjectIndices({ client, stats, log }); // delete all .kibana* indices
          kibanaIndicesAlreadyDeleted = kibanaTaskManagerIndexAlreadyDeleted = true;
          log.debug(`Deleted all saved object indices`);
        } else if (isKibanaTaskManager && !kibanaTaskManagerIndexAlreadyDeleted) {
          await deleteSavedObjectIndices({ client, stats, onlyTaskManager: true, log }); // delete only .kibana_task_manager* indices
          kibanaTaskManagerIndexAlreadyDeleted = true;
          log.debug(`Deleted saved object index [${index}]`);
        }

        // create the index without the aliases.
        // Use a generous requestTimeout: archives with large mappings (e.g. auditbeat_single
        // has >7 000 lines) can take >30 s to create on loaded CI machines, exceeding the
        // default 30 s ES client timeout and causing unretriable "before all" hook failures.
        // See: https://github.com/elastic/kibana/issues/262814
        await client.indices.create(
          {
            index,
            settings,
            mappings,
          },
          {
            headers: ES_CLIENT_HEADERS,
            requestTimeout: 120_000,
          }
        );

        // create the aliases on a separate step (see https://github.com/elastic/kibana/issues/158918)
        const actions: estypes.IndicesUpdateAliasesAction[] = Object.keys(aliases ?? {}).map(
          (alias) => ({
            add: {
              index,
              alias,
              ...aliases![alias],
            },
          })
        );

        if (actions.length) {
          await client.indices.updateAliases({ actions });
        }

        stats.createdIndex(index, { settings });
        if (settings?.index?.mode === 'time_series') {
          targetsWithoutIdGeneration.push(index);
        }
      } catch (err) {
        if (
          err?.body?.error?.reason?.includes('index exists with the same name as the alias') &&
          attemptNumber < 3
        ) {
          kibanaTaskManagerIndexAlreadyDeleted = false;
          if (isKibana) {
            kibanaIndicesAlreadyDeleted = false;
          }

          const aliasStr = inspect(aliases);
          log.info(
            `failed to create aliases [${aliasStr}] because ES indicated an index/alias already exists, trying again`
          );
          await attemptToCreate(attemptNumber + 1);
          return;
        }

        if (
          err?.meta?.body?.error?.type !== 'resource_already_exists_exception' ||
          attemptNumber >= 3
        ) {
          throw err;
        }

        if (skipExisting) {
          skipDocsFromIndices.add(index);
          stats.skippedIndex(index);
          return;
        }

        await deleteIndex({ client, stats, index, log });
        await attemptToCreate(attemptNumber + 1);
        return;
      }
    }

    await attemptToCreate();
  }

  return new Transform({
    readableObjectMode: true,
    writableObjectMode: true,
    async transform(record, enc, callback) {
      try {
        switch (record && record.type) {
          case 'index':
            await handleIndex(record);
            break;

          case 'data_stream':
            await handleDataStream(record);
            break;

          case 'doc':
            await handleDoc(this, record);
            break;

          default:
            this.push(record);
            break;
        }

        callback();
      } catch (err) {
        callback(err);
      }
    },
  });
}
