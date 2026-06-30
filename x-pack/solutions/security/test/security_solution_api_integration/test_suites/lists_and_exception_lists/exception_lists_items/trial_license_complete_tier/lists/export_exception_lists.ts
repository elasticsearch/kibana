/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import type SuperTest from 'supertest';
import type { ToolingLog } from '@kbn/tooling-log';
import { EXCEPTION_LIST_URL, EXCEPTION_LIST_ITEM_URL } from '@kbn/securitysolution-list-constants';
import { ITEM_TYPE, DETECTION_TYPE } from '@kbn/lists-plugin/common/constants.mock';

import { getCreateExceptionListMinimalSchemaMock } from '@kbn/lists-plugin/common/schemas/request/create_exception_list_schema.mock';
import { getCreateExceptionListItemMinimalSchemaMock } from '@kbn/lists-plugin/common/schemas/request/create_exception_list_item_schema.mock';
import { binaryToString, deleteAllExceptions } from '../../../utils';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';
import {
  createExceptionList,
  createExceptionListItem,
  deleteExceptionList,
  deleteExceptionListItem,
} from '../../../../detections_response/utils';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const log = getService('log');

  describe('@serverless @ess Exceptions API - Exporting Exception Lists', () => {
    before(async () => {
      await deleteAllExceptions(supertest, log);

      // create three lists, each with two items
      await bulkCreateExceptionLists(supertest, log, {
        listCount: 3,
        itemCount: 2,
      });
    });

    after(async () => {
      await deleteAllExceptions(supertest, log);
    });

    it('returns the correct content type header', async () => {
      await supertest
        .post(`${EXCEPTION_LIST_URL}/_bulk_export`)
        .set('kbn-xsrf', 'true')
        .expect('Content-Type', 'application/ndjson')
        .expect(200);
    });

    it('returns a 400 error if the query is malformed', async () => {
      const { body } = await supertest
        .post(`${EXCEPTION_LIST_URL}/_bulk_export`)
        .set('kbn-xsrf', 'true')
        .query({ include_expired_exceptions: 'not-a-boolean' })
        .expect(400);

      expect(body).toEqual(
        expect.objectContaining({
          error: 'Bad Request',
          message: expect.stringContaining('include_expired_exceptions'),
        })
      );
    });

    it('returns a 200 with an empty summary if the filter matches no lists', async () => {
      const { body } = await supertest
        .post(
          `${EXCEPTION_LIST_URL}/_bulk_export?filter=exception-list.attributes.list_id:non-existent-list-id`
        )
        .set('kbn-xsrf', 'true')
        .expect(200)
        .parse(binaryToString);

      const exportedRows = parseRows(body);

      expect(exportedRows).toEqual([
        { exported_exception_list_count: 0, exported_exception_list_item_count: 0 },
      ]);
    });

    it('returns a partial response if the filter matches some items', async () => {
      const { body } = await supertest
        .post(`${EXCEPTION_LIST_URL}/_bulk_export?filter=exception-list.attributes.list_id:list-0`)
        .set('kbn-xsrf', 'true')
        .expect(200)
        .parse(binaryToString);

      const exportedRows: Array<{ type: string; list_id: string }> = parseRows(body);
      const exportedLists = exportedRows.filter((row) => row?.type === DETECTION_TYPE);
      const exportedItems = exportedRows.filter((row) => row?.type === ITEM_TYPE);

      expect(exportedLists).toHaveLength(1); // 1 list matching the filter
      expect(exportedItems).toHaveLength(2); // 2 items matching the list
      expect(exportedRows.map((row) => row.list_id)).toEqual(
        expect.arrayContaining(['list-0', 'list-0', 'list-0'])
      );
    });

    it('returns a partial response if the filter excludes some items', async () => {
      const { body } = await supertest
        .post(
          `${EXCEPTION_LIST_URL}/_bulk_export?filter=NOT exception-list.attributes.list_id:list-1`
        )
        .set('kbn-xsrf', 'true')
        .expect(200)
        .parse(binaryToString);

      const exportedRows: Array<{ type: string; list_id: string }> = parseRows(body);
      const exportedLists = exportedRows.filter((row) => row?.type === DETECTION_TYPE);
      const exportedItems = exportedRows.filter((row) => row?.type === ITEM_TYPE);

      expect(exportedLists).toHaveLength(2); // 2 lists matching the filter
      expect(exportedItems).toHaveLength(4); // 2 lists * 2 items
      expect(exportedRows.map((row) => row.list_id)).toEqual(
        expect.arrayContaining(['list-0', 'list-0', 'list-2', 'list-2'])
      );
    });

    it('returns the full list of items if no filter is provided', async () => {
      const { body } = await supertest
        .post(`${EXCEPTION_LIST_URL}/_bulk_export`)
        .set('kbn-xsrf', 'true')
        .expect(200)
        .parse(binaryToString);

      const exportedRows: Array<{ type: string }> = parseRows(body);
      const exportedLists = exportedRows.filter((row) => row?.type === DETECTION_TYPE);
      const exportedItems = exportedRows.filter((row) => row?.type === ITEM_TYPE);

      expect(exportedLists).toHaveLength(3); // 3 lists
      expect(exportedItems).toHaveLength(6); // 3 lists * 2 items
    });

    describe('with a list-attribute filter', () => {
      // Regression test for a bug where the user-supplied filter (which selects
      // lists) was also applied to the items query, silently dropping items
      // whose attributes did not match a list-shaped filter. See
      // https://github.com/elastic/kibana/pull/228524#discussion_r3459698892
      const listName = 'Filter By Name List';

      before(async () => {
        await createExceptionList(supertest, log, {
          ...getCreateExceptionListMinimalSchemaMock({
            list_id: 'filter-by-name-list',
            type: DETECTION_TYPE,
          }),
          name: listName,
        });
        await createExceptionListItem(supertest, log, {
          ...getCreateExceptionListItemMinimalSchemaMock({
            item_id: 'filter-by-name-item',
            list_id: 'filter-by-name-list',
          }),
        });
      });

      after(async () => {
        await deleteExceptionListItem(supertest, log, 'filter-by-name-item');
        await deleteExceptionList(supertest, log, 'filter-by-name-list');
      });

      it('exports the items of lists selected by a non-item attribute', async () => {
        const { body } = await supertest
          .post(
            `${EXCEPTION_LIST_URL}/_bulk_export?filter=${encodeURIComponent(
              `exception-list.attributes.name:"${listName}"`
            )}`
          )
          .set('kbn-xsrf', 'true')
          .expect(200)
          .parse(binaryToString);

        const exportedRows: Array<{ type: string; list_id?: string }> = parseRows(body);
        const exportedLists = exportedRows.filter((row) => row?.type === DETECTION_TYPE);
        const exportedItems = exportedRows.filter((row) => row?.type === ITEM_TYPE);

        expect(exportedLists).toHaveLength(1); // only the uniquely-named list
        expect(exportedItems).toHaveLength(1); // its item, despite not matching the name filter
        expect(exportedItems.map((row) => row.list_id)).toEqual(['filter-by-name-list']);
      });
    });

    describe('with an expired exception', () => {
      before(async () => {
        await createExceptionListItem(supertest, log, {
          ...getCreateExceptionListItemMinimalSchemaMock({
            item_id: 'expired-item',
            list_id: 'list-0',
            expire_time: new Date(Date.now() - 10_000).toISOString(),
          }),
        });
      });

      after(async () => {
        await deleteExceptionListItem(supertest, log, 'expired-item');
      });

      it('can exclude expired exceptions', async () => {
        const { body } = await supertest
          .post(`${EXCEPTION_LIST_URL}/_bulk_export?include_expired_exceptions=false`)
          .set('kbn-xsrf', 'true')
          .expect(200)
          .parse(binaryToString);

        const exportedRows: Array<{ type: string }> = parseRows(body);
        const exportedLists = exportedRows.filter((row) => row?.type === DETECTION_TYPE);
        const exportedItems = exportedRows.filter((row) => row?.type === ITEM_TYPE);

        expect(exportedLists).toHaveLength(3); // 3 lists
        expect(exportedItems).toHaveLength(6); // 3 lists * 2 items
      });

      it('includes expired exceptions by default', async () => {
        const { body } = await supertest
          .post(`${EXCEPTION_LIST_URL}/_bulk_export`)
          .set('kbn-xsrf', 'true')
          .expect(200)
          .parse(binaryToString);

        const exportedRows: Array<{ type: string }> = parseRows(body);
        const exportedLists = exportedRows.filter((row) => row?.type === DETECTION_TYPE);
        const exportedItems = exportedRows.filter((row) => row?.type === ITEM_TYPE);

        expect(exportedLists).toHaveLength(3); // 3 lists
        expect(exportedItems).toHaveLength(7); // 3 lists * 2 items + 1 expired item
      });
    });

    describe('with defend exception lists', () => {
      before(async () => {
        await createExceptionList(supertest, log, {
          ...getCreateExceptionListMinimalSchemaMock({
            list_id: 'endpoint-list',
            type: 'endpoint',
          }),
        });
        await createExceptionListItem(supertest, log, {
          ...getCreateExceptionListItemMinimalSchemaMock({
            item_id: 'endpoint-item',
            list_id: 'endpoint-list',
            type: 'simple',
          }),
        });
      });

      after(async () => {
        await deleteExceptionListItem(supertest, log, 'endpoint-item');
        await deleteExceptionList(supertest, log, 'endpoint-list');
      });

      it('does not include defend exception lists', async () => {
        const { body } = await supertest
          .post(`${EXCEPTION_LIST_URL}/_bulk_export`)
          .set('kbn-xsrf', 'true')
          .expect(200)
          .parse(binaryToString);

        const exportedRows: Array<{ type: string; list_id?: string }> = parseRows(body);
        const exportedLists = exportedRows.filter((row) => row?.type === DETECTION_TYPE);
        const exportedItems = exportedRows.filter((row) => row?.type === ITEM_TYPE);
        const exportedListIds = exportedLists.map((row) => row.list_id);

        expect(exportedLists).toHaveLength(3); // 3 detection lists; defend list excluded
        expect(exportedItems).toHaveLength(6); // 3 lists * 2 items; defend item excluded
        expect(exportedListIds).not.toContain('endpoint-list');
      });
    });
  });
};

const bulkCreateExceptionLists = async (
  supertest: SuperTest.Agent,
  log: ToolingLog,
  { listCount, itemCount }: { listCount: number; itemCount: number }
): Promise<{ ids: string[]; listIds: string[]; itemIds: Record<string, string[]> }> => {
  const ids: string[] = [];
  const listIds: string[] = [];
  const itemIdsByListId: Record<string, string[]> = {};

  for (let i = 0; i < listCount; i++) {
    const { body: list } = await supertest
      .post(EXCEPTION_LIST_URL)
      .set('kbn-xsrf', 'true')
      .send(
        getCreateExceptionListMinimalSchemaMock({
          list_id: `list-${i}`,
          type: DETECTION_TYPE,
        })
      )
      .expect(200);

    ids.push(list.id);
    listIds.push(list.list_id);

    for (let j = 0; j < itemCount; j++) {
      const { body: item } = await supertest
        .post(EXCEPTION_LIST_ITEM_URL)
        .set('kbn-xsrf', 'true')
        .send(
          getCreateExceptionListItemMinimalSchemaMock({
            list_id: list.list_id,
            item_id: `list-${list.list_id}-item-${j}`,
          })
        )
        .expect(200);

      itemIdsByListId[list.list_id] ||= [];
      itemIdsByListId[list.list_id].push(item.id);
    }
  }

  return { ids, listIds, itemIds: itemIdsByListId };
};

const parseRows = (body: Buffer) => {
  return body
    .toString()
    .trim()
    .split('\n')
    .map((row: string) => JSON.parse(row));
};
