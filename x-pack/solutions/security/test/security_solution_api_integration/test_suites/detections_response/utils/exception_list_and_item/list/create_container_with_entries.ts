/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ToolingLog } from '@kbn/tooling-log';
import type SuperTest from 'supertest';
import type { CreateExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import type { ListArray, NonEmptyEntriesArray } from '@kbn/securitysolution-io-ts-list-types';

import { EXCEPTION_LIST_ITEM_URL } from '@kbn/securitysolution-list-constants';
import { waitFor } from '@kbn/detections-response-ftr-services';
import { createExceptionList } from './create_exception_list';
import { createExceptionListItem } from '../item/create_exception_list_item';

/**
 * Convenience testing function where you can pass in just the endpoint entries and you will
 * get a container created with the entries.
 * @param supertest super test agent
 * @param entries The entries to create the rule and exception list from
 * @param osTypes The os types to optionally add or not to add to the container
 */
export const createContainerWithEntries = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  entries: NonEmptyEntriesArray[]
): Promise<ListArray> => {
  // If not given any endpoint entries, return without any
  if (entries.length === 0) {
    return [];
  }
  // Namespace the list id per invocation so two containers created within one test don't collide.
  const uniqueListId = `some-list-id-${uuidv4()}`;
  // Create the rule exception list container
  const { id, list_id, namespace_type, type } = await createExceptionList(supertest, log, {
    description: 'some description',
    list_id: uniqueListId,
    name: 'some name',
    type: 'detection',
  });

  // Add the rule exception list container to the backend
  await Promise.all(
    entries.map((entry) => {
      const exceptionListItem: CreateExceptionListItemSchema = {
        description: 'some description',
        list_id: uniqueListId,
        name: 'some name',
        type: 'simple',
        entries: entry,
      };
      return createExceptionListItem(supertest, log, exceptionListItem);
    })
  );

  // To reduce the odds of in-determinism and/or bugs we ensure we have
  // the same length of entries before continuing.
  await waitFor(
    async () => {
      const { body } = await supertest.get(`${EXCEPTION_LIST_ITEM_URL}/_find?list_id=${list_id}`);
      return body.data.length === entries.length;
    },
    `within createContainerWithEntries ${EXCEPTION_LIST_ITEM_URL}/_find?list_id=${list_id}`,
    log
  );

  return [
    {
      id,
      list_id,
      namespace_type,
      type,
    },
  ];
};
