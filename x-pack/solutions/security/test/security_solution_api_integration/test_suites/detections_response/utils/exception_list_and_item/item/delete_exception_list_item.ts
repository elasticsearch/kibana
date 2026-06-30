/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type SuperTest from 'supertest';
import { EXCEPTION_LIST_ITEM_URL } from '@kbn/securitysolution-list-constants';

/**
 * Helper to cut down on the noise in some of the tests. Does a delete of an exception list item.
 * It does check for a 200 response, but continues execution regardless.
 * @param supertest The supertest deps
 * @param itemId The exception item's item_id to delete
 * @param log The tooling logger
 */
export const deleteExceptionListItem = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  itemId: string
): Promise<unknown> => {
  const response = await supertest
    .delete(`${EXCEPTION_LIST_ITEM_URL}?item_id=${itemId}`)
    .set('kbn-xsrf', 'true');
  if (response.status !== 200) {
    log.error(
      `Did not get an expected 200 "ok" when deleting an exception item (deleteExceptionListItem). CI issues could happen. Suspect this line if you are seeing CI issues. body: ${JSON.stringify(
        response.body
      )}, status: ${JSON.stringify(response.status)}`
    );
  }

  return response.body;
};
