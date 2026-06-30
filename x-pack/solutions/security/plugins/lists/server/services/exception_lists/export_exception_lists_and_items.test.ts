/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import type {
  ExceptionListItemSchema,
  ExceptionListSchema,
  NamespaceType,
} from '@kbn/securitysolution-io-ts-list-types';

import { getExceptionListItemSchemaMock } from '../../../common/schemas/response/exception_list_item_schema.mock';
import { getExceptionListSchemaMock } from '../../../common/schemas/response/exception_list_schema.mock';

import {
  EXPORT_SIZE_LIMIT,
  ExportSizeLimitError,
  LIST_IDS_BATCH_SIZE,
  exportExceptionListsAndItems,
} from './export_exception_lists_and_items';
import { findExceptionListsItemsPointInTimeFinder } from './find_exception_lists_items_point_in_time_finder';
import { findExceptionListPointInTimeFinder } from './find_exception_list_point_in_time_finder';

jest.mock('./find_exception_lists_items_point_in_time_finder');
jest.mock('./find_exception_list_point_in_time_finder');

const namespaceType: NamespaceType = 'single';

const baseOptions = {
  filter: undefined,
  includeExpiredExceptions: true,
  namespaceType,
  savedObjectsClient: savedObjectsClientMock.create(),
};

const mockListsFinder = (lists: ExceptionListSchema[]): void => {
  (findExceptionListPointInTimeFinder as jest.Mock).mockImplementationOnce(
    ({ executeFunctionOnStream }) => executeFunctionOnStream({ data: lists })
  );
};

const mockItemsFinder = (items: ExceptionListItemSchema[]): void => {
  (findExceptionListsItemsPointInTimeFinder as jest.Mock).mockImplementationOnce(
    ({ executeFunctionOnStream }) => executeFunctionOnStream({ data: items })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('export_exception_lists_and_items', () => {
  describe('exportExceptionListsAndItems', () => {
    it('returns an empty export with zero counts when no exception lists are found', async () => {
      const result = await exportExceptionListsAndItems(baseOptions);

      expect(result).toEqual({
        exportData: '',
        exportDetails: {
          exported_exception_list_count: 0,
          exported_exception_list_item_count: 0,
        },
      });
    });

    it('does not query for items when no exception lists are found', async () => {
      await exportExceptionListsAndItems(baseOptions);

      expect(findExceptionListsItemsPointInTimeFinder).not.toHaveBeenCalled();
    });

    it('returns multiple exception lists and items when found', async () => {
      const exceptionList = getExceptionListSchemaMock();
      const exceptionListItem = getExceptionListItemSchemaMock();

      (findExceptionListPointInTimeFinder as jest.Mock).mockImplementationOnce(
        ({ executeFunctionOnStream }) => {
          executeFunctionOnStream({
            data: [getExceptionListSchemaMock(), getExceptionListSchemaMock()],
          });
        }
      );
      (findExceptionListsItemsPointInTimeFinder as jest.Mock).mockImplementationOnce(
        ({ executeFunctionOnStream }) => {
          executeFunctionOnStream({
            data: [getExceptionListItemSchemaMock(), getExceptionListItemSchemaMock()],
          });
        }
      );

      const result = await exportExceptionListsAndItems(baseOptions);

      const parsedExportData =
        result?.exportData
          ?.trim()
          .split('\n')
          .map((item) => JSON.parse(item)) ?? [];

      expect(parsedExportData).toEqual([
        exceptionList,
        exceptionList,
        exceptionListItem,
        exceptionListItem,
      ]);

      expect(result?.exportDetails).toEqual(
        expect.objectContaining({
          exported_exception_list_count: 2,
          exported_exception_list_item_count: 2,
        })
      );
    });

    it('excludes expired exceptions when includeExpiredExceptions is false', async () => {
      mockListsFinder([getExceptionListSchemaMock()]);
      mockItemsFinder([]);

      await exportExceptionListsAndItems({
        ...baseOptions,
        includeExpiredExceptions: false,
      });

      expect(findExceptionListsItemsPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringMatching(
            /exception-list\.attributes\.expire_time > "[^"]+" OR NOT exception-list\.attributes\.expire_time: \*/
          ),
        })
      );
    });

    it('does not constrain item retrieval by expiration when includeExpiredExceptions is true', async () => {
      mockListsFinder([getExceptionListSchemaMock()]);
      mockItemsFinder([]);

      await exportExceptionListsAndItems({
        ...baseOptions,
        includeExpiredExceptions: true,
      });

      expect(findExceptionListsItemsPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: undefined,
        })
      );
    });

    it('only includes shared detection-type exception lists', async () => {
      // The positive `type: detection` filter implicitly excludes both
      // `endpoint*` (Defend) and `rule_default` (per-rule) exception lists,
      // which have their own dedicated export workflows.
      mockListsFinder([getExceptionListSchemaMock()]);
      mockItemsFinder([]);

      await exportExceptionListsAndItems(baseOptions);

      expect(findExceptionListPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('attributes.type: detection'),
        })
      );
    });

    it('combines the user-supplied filter with the detection-type filter', async () => {
      mockListsFinder([getExceptionListSchemaMock()]);
      mockItemsFinder([]);

      await exportExceptionListsAndItems({
        ...baseOptions,
        filter: 'exception-list.attributes.list_id: foo',
      });

      expect(findExceptionListPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          filter:
            '(exception-list.attributes.list_id: foo) AND exception-list.attributes.type: detection',
        })
      );
    });

    it('does not apply the user-supplied filter to the items query', async () => {
      // The filter selects which lists to export; items are retrieved by their
      // parent list_ids. Applying a list-shaped filter (e.g. on `name`) to the
      // items query would incorrectly drop the lists' items.
      mockListsFinder([getExceptionListSchemaMock()]);
      mockItemsFinder([]);

      await exportExceptionListsAndItems({
        ...baseOptions,
        filter: 'exception-list.attributes.name: "Shared list"',
      });

      expect(findExceptionListsItemsPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: undefined,
        })
      );
    });

    it('applies only the expiration clause to the items query when the user supplies a filter', async () => {
      mockListsFinder([getExceptionListSchemaMock()]);
      mockItemsFinder([]);

      await exportExceptionListsAndItems({
        ...baseOptions,
        filter: 'exception-list.attributes.name: "Shared list"',
        includeExpiredExceptions: false,
      });

      expect(findExceptionListsItemsPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringMatching(
            /^\(exception-list\.attributes\.expire_time > "[^"]+" OR NOT exception-list\.attributes\.expire_time: \*\)$/
          ),
        })
      );
    });

    it('sorts by the single-namespace saved object type when namespaceType is single', async () => {
      mockListsFinder([getExceptionListSchemaMock()]);
      mockItemsFinder([]);

      await exportExceptionListsAndItems({ ...baseOptions, namespaceType: 'single' });

      expect(findExceptionListPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({ sortField: 'exception-list.created_at' })
      );
      expect(findExceptionListsItemsPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({ sortField: 'exception-list.created_at' })
      );
    });

    it('sorts by the agnostic saved object type when namespaceType is agnostic', async () => {
      // For agnostic exceptions the documents live under the
      // `exception-list-agnostic` saved object type, so the sort field must be
      // scoped to that type. Sorting by `exception-list.created_at` would leave
      // agnostic docs effectively unsorted (the field is unmapped for them).
      mockListsFinder([getExceptionListSchemaMock()]);
      mockItemsFinder([]);

      await exportExceptionListsAndItems({ ...baseOptions, namespaceType: 'agnostic' });

      expect(findExceptionListPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({ sortField: 'exception-list-agnostic.created_at' })
      );
      expect(findExceptionListsItemsPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({ sortField: 'exception-list-agnostic.created_at' })
      );
    });

    describe('when exception list count exceeds the default export size limit', () => {
      const overflowingLists = Array.from({ length: EXPORT_SIZE_LIMIT + 1 }, () =>
        getExceptionListSchemaMock()
      );

      it('returns an error', async () => {
        mockListsFinder(overflowingLists);

        await expect(exportExceptionListsAndItems(baseOptions)).rejects.toBeInstanceOf(
          ExportSizeLimitError
        );
      });

      it('returns an error with statusCode 422', async () => {
        mockListsFinder(overflowingLists);

        await expect(exportExceptionListsAndItems(baseOptions)).rejects.toMatchObject({
          statusCode: 422,
        });
      });

      it('does not retrieve exception list items', async () => {
        mockListsFinder(overflowingLists);

        await expect(exportExceptionListsAndItems(baseOptions)).rejects.toThrow(
          ExportSizeLimitError
        );

        expect(findExceptionListsItemsPointInTimeFinder).not.toHaveBeenCalled();
      });
    });

    describe('when exception list + items count exceeds the default export size limit', () => {
      it('returns an error', async () => {
        mockListsFinder([getExceptionListSchemaMock()]);
        // 1 list + EXPORT_SIZE_LIMIT items === LIMIT + 1 total saved objects.
        mockItemsFinder(
          Array.from({ length: EXPORT_SIZE_LIMIT }, () => getExceptionListItemSchemaMock())
        );

        await expect(exportExceptionListsAndItems(baseOptions)).rejects.toBeInstanceOf(
          ExportSizeLimitError
        );
      });

      it('does not return an error when the combined count equals the limit', async () => {
        mockListsFinder([getExceptionListSchemaMock()]);
        mockItemsFinder(
          Array.from({ length: EXPORT_SIZE_LIMIT - 1 }, () => getExceptionListItemSchemaMock())
        );

        const result = await exportExceptionListsAndItems(baseOptions);

        expect(result?.exportDetails).toEqual(
          expect.objectContaining({
            exported_exception_list_count: 1,
            exported_exception_list_item_count: EXPORT_SIZE_LIMIT - 1,
          })
        );
      });
    });

    describe('list ID batching', () => {
      it('splits items queries into batches of LIST_IDS_BATCH_SIZE', async () => {
        const listCount = LIST_IDS_BATCH_SIZE * 2 + 1;
        const lists = Array.from({ length: listCount }, () => getExceptionListSchemaMock());
        mockListsFinder(lists);

        const expectedBatchCount = Math.ceil(listCount / LIST_IDS_BATCH_SIZE);
        for (let i = 0; i < expectedBatchCount; i++) {
          mockItemsFinder([]);
        }

        await exportExceptionListsAndItems(baseOptions);

        expect(findExceptionListsItemsPointInTimeFinder).toHaveBeenCalledTimes(expectedBatchCount);
      });

      it('passes at most LIST_IDS_BATCH_SIZE list IDs per items query', async () => {
        const listCount = LIST_IDS_BATCH_SIZE + 1;
        const lists = Array.from({ length: listCount }, () => getExceptionListSchemaMock());
        mockListsFinder(lists);

        mockItemsFinder([]);
        mockItemsFinder([]);

        await exportExceptionListsAndItems(baseOptions);

        const { calls } = (findExceptionListsItemsPointInTimeFinder as jest.Mock).mock;
        for (const [callArgs] of calls) {
          expect(callArgs.listIds.length).toBeLessThanOrEqual(LIST_IDS_BATCH_SIZE);
        }
      });

      it('stops querying further batches once the item budget is exhausted', async () => {
        // Two lists, each in its own batch. The first batch saturates the budget.
        const lists = Array.from({ length: LIST_IDS_BATCH_SIZE + 1 }, () =>
          getExceptionListSchemaMock()
        );
        mockListsFinder(lists);

        // First batch returns enough items to saturate the budget (+1 sentinel).
        const itemsBudget = EXPORT_SIZE_LIMIT - lists.length;
        mockItemsFinder(
          Array.from({ length: itemsBudget + 1 }, () => getExceptionListItemSchemaMock())
        );

        await expect(exportExceptionListsAndItems(baseOptions)).rejects.toBeInstanceOf(
          ExportSizeLimitError
        );

        // Second batch should never be queried because the budget was already hit.
        expect(findExceptionListsItemsPointInTimeFinder).toHaveBeenCalledTimes(1);
      });
    });
  });
});
