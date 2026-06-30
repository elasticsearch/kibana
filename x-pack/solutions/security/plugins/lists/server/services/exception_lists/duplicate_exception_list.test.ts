/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core/server/mocks';

import {
  getDetectionsExceptionListSchemaMock,
  getTrustedAppsListSchemaMock,
} from '../../../common/schemas/response/exception_list_schema.mock';
import { getExceptionListItemSchemaMock } from '../../../common/schemas/response/exception_list_item_schema.mock';

import { findExceptionListItemsPointInTimeFinder } from './find_exception_list_items_point_in_time_finder';
import { duplicateExceptionListAndItems } from './duplicate_exception_list';
import { getExceptionList } from './get_exception_list';
import { createExceptionList } from './create_exception_list';

jest.mock('./get_exception_list');
jest.mock('./create_exception_list');
jest.mock('./bulk_create_exception_list_items');
jest.mock('./find_exception_list_items_point_in_time_finder');

const mockCurrentTime = new Date('2023-02-01T10:20:30Z');

describe('duplicateExceptionListAndItems', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockCurrentTime);
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  test('should return null exception list is not of type "detection" or "rule_default"', async () => {
    (getExceptionList as jest.Mock).mockResolvedValue(getTrustedAppsListSchemaMock());

    const result = await duplicateExceptionListAndItems({
      includeExpiredExceptions: true,
      list: getTrustedAppsListSchemaMock(),
      namespaceType: 'single',
      savedObjectsClient: savedObjectsClientMock.create(),
      user: 'test-user',
    });

    expect(result).toBeNull();
  });

  test('should duplicate a list with expired exceptions', async () => {
    (getExceptionList as jest.Mock).mockResolvedValue(getDetectionsExceptionListSchemaMock());
    (createExceptionList as jest.Mock).mockResolvedValue({
      ...getDetectionsExceptionListSchemaMock(),
      list_id: 'exception_list_id_dupe',
      name: 'Test [Duplicate]',
    });
    (findExceptionListItemsPointInTimeFinder as jest.Mock).mockImplementationOnce(
      ({ executeFunctionOnStream }) => {
        executeFunctionOnStream({ data: [getExceptionListItemSchemaMock()] });
      }
    );

    await duplicateExceptionListAndItems({
      includeExpiredExceptions: true,
      list: getDetectionsExceptionListSchemaMock(),
      namespaceType: 'single',
      savedObjectsClient: savedObjectsClientMock.create(),
      user: 'test-user',
    });

    expect(findExceptionListItemsPointInTimeFinder).toHaveBeenCalledWith({
      executeFunctionOnStream: expect.any(Function),
      filter: [],
      listId: ['exception_list_id'],
      maxSize: 10000,
      namespaceType: ['single'],
      perPage: undefined,
      savedObjectsClient: expect.any(Object),
      sortField: undefined,
      sortOrder: undefined,
    });
  });

  test('should duplicate a list without expired exceptions', async () => {
    (getExceptionList as jest.Mock).mockResolvedValue(getDetectionsExceptionListSchemaMock());
    (createExceptionList as jest.Mock).mockResolvedValue({
      ...getDetectionsExceptionListSchemaMock(),
      list_id: 'exception_list_id_dupe',
      name: 'Test [Duplicate]',
    });
    (findExceptionListItemsPointInTimeFinder as jest.Mock).mockImplementationOnce(
      ({ executeFunctionOnStream }) => {
        executeFunctionOnStream({ data: [getExceptionListItemSchemaMock()] });
      }
    );

    await duplicateExceptionListAndItems({
      includeExpiredExceptions: false,
      list: getDetectionsExceptionListSchemaMock(),
      namespaceType: 'single',
      savedObjectsClient: savedObjectsClientMock.create(),
      user: 'test-user',
    });

    expect(findExceptionListItemsPointInTimeFinder).toHaveBeenCalledWith({
      executeFunctionOnStream: expect.any(Function),
      filter: [
        '(exception-list.attributes.expire_time > "2023-02-01T10:20:30.000Z" OR NOT exception-list.attributes.expire_time: *)',
      ],
      listId: ['exception_list_id'],
      maxSize: 10000,
      namespaceType: ['single'],
      perPage: undefined,
      savedObjectsClient: expect.any(Object),
      sortField: undefined,
      sortOrder: undefined,
    });
  });
});
