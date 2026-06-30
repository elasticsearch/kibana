/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core/server/mocks';

import { getExceptionListItemSchemaMock } from '../../../common/schemas/response/exception_list_item_schema.mock';
import { getExceptionListSchemaMock } from '../../../common/schemas/response/exception_list_schema.mock';

import { exportExceptionListAndItems } from './export_exception_list_and_items';
import { findExceptionListItemPointInTimeFinder } from './find_exception_list_item_point_in_time_finder';
import { getExceptionList } from './get_exception_list';

jest.mock('./get_exception_list');
jest.mock('./find_exception_list_item_point_in_time_finder');

describe('export_exception_list_and_items', () => {
  describe('exportExceptionListAndItems', () => {
    test('it should return null if no matching exception list found', async () => {
      (getExceptionList as jest.Mock).mockResolvedValue(null);
      (findExceptionListItemPointInTimeFinder as jest.Mock).mockImplementationOnce(
        ({ executeFunctionOnStream }) => {
          executeFunctionOnStream({ data: [getExceptionListItemSchemaMock()] });
        }
      );

      const result = await exportExceptionListAndItems({
        id: '123',
        includeExpiredExceptions: true,
        listId: 'non-existent',
        namespaceType: 'single',
        savedObjectsClient: savedObjectsClientMock.create(),
      });
      expect(result).toBeNull();
    });

    test('it should return stringified list and items', async () => {
      (getExceptionList as jest.Mock).mockResolvedValue(getExceptionListSchemaMock());
      (findExceptionListItemPointInTimeFinder as jest.Mock).mockImplementationOnce(
        ({ executeFunctionOnStream }) => {
          executeFunctionOnStream({ data: [getExceptionListItemSchemaMock()] });
        }
      );
      const result = await exportExceptionListAndItems({
        id: '123',
        includeExpiredExceptions: true,
        listId: 'non-existent',
        namespaceType: 'single',
        savedObjectsClient: savedObjectsClientMock.create(),
      });
      expect(result?.exportData).toEqual(
        `${JSON.stringify(getExceptionListSchemaMock())}\n${JSON.stringify(
          getExceptionListItemSchemaMock()
        )}\n`
      );
      expect(result?.exportDetails).toEqual({
        exported_exception_list_count: 1,
        exported_exception_list_item_count: 1,
        missing_exception_list_item_count: 0,
        missing_exception_list_items: [],
        missing_exception_lists: [],
        missing_exception_lists_count: 0,
      });
    });

    test.each`
      title                            | includeExpired | expectedStringMatch
      ${'with expired exceptions'}     | ${true}        | ${'^tags: foo$'}
      ${'with OUT expired exceptions'} | ${false}       | ${'^\\(tags: foo\\) AND \\(exception-list.attributes.expire_time'}
    `('it should use a `filter` $title', async ({ includeExpired, expectedStringMatch }) => {
      (getExceptionList as jest.Mock).mockResolvedValue(getExceptionListSchemaMock());
      (findExceptionListItemPointInTimeFinder as jest.Mock).mockImplementationOnce(
        ({ executeFunctionOnStream }) => {
          executeFunctionOnStream({ data: [getExceptionListItemSchemaMock()] });
        }
      );

      await exportExceptionListAndItems({
        filter: 'tags: foo',
        id: '123',
        includeExpiredExceptions: includeExpired,
        listId: 'non-existent',
        namespaceType: 'single',
        savedObjectsClient: savedObjectsClientMock.create(),
      });

      expect(findExceptionListItemPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringMatching(expectedStringMatch),
        })
      );
    });

    test.each`
      namespaceType | expectedSortField
      ${'single'}   | ${'exception-list.created_at'}
      ${'agnostic'} | ${'exception-list-agnostic.created_at'}
    `(
      'it sorts items by the $namespaceType saved object type',
      async ({ namespaceType, expectedSortField }) => {
        (getExceptionList as jest.Mock).mockResolvedValue(getExceptionListSchemaMock());
        (findExceptionListItemPointInTimeFinder as jest.Mock).mockImplementationOnce(
          ({ executeFunctionOnStream }) => {
            executeFunctionOnStream({ data: [getExceptionListItemSchemaMock()] });
          }
        );

        await exportExceptionListAndItems({
          id: '123',
          includeExpiredExceptions: true,
          listId: 'non-existent',
          namespaceType,
          savedObjectsClient: savedObjectsClientMock.create(),
        });

        expect(findExceptionListItemPointInTimeFinder).toHaveBeenCalledWith(
          expect.objectContaining({ sortField: expectedSortField })
        );
      }
    );
  });
});
