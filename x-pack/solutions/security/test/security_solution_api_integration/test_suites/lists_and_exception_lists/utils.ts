/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type SuperTest from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import limit from 'p-limit';

import type {
  Type,
  ListSchema,
  ListItemSchema,
  ExceptionListSchema,
  ExceptionListItemSchema,
  ExceptionList,
  NamespaceType,
} from '@kbn/securitysolution-io-ts-list-types';
import {
  EXCEPTION_LIST_URL,
  LIST_INDEX,
  LIST_ITEM_URL,
} from '@kbn/securitysolution-list-constants';
import {
  setPolicy,
  setTemplate,
  setIndexTemplate,
  createBootstrapIndex,
} from '@kbn/securitysolution-es-utils';
import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { getImportListItemAsBuffer } from '@kbn/lists-plugin/common/schemas/request/import_list_item_schema.mock';
import { encodeHitVersion } from '@kbn/securitysolution-es-utils';
import { countDownTest, withSpaceUrl } from '@kbn/detections-response-ftr-services';

/**
 * Creates the lists and lists items index for use inside of beforeEach blocks of tests
 * This will retry 50 times before giving up and hopefully still not interfere with other tests
 * @param supertest The supertest client library
 */
export const createListsIndex = async (
  supertest: SuperTest.Agent,
  log: ToolingLog
): Promise<void> => {
  return countDownTest(
    async () => {
      await supertest.post(LIST_INDEX).set('kbn-xsrf', 'true').send();
      return {
        passed: true,
      };
    },
    'createListsIndex',
    log
  );
};

/**
 * Deletes the lists index for use inside of afterEach blocks of tests
 * @param supertest The supertest client library
 */
export const deleteListsIndex = async (
  supertest: SuperTest.Agent,
  log: ToolingLog
): Promise<void> => {
  return countDownTest(
    async () => {
      await supertest.delete(LIST_INDEX).set('kbn-xsrf', 'true').send();
      return {
        passed: true,
      };
    },
    'deleteListsIndex',
    log
  );
};

/**
 * Creates the exception lists and lists items index for use inside of beforeEach blocks of tests
 * This will retry 50 times before giving up and hopefully still not interfere with other tests
 * @param supertest The supertest client library
 */
export const createExceptionListsIndex = async (
  supertest: SuperTest.Agent,
  log: ToolingLog
): Promise<void> => {
  return countDownTest(
    async () => {
      await supertest.post(LIST_INDEX).set('kbn-xsrf', 'true').send();
      return {
        passed: true,
      };
    },
    'createListsIndex',
    log
  );
};

/**
 * This will remove server generated properties such as date times, etc...
 * @param list List to pass in to remove typical server generated properties
 */
export const removeListServerGeneratedProperties = (
  list: Partial<ListSchema>
): Partial<ListSchema> => {
  const { created_at, updated_at, id, tie_breaker_id, _version, '@timestamp': _t, ...props } = list;
  return props;
};

/**
 * This will remove server generated properties such as date times, etc...
 * @param list List to pass in to remove typical server generated properties
 */
export const removeListItemServerGeneratedProperties = (
  list: Partial<ListItemSchema>
): Partial<ListItemSchema> => {
  const { created_at, updated_at, id, tie_breaker_id, _version, '@timestamp': _t, ...props } = list;
  return props;
};

/**
 * This will remove server generated properties such as date times, etc...
 * @param list List to pass in to remove typical server generated properties
 */
export const removeExceptionListItemServerGeneratedProperties = (
  list: Partial<ExceptionListItemSchema>
): Partial<ExceptionListItemSchema> => {
  const { created_at, updated_at, id, tie_breaker_id, _version, ...removedProperties } = list;
  return removedProperties;
};

/**
 * This will remove server generated properties such as date times, etc...
 * @param list List to pass in to remove typical server generated properties
 */
export const removeExceptionListServerGeneratedProperties = (
  list: Partial<ExceptionListSchema>
): Partial<ExceptionListSchema> => {
  const { created_at, updated_at, id, tie_breaker_id, _version, ...removedProperties } = list;
  return removedProperties;
};

// Similar to ReactJs's waitFor from here: https://testing-library.com/docs/dom-testing-library/api-async#waitfor
export const waitFor = async (
  functionToTest: () => Promise<boolean>,
  functionName: string,
  log: ToolingLog,
  maxTimeout: number = 800000,
  timeoutWait: number = 250
) => {
  await new Promise<void>(async (resolve, reject) => {
    try {
      let found = false;
      let numberOfTries = 0;
      const maxTries = Math.floor(maxTimeout / timeoutWait);

      while (!found && numberOfTries < maxTries) {
        const itPasses = await functionToTest();

        if (itPasses) {
          found = true;
        } else {
          log.debug(`Try number ${numberOfTries} out of ${maxTries} for function ${functionName}`);
          numberOfTries++;
        }

        await new Promise((resolveTimeout) => setTimeout(resolveTimeout, timeoutWait));
      }

      if (found) {
        resolve();
      } else {
        reject(new Error(`timed out waiting for function ${functionName} condition to be true`));
      }
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Useful for export_api testing to convert from a multi-part binary back to a string
 * @param res Response
 * @param callback Callback
 */
export const binaryToString = (res: any, callback: any): void => {
  res.setEncoding('binary');
  res.data = '';
  res.on('data', (chunk: any) => {
    res.data += chunk;
  });
  res.on('end', () => {
    callback(null, Buffer.from(res.data));
  });
};

/**
 * Remove all exceptions from both the "single" and "agnostic" spaces.
 * This will retry 50 times before giving up and hopefully still not interfere with other tests
 * @param supertest The supertest handle
 */
export const deleteAllExceptions = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  spaceId?: string
): Promise<void> => {
  await deleteAllExceptionsByType(supertest, log, 'single', spaceId);
  await deleteAllExceptionsByType(supertest, log, 'agnostic', spaceId);
};

/**
 * Remove all exceptions by a given type such as "agnostic" or "single".
 * This will retry 50 times before giving up and hopefully still not interfere with other tests
 * @param supertest The supertest handle
 */
export const deleteAllExceptionsByType = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  type: NamespaceType,
  spaceId?: string
): Promise<void> => {
  await countDownTest(
    async () => {
      const { body } = await supertest
        .get(
          withSpaceUrl(`${EXCEPTION_LIST_URL}/_find?per_page=9999&namespace_type=${type}`, spaceId)
        )
        .set('kbn-xsrf', 'true')
        .send();
      const ids: string[] = body.data.map((exception: ExceptionList) => exception.id);
      const limiter = limit(10);
      const promises = ids.map((id) =>
        limiter(() =>
          supertest
            .delete(withSpaceUrl(`${EXCEPTION_LIST_URL}?id=${id}&namespace_type=${type}`, spaceId))
            .set('kbn-xsrf', 'true')
            .send()
        )
      );
      await Promise.all(promises);
      const { body: finalCheck } = await supertest
        .get(withSpaceUrl(`${EXCEPTION_LIST_URL}/_find?namespace_type=${type}`, spaceId))
        .set('kbn-xsrf', 'true')
        .send();
      return {
        passed: finalCheck.data.length === 0,
      };
    },
    `deleteAllExceptions by type: "${type}"`,
    log,
    50,
    1000
  );
};

/**
 * Convenience function for quickly importing a given type and contents and then
 * waiting to ensure they're there before continuing
 * @param supertest The super test agent
 * @param type The type to import as
 * @param contents The contents of the import
 * @param fileName filename to import as
 * @param testValues Optional test values in case you're using CIDR or range based lists
 */
export const importFile = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  type: Type,
  contents: string[],
  fileName: string,
  testValues?: string[]
): Promise<void> => {
  const response = await supertest
    .post(`${LIST_ITEM_URL}/_import?type=${type}`)
    .set('kbn-xsrf', 'true')
    .attach('file', getImportListItemAsBuffer(contents), fileName)
    .expect('Content-Type', 'application/json; charset=utf-8');

  if (response.status !== 200) {
    log.error(
      `Did not get an expected 200 "ok" When importing a file (importFile). CI issues could happen. Suspect this line if you are seeing CI issues. body: ${JSON.stringify(
        response.body
      )}, status: ${JSON.stringify(response.status)}`
    );
  }

  // although we have pushed the list and its items, it is async so we
  // have to wait for the contents before continuing
  const testValuesOrContents = testValues ?? contents;
  await waitForListItems(supertest, log, testValuesOrContents, fileName);
};

/**
 * Convenience function for quickly importing a given type and contents and then
 * waiting to ensure they're there before continuing. This specifically checks tokens
 * from text file
 * @param supertest The super test agent
 * @param type The type to import as
 * @param contents The contents of the import
 * @param fileName filename to import as
 */
export const importTextFile = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  type: Type,
  contents: string[],
  fileName: string
): Promise<void> => {
  const response = await supertest
    .post(`${LIST_ITEM_URL}/_import?type=${type}`)
    .set('kbn-xsrf', 'true')
    .attach('file', getImportListItemAsBuffer(contents), fileName)
    .expect('Content-Type', 'application/json; charset=utf-8');

  if (response.status !== 200) {
    log.error(
      `Did not get an expected 200 "ok" when importing a text file (importTextFile). CI issues could happen. Suspect this line if you are seeing CI issues. body: ${JSON.stringify(
        response.body
      )}, status: ${JSON.stringify(response.status)}`
    );
  }

  // although we have pushed the list and its items, it is async so we
  // have to wait for the contents before continuing
  await waitForTextListItems(supertest, log, contents, fileName);
};

/**
 * Convenience function for waiting for a particular file uploaded
 * and a particular item value to be available before continuing.
 * @param supertest The super test agent
 * @param fileName The filename imported
 * @param itemValue The item value to wait for
 */
export const waitForListItem = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  itemValue: string,
  fileName: string
): Promise<void> => {
  await waitFor(
    async () => {
      const { status, body } = await supertest
        .get(`${LIST_ITEM_URL}?list_id=${fileName}&value=${itemValue}`)
        .send();

      if (status !== 200) {
        log.debug(
          `Did not get an expected 200 "ok" when waiting for a list item (waitForListItem) yet. Retrying until we get a 200 "ok". body: ${JSON.stringify(
            body
          )}, status: ${JSON.stringify(status)}`
        );
      }
      return status === 200;
    },
    `waitForListItem fileName: "${fileName}" itemValue: "${itemValue}"`,
    log
  );
};

/**
 * Convenience function for waiting for a particular file uploaded
 * and particular item values to be available before continuing.
 * @param supertest The super test agent
 * @param fileName The filename imported
 * @param itemValue The item value to wait for
 */
export const waitForListItems = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  itemValues: string[],
  fileName: string
): Promise<void> => {
  await Promise.all(itemValues.map((item) => waitForListItem(supertest, log, item, fileName)));
};

/**
 * Convenience function for waiting for a particular file uploaded
 * and a particular item value to be available before continuing.
 * @param supertest The super test agent
 * @param fileName The filename imported
 * @param itemValue The item value to wait for
 */
export const waitForTextListItem = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  itemValue: string,
  fileName: string
): Promise<void> => {
  const tokens = itemValue.split(' ');
  await waitFor(
    async () => {
      const promises = await Promise.all(
        tokens.map(async (token) => {
          const { status, body } = await supertest
            .get(`${LIST_ITEM_URL}?list_id=${fileName}&value=${token}`)
            .send();
          if (status !== 200) {
            log.error(
              `Did not get an expected 200 "ok" when waiting for a text list item (waitForTextListItem) yet. Retrying until we get a 200 "ok". body: ${JSON.stringify(
                body
              )}, status: ${JSON.stringify(status)}`
            );
          }
          return status === 200;
        })
      );
      return promises.every((one) => one);
    },
    `waitForTextListItem fileName: "${fileName}" itemValue: "${itemValue}"`,
    log
  );
};

/**
 * Convenience function for waiting for a particular file uploaded
 * and particular item values to be available before continuing. This works
 * specifically with text types and does tokenization to ensure all words are uploaded
 * @param supertest The super test agent
 * @param fileName The filename imported
 * @param itemValue The item value to wait for
 */
export const waitForTextListItems = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  itemValues: string[],
  fileName: string
): Promise<void> => {
  await Promise.all(itemValues.map((item) => waitForTextListItem(supertest, log, item, fileName)));
};

const testPolicy = {
  policy: {
    phases: {
      hot: {
        min_age: '0ms',
        actions: {
          rollover: {
            max_size: '50gb',
          },
        },
      },
    },
  },
};

const listsMappings = {
  dynamic: 'strict',
  properties: {
    name: {
      type: 'keyword',
    },
    description: {
      type: 'keyword',
    },
    type: {
      type: 'keyword',
    },
    tie_breaker_id: {
      type: 'keyword',
    },
    meta: {
      enabled: 'false',
      type: 'object',
    },
    created_at: {
      type: 'date',
    },
    updated_at: {
      type: 'date',
    },
    created_by: {
      type: 'keyword',
    },
    updated_by: {
      type: 'keyword',
    },
    version: {
      type: 'keyword',
    },
    immutable: {
      type: 'boolean',
    },
  },
};

const itemsMappings = {
  dynamic: 'strict',
  properties: {
    tie_breaker_id: {
      type: 'keyword',
    },
    list_id: {
      type: 'keyword',
    },
    meta: {
      enabled: 'false',
      type: 'object',
    },
    created_at: {
      type: 'date',
    },
    updated_at: {
      type: 'date',
    },
    created_by: {
      type: 'keyword',
    },
    updated_by: {
      type: 'keyword',
    },
    ip: {
      type: 'ip',
    },
    keyword: {
      type: 'keyword',
    },
  },
};

/**
 * Convenience function for creating legacy index templates to
 * test out logic updating to new index templates
 * @param es es client
 */
export const createLegacyListsIndices = async (es: Client) => {
  await setPolicy(es, '.lists-default', testPolicy);
  await setPolicy(es, '.items-default', testPolicy);
  await setTemplate(es, '.lists-default', {
    index_patterns: [`.lists-default-*`],
    mappings: listsMappings,
    settings: {
      index: {
        lifecycle: {
          name: '.lists-default',
          rollover_alias: '.lists-default',
        },
      },
    },
  });
  await setTemplate(es, '.items-default', {
    index_patterns: [`.items-default-*`],
    mappings: itemsMappings,
    settings: {
      index: {
        lifecycle: {
          name: '.items-default',
          rollover_alias: '.items-default',
        },
      },
    },
  });
  await createBootstrapIndex(es, '.lists-default');
  await createBootstrapIndex(es, '.items-default');
};

/**
 * Helper function to emulate reindexed lists/items from version 7 index to version 8
 * These indices has prefix .lists-v8-, .items-v8-, that hints they are v8 compatible after reindex
 * @param es es client
 */
export const createReindexedListsIndices = async (es: Client) => {
  await configurePolicyAndIndexTemplate(es);
  await createReindexedBootstrapIndex(es, 'lists-default');
  await createReindexedBootstrapIndex(es, 'items-default');
};

/**
 * Utility to create list indices, before they were migrated to data streams
 * @param es ES client
 */
export const createListsIndices = async (es: Client) => {
  await configurePolicyAndIndexTemplate(es);
  await createBootstrapIndex(es, '.lists-default');
  await createBootstrapIndex(es, '.items-default');
};

/**
 * utility to create list directly by using ES, bypassing all checks
 * useful, to create list in legacy indices
 */
export const createListBypassingChecks = async ({ es, id }: { es: Client; id: string }) => {
  const createdAt = new Date().toISOString();
  const document = {
    created_at: createdAt,
    created_by: 'mock-user',
    description: 'mock-description',
    name: 'mock-name',
    tie_breaker_id: uuidv4(),
    type: 'keyword',
    updated_at: createdAt,
    updated_by: 'mock-user',
    immutable: false,
    version: 1,
  };

  const response = await es.create({
    document,
    id,
    index: '.lists-default',
    refresh: 'wait_for',
  });

  return {
    _version: encodeHitVersion(response),
    id: response._id,
    ...document,
  };
};

/**
 * utility to create list item directly by using ES, bypassing all checks
 * useful, to create list item in legacy indices
 * supports keyword only
 */
export const createListItemBypassingChecks = async ({
  es,
  listId,
  id,
  value,
}: {
  es: Client;
  listId: string;
  id: string;
  value: string;
}) => {
  const createdAt = new Date().toISOString();
  const document = {
    created_at: createdAt,
    created_by: 'mock-user',
    tie_breaker_id: uuidv4(),
    updated_at: createdAt,
    updated_by: 'mock-user',
    list_id: listId,
    keyword: value,
  };

  const response = await es.create({
    document,
    id,
    index: '.items-default',
    refresh: 'wait_for',
  });

  return {
    _version: encodeHitVersion(response),
    id: response._id,
    ...document,
  };
};

/**
 * Creates policies and index templates for both the Lists and List Items indices.
 */
const configurePolicyAndIndexTemplate = async (es: Client) => {
  await setPolicy(es, '.lists-default', testPolicy);
  await setPolicy(es, '.items-default', testPolicy);
  await setIndexTemplate(es, '.lists-default', {
    index_patterns: [`.lists-default-*`],
    template: {
      mappings: listsMappings,
      settings: {
        index: {
          lifecycle: {
            name: '.lists-default',
            rollover_alias: '.lists-default',
          },
        },
        mapping: {
          total_fields: {
            limit: 10000,
          },
        },
      },
    },
  });
  await setIndexTemplate(es, '.items-default', {
    index_patterns: [`.items-default-*`],
    template: {
      mappings: itemsMappings,
      settings: {
        index: {
          lifecycle: {
            name: '.items-default',
            rollover_alias: '.items-default',
          },
        },
        mapping: {
          total_fields: {
            limit: 10000,
          },
        },
      },
    },
  });
};

/**
 * Emulates an index that was reindexed from 7.x to 8.x
 * 1. this index has  prefix .reindexed-v8-
 * 2. it has 2 aliases: index and name of origjnal index(usually bootstrap index with number in the end). For example: .items-another-4, .items-another-4-000001
 */
const createReindexedBootstrapIndex = async (esClient: Client, index: string): Promise<unknown> => {
  return (
    await esClient.indices.create(
      {
        index: `.reindexed-v8-${index}-000001`,
        aliases: {
          [`.${index}`]: {
            is_write_index: true,
          },
          [`.${index}-000001`]: {},
        },
      },
      { meta: true }
    )
  ).body;
};
