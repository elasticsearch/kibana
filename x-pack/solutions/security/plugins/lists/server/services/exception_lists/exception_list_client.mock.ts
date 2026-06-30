/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Readable } from 'stream';

import { loggingSystemMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { getSavedObjectType } from '@kbn/securitysolution-list-utils';
import {
  EXCEPTION_LIST_NAMESPACE_AGNOSTIC,
  EXCEPTION_LIST_NAMESPACE_AWARE,
} from '@kbn/securitysolution-list-constants';
import type {
  SavedObjectsBulkUpdateObject,
  SavedObjectsFindResponse,
  SavedObjectsUpdateResponse,
} from '@kbn/core/server';
import type { SavedObject } from '@kbn/core/types';

import { getFoundExceptionListSchemaMock } from '../../../common/schemas/response/found_exception_list_schema.mock';
import { getFoundExceptionListItemSchemaMock } from '../../../common/schemas/response/found_exception_list_item_schema.mock';
import { getExceptionListItemSchemaMock } from '../../../common/schemas/response/exception_list_item_schema.mock';
import {
  getDetectionsExceptionListSchemaMock,
  getExceptionListSchemaMock,
  getTrustedAppsListSchemaMock,
} from '../../../common/schemas/response/exception_list_schema.mock';
import type { ExtensionPointStorageClientInterface } from '../extension_points';
import { ExtensionPointStorage } from '../extension_points';
import type { ExceptionListSoSchema } from '../../schemas/saved_objects';
import { DATE_NOW, ID, _VERSION } from '../../../common/constants.mock';

import { ExceptionListClient } from './exception_list_client';
import type {
  CreateExceptionListItemOptions,
  UpdateExceptionListItemOptions,
} from './exception_list_client_types';

const isExceptionsListSavedObjectType = (type: string): boolean =>
  type === EXCEPTION_LIST_NAMESPACE_AWARE || type === EXCEPTION_LIST_NAMESPACE_AGNOSTIC;

export class ExceptionListClientMock extends ExceptionListClient {
  public getExceptionList = jest.fn().mockResolvedValue(getExceptionListSchemaMock());
  public getExceptionListItem = jest.fn().mockResolvedValue(getExceptionListItemSchemaMock());
  public createExceptionList = jest.fn().mockResolvedValue(getExceptionListSchemaMock());
  public updateExceptionList = jest.fn().mockResolvedValue(getExceptionListSchemaMock());
  public deleteExceptionList = jest.fn().mockResolvedValue(getExceptionListSchemaMock());
  public createExceptionListItem = jest.fn().mockResolvedValue(getExceptionListItemSchemaMock());
  public updateExceptionListItem = jest.fn().mockResolvedValue(getExceptionListItemSchemaMock());
  public deleteExceptionListItem = jest.fn().mockResolvedValue(getExceptionListItemSchemaMock());
  public findExceptionListItem = jest.fn().mockResolvedValue(getFoundExceptionListItemSchemaMock());
  public findExceptionList = jest.fn().mockResolvedValue(getFoundExceptionListSchemaMock());
  public createTrustedAppsList = jest.fn().mockResolvedValue(getTrustedAppsListSchemaMock());
  public createEndpointList = jest.fn().mockResolvedValue(getExceptionListSchemaMock());
  public exportExceptionListAndItems = jest.fn().mockResolvedValue({
    exportData: `${JSON.stringify(getDetectionsExceptionListSchemaMock())}\n${JSON.stringify(
      getExceptionListItemSchemaMock({ list_id: 'exception_list_id' })
    )}`,
    exportDetails: {
      exported_exception_list_count: 1,
      exported_exception_list_item_count: 1,
      missing_exception_list_item_count: 0,
      missing_exception_list_items: [],
      missing_exception_lists: [],
      missing_exception_lists_count: 0,
    },
  });
  public findExceptionListItemsPointInTimeFinder = jest.fn().mockReturnValue(Promise.resolve());
}

export const getExceptionListClientMock = (
  savedObject?: ReturnType<typeof savedObjectsClientMock.create>,
  serverExtensionsClient: ExtensionPointStorageClientInterface = new ExtensionPointStorage(
    loggingSystemMock.createLogger()
  ).getClient()
): ExceptionListClient => {
  const mock = new ExceptionListClientMock({
    savedObjectsClient: savedObject ? savedObject : savedObjectsClientMock.create(),
    serverExtensionsClient,
    user: 'elastic',
  });
  return mock;
};

export const getCreateExceptionListItemOptionsMock = (): CreateExceptionListItemOptions => {
  const {
    comments,
    description,
    entries,
    expire_time: expireTime,
    item_id: itemId,
    list_id: listId,
    meta,
    name,
    namespace_type: namespaceType,
    os_types: osTypes,
    tags,
    type,
  } = getExceptionListItemSchemaMock();

  return {
    comments,
    description,
    entries,
    expireTime,
    itemId,
    listId,
    meta,
    name,
    namespaceType,
    osTypes,
    tags,
    type,
  };
};

export const getUpdateExceptionListItemOptionsMock = (): UpdateExceptionListItemOptions => {
  const {
    comments,
    entries,
    expireTime,
    itemId,
    namespaceType,
    name,
    osTypes,
    description,
    meta,
    tags,
    type,
  } = getCreateExceptionListItemOptionsMock();

  return {
    _version: undefined,
    comments,
    description,
    entries,
    expireTime,
    id: ID,
    itemId,
    meta,
    name,
    namespaceType,
    osTypes,
    tags,
    type,
  };
};

export const getExceptionListSoSchemaMock = (
  overrides: Partial<ExceptionListSoSchema> = {}
): ExceptionListSoSchema => {
  const {
    comments,
    created_at,
    created_by,
    description,
    entries,
    item_id,
    list_id,
    meta,
    name,
    os_types,
    tags,
    tie_breaker_id,
    type,
    updated_by,
  } = getExceptionListItemSchemaMock();

  const soSchema: ExceptionListSoSchema = {
    comments,
    created_at,
    created_by,
    description,
    entries,
    expire_time: undefined,
    immutable: undefined,
    item_id,
    list_id,
    list_type: 'item',
    meta,
    name,
    os_types,
    tags,
    tie_breaker_id,
    type,
    updated_by,
    version: undefined,
    ...overrides,
  };

  return soSchema;
};

/**
 * Returns a Saved Object with the `ExceptionListSoSchema` as the attributes
 * @param attributesOverrides
 * @param savedObjectOverrides
 */
export const getExceptionListItemSavedObject = (
  attributesOverrides: Partial<ExceptionListSoSchema> = {},
  savedObjectOverrides: Partial<Omit<SavedObject, 'attributes'>> = {}
): SavedObject<ExceptionListSoSchema> => {
  return {
    attributes: getExceptionListSoSchemaMock(attributesOverrides),
    coreMigrationVersion: undefined,
    error: undefined,
    id: ID,
    migrationVersion: undefined,
    namespaces: undefined,
    originId: undefined,
    references: [],
    type: getSavedObjectType({ namespaceType: 'agnostic' }),
    updated_at: DATE_NOW,
    version: _VERSION,
    ...savedObjectOverrides,
  };
};

/**
 * Returns a saved objects client mock that includes method mocks to handle working with the exceptions list client.
 * @param [soClient] can be provided on input and its methods will be mocked for exceptions list only and will preserve existing ones for other types
 */
export const getExceptionListSavedObjectClientMock = (
  soClient: ReturnType<typeof savedObjectsClientMock.create> = savedObjectsClientMock.create()
): ReturnType<typeof savedObjectsClientMock.create> => {
  // mock `.create()`
  const origCreateMock = soClient.create.getMockImplementation();
  soClient.create.mockImplementation(async (...args) => {
    const [type, attributes] = args;

    if (isExceptionsListSavedObjectType(type)) {
      return getExceptionListItemSavedObject(attributes as ExceptionListSoSchema, { type });
    }

    if (origCreateMock) {
      return origCreateMock(...args);
    }

    return undefined as unknown as SavedObject;
  });

  // Mock `.update()`
  const origUpdateMock = soClient.update.getMockImplementation();
  soClient.update.mockImplementation(async (...args) => {
    const [type, id, attributes, { version } = { version: undefined }] = args;

    if (isExceptionsListSavedObjectType(type)) {
      return getExceptionListItemSavedObject(attributes as ExceptionListSoSchema, {
        id,
        type,
        version: version ?? _VERSION,
      });
    }

    if (origUpdateMock) {
      return origUpdateMock(...args);
    }

    return undefined as unknown as SavedObjectsUpdateResponse;
  });

  // Mock `.get()`
  const origGetMock = soClient.get.getMockImplementation();
  soClient.get.mockImplementation(async (...args) => {
    const [type, id] = args;

    if (isExceptionsListSavedObjectType(type)) {
      return getExceptionListItemSavedObject({}, { id });
    }

    if (origGetMock) {
      return origGetMock(...args);
    }

    return undefined as unknown as SavedObject;
  });

  // Mock `.find()`
  const origFindMock = soClient.find.getMockImplementation();
  soClient.find.mockImplementation(async (options) => {
    if (
      isExceptionsListSavedObjectType(Array.isArray(options.type) ? options.type[0] : options.type)
    ) {
      return {
        page: 1,
        per_page: 1,
        saved_objects: [
          {
            ...getExceptionListItemSavedObject(),
            score: 1,
          },
        ],
        score: 1,
        total: 1,
      };
    }

    if (origFindMock) {
      return origFindMock(options);
    }

    return undefined as unknown as SavedObjectsFindResponse;
  });

  // Mock `.bulkUpdate()` (used in import)
  soClient.bulkUpdate.mockImplementation(async (...args) => {
    const [importObjects] = args as [Array<SavedObjectsBulkUpdateObject<ExceptionListSoSchema>>];

    return {
      saved_objects: importObjects.map((item) => {
        return getExceptionListItemSavedObject(item.attributes);
      }),
    };
  });

  return soClient;
};

/**
 * Converts a list of items to a NodeJS `Readable` stream
 * @param items
 */
export const toReadable = (items: unknown[]): Readable => {
  const stringOfExceptions = items.map((item) => JSON.stringify(item));

  return new Readable({
    read(): void {
      this.push(stringOfExceptions.join('\n'));
      this.push(null);
    },
  });
};
