/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  KibanaRequest,
  SavedObjectsClientContract,
  SavedObjectsClosePointInTimeResponse,
  SavedObjectsOpenPointInTimeResponse,
} from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type {
  ExceptionListItemSchema,
  ExceptionListSchema,
  ExceptionListSummarySchema,
  FoundExceptionListItemSchema,
  FoundExceptionListSchema,
  ImportExceptionsResponseSchema,
} from '@kbn/securitysolution-io-ts-list-types';
import {
  createExceptionListItemSchema,
  updateExceptionListItemSchema,
} from '@kbn/securitysolution-io-ts-list-types';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import { createPromiseFromStreams } from '@kbn/utils';

import type {
  ExtensionPointStorageClientInterface,
  ServerExtensionCallbackContext,
} from '../extension_points';

import type {
  BulkDeleteExceptionListItemsOptions,
  ClosePointInTimeOptions,
  ConstructorOptions,
  CreateEndpointListItemOptions,
  CreateExceptionListItemOptions,
  CreateExceptionListOptions,
  DeleteEndpointListItemOptions,
  DeleteExceptionListItemByIdOptions,
  DeleteExceptionListItemOptions,
  DeleteExceptionListOptions,
  DuplicateExceptionListOptions,
  ExportExceptionListAndItemsOptions,
  ExportExceptionListsAndItemsOptions,
  FindEndpointListItemOptions,
  FindExceptionListItemOptions,
  FindExceptionListItemPointInTimeFinderOptions,
  FindExceptionListItemsPointInTimeFinderOptions,
  FindExceptionListOptions,
  FindExceptionListPointInTimeFinderOptions,
  FindExceptionListsItemOptions,
  FindValueListExceptionListsItems,
  FindValueListExceptionListsItemsPointInTimeFinder,
  GetEndpointListItemOptions,
  GetExceptionListItemOptions,
  GetExceptionListOptions,
  GetExceptionListSummaryOptions,
  ImportExceptionListAndItemsAsArrayOptions,
  ImportExceptionListAndItemsOptions,
  OpenPointInTimeOptions,
  UpdateEndpointListItemOptions,
  UpdateExceptionListItemOptions,
  UpdateExceptionListOptions,
} from './exception_list_client_types';
import { getExceptionList } from './get_exception_list';
import type { ExportExceptionListAndItemsReturn } from './export_exception_list_and_items';
import { exportExceptionListAndItems } from './export_exception_list_and_items';
import type { ExportExceptionListsAndItemsReturn } from './export_exception_lists_and_items';
import { exportExceptionListsAndItems } from './export_exception_lists_and_items';
import { getExceptionListSummary } from './get_exception_list_summary';
import { createExceptionList } from './create_exception_list';
import { getExceptionListItem } from './get_exception_list_item';
import { createExceptionListItem } from './create_exception_list_item';
import { updateExceptionList } from './update_exception_list';
import { updateExceptionListItem } from './update_exception_list_item';
import { deleteExceptionList } from './delete_exception_list';
import { deleteExceptionListItem, deleteExceptionListItemById } from './delete_exception_list_item';
import { findExceptionListItem } from './find_exception_list_item';
import { findExceptionList } from './find_exception_list';
import { findExceptionListsItem } from './find_exception_list_items';
import { createEndpointList } from './create_endpoint_list';
import { createEndpointTrustedAppsList } from './create_endpoint_trusted_apps_list';
import type { PromiseFromStreams } from './import_exception_list_and_items';
import { importExceptions } from './import_exception_list_and_items';
import {
  transformCreateExceptionListItemOptionsToCreateExceptionListItemSchema,
  transformUpdateExceptionListItemOptionsToUpdateExceptionListItemSchema,
  validateData,
} from './utils';
import {
  createExceptionsStreamFromNdjson,
  exceptionsChecksFromArray,
} from './utils/import/create_exceptions_stream_logic';
import { openPointInTime } from './open_point_in_time';
import { closePointInTime } from './close_point_in_time';
import { findExceptionListPointInTimeFinder } from './find_exception_list_point_in_time_finder';
import { findValueListExceptionListItems } from './find_value_list_exception_list_items';
import { findExceptionListItemsPointInTimeFinder } from './find_exception_list_items_point_in_time_finder';
import { findValueListExceptionListItemsPointInTimeFinder } from './find_value_list_exception_list_items_point_in_time_finder';
import { findExceptionListItemPointInTimeFinder } from './find_exception_list_item_point_in_time_finder';
import { duplicateExceptionListAndItems } from './duplicate_exception_list';
import { updateOverwriteExceptionListItem } from './update_overwrite_exception_list_item';
import { bulkDeleteExceptionListItems } from './bulk_delete_exception_list_items';

/**
 * Class for use for exceptions that are with trusted applications or
 * with rules.
 */
export class ExceptionListClient {
  /** User creating, modifying, deleting, or updating an exception list */
  private readonly user: string;

  /** Saved objects client to create, modify, delete, an exception list */
  private readonly savedObjectsClient: SavedObjectsClientContract;

  /** server extensions client that can be useful for injecting domain specific rules */
  private readonly serverExtensionsClient: ExtensionPointStorageClientInterface;

  /** Set to true to enable the server extension points, otherwise false */
  private readonly enableServerExtensionPoints: boolean;

  /** Optionally, the Kibana request which is useful for extension points */
  private readonly request?: KibanaRequest;

  /**
   * Constructs the exception list
   * @param options
   * @param options.user The user associated with the action for exception list
   * @param options.savedObjectsClient The saved objects client to create, modify, delete, an exception list
   * @param options.serverExtensionsClient The server extensions client that can be useful for injecting domain specific rules
   * @param options.request optionally, the Kibana request which is useful for extension points
   */
  constructor({
    user,
    savedObjectsClient,
    serverExtensionsClient,
    enableServerExtensionPoints = true,
    request,
  }: ConstructorOptions) {
    this.user = user;
    this.savedObjectsClient = savedObjectsClient;
    this.serverExtensionsClient = serverExtensionsClient;
    this.enableServerExtensionPoints = enableServerExtensionPoints;
    this.request = request;
  }

  private getServerExtensionCallbackContext(): ServerExtensionCallbackContext {
    const { user, serverExtensionsClient, savedObjectsClient, request } = this;
    let exceptionListClient: undefined | ExceptionListClient;

    return {
      // Lazy getter so that we only initialize a new instance of the class if needed
      get exceptionListClient(): ExceptionListClient {
        if (!exceptionListClient) {
          exceptionListClient = new ExceptionListClient({
            enableServerExtensionPoints: false,
            request,
            savedObjectsClient,
            serverExtensionsClient,
            user,
          });
        }

        return exceptionListClient;
      },
      request: this.request,
    };
  }

  /**
   * Fetch an exception list parent container
   * @param options
   * @param options.listId the "list_id" of an exception list
   * @param options.id the "id" of an exception list
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @returns The found exception list or null if none exists
   */
  public getExceptionList = async ({
    listId,
    id,
    namespaceType,
  }: GetExceptionListOptions): Promise<ExceptionListSchema | null> => {
    const { savedObjectsClient } = this;
    return getExceptionList({ id, listId, namespaceType, savedObjectsClient });
  };

  /**
   * Fetch an exception list parent container
   * @param options.filter kql "filter" expression
   * @param options.listId the "list_id" of an exception list
   * @param options.id the "id" of an exception list
   * @param options.namespaceType saved object namespace (single | agnostic)
   *
   * @returns Summary of exception list item os types
   */
  public getExceptionListSummary = async (
    options: GetExceptionListSummaryOptions
  ): Promise<ExceptionListSummarySchema | null> => {
    const { savedObjectsClient } = this;

    if (this.enableServerExtensionPoints) {
      await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreSummary',
        options,
        this.getServerExtensionCallbackContext()
      );
    }

    return getExceptionListSummary({ ...options, savedObjectsClient });
  };

  /**
   * Fetch an exception list item container
   * @param options
   * @param options.itemId the "item_id" of an exception list (Either this or id has to be defined)
   * @param options.id the "id" of an exception list (Either this or itemId has to be defined)
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @returns the found exception list item or null if none exists
   */
  public getExceptionListItem = async ({
    itemId,
    id,
    namespaceType,
  }: GetExceptionListItemOptions): Promise<ExceptionListItemSchema | null> => {
    const { savedObjectsClient } = this;

    if (this.enableServerExtensionPoints) {
      await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreGetOneItem',
        { id, itemId, namespaceType },
        this.getServerExtensionCallbackContext()
      );
    }

    return getExceptionListItem({ id, itemId, namespaceType, savedObjectsClient });
  };

  /**
   * This creates an agnostic space endpoint list if it does not exist. This tries to be
   * as fast as possible by ignoring conflict errors and not returning the contents of the
   * list if it already exists.
   * @returns ExceptionListSchema if it created the endpoint list, otherwise null if it already exists
   */
  public createEndpointList = async (): Promise<ExceptionListSchema | null> => {
    const { savedObjectsClient, user } = this;
    return createEndpointList({
      savedObjectsClient,
      user,
      version: 1,
    });
  };

  /**
   * Create the Trusted Apps Agnostic list if it does not yet exist (`null` is returned if it does exist)
   * @returns The exception list schema or null if it does not exist
   */
  public createTrustedAppsList = async (): Promise<ExceptionListSchema | null> => {
    const { savedObjectsClient, user } = this;
    return createEndpointTrustedAppsList({
      savedObjectsClient,
      user,
      version: 1,
    });
  };

  /**
   * This is the same as "createListItem" except it applies specifically to the agnostic endpoint list and will
   * auto-call the "createEndpointList" for you so that you have the best chance of the agnostic endpoint
   * being there and existing before the item is inserted into the agnostic endpoint list.
   * @param options
   * @param options.comments The comments of the endpoint list item
   * @param options.description The description of the endpoint list item
   * @param options.entries The entries of the endpoint list item
   * @param options.itemId The item id of the list item
   * @param options.meta Optional meta data of the list item
   * @param options.name The name of the list item
   * @param options.osTypes The OS type of the list item
   * @param options.tags Tags of the endpoint list item
   * @param options.type The type of the endpoint list item (Default is "simple")
   * @returns The exception list item created, otherwise null if not created
   */
  public createEndpointListItem = async ({
    comments,
    description,
    entries,
    itemId,
    meta,
    name,
    osTypes,
    tags,
    type,
  }: CreateEndpointListItemOptions): Promise<ExceptionListItemSchema> => {
    const { savedObjectsClient, user } = this;
    await this.createEndpointList();

    let itemData: CreateExceptionListItemOptions = {
      comments,
      description,
      entries,
      expireTime: undefined, // Not currently used with endpoint exceptions
      itemId,
      listId: ENDPOINT_ARTIFACT_LISTS.endpointExceptions.id,
      meta,
      name,
      namespaceType: 'agnostic',
      osTypes,
      tags,
      type,
    };

    if (this.enableServerExtensionPoints) {
      itemData = await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreCreateItem',
        itemData,
        this.getServerExtensionCallbackContext(),
        (data) => {
          return validateData(
            createExceptionListItemSchema,
            transformCreateExceptionListItemOptionsToCreateExceptionListItemSchema(data)
          );
        }
      );
    }

    return createExceptionListItem({
      ...itemData,
      savedObjectsClient,
      user,
    });
  };

  /**
   * Create the Trusted Apps Agnostic list if it does not yet exist (`null` is returned if it does exist)
   * @param options.list the "list" to be duplicated
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @param options.includeExpiredExceptions include or exclude expired TTL exception items
   * @returns The exception list schema or null if it does not exist
   */
  public duplicateExceptionListAndItems = async ({
    list,
    namespaceType,
    includeExpiredExceptions,
  }: DuplicateExceptionListOptions): Promise<ExceptionListSchema | null> => {
    const { savedObjectsClient, user } = this;
    return duplicateExceptionListAndItems({
      includeExpiredExceptions,
      list,
      namespaceType,
      savedObjectsClient,
      user,
    });
  };

  /**
   * This is the same as "updateExceptionListItem" except it applies specifically to the endpoint list and will
   * auto-call the "createEndpointList" for you so that you have the best chance of the endpoint
   * being there if it did not exist before. If the list did not exist before, then creating it here will still cause a
   * return of null but at least the list exists again.
   * @param options
   * @param options._version The version to update the endpoint list item to
   * @param options.comments The comments of the endpoint list item
   * @param options.description The description of the endpoint list item
   * @param options.entries The entries of the endpoint list item
   * @param options.id The id of the list item (Either this or itemId has to be defined)
   * @param options.itemId The item id of the list item (Either this or id has to be defined)
   * @param options.meta Optional meta data of the list item
   * @param options.name The name of the list item
   * @param options.osTypes The OS type of the list item
   * @param options.tags Tags of the endpoint list item
   * @param options.type The type of the endpoint list item (Default is "simple")
   * @returns The exception list item updated, otherwise null if not updated
   */
  public updateEndpointListItem = async ({
    _version,
    comments,
    description,
    entries,
    id,
    itemId,
    meta,
    name,
    osTypes,
    tags,
    type,
  }: UpdateEndpointListItemOptions): Promise<ExceptionListItemSchema | null> => {
    const { savedObjectsClient, user } = this;
    await this.createEndpointList();

    let updatedItem: UpdateExceptionListItemOptions = {
      _version,
      comments,
      description,
      entries,
      expireTime: undefined, // Not currently used with endpoint exceptions
      id,
      itemId,
      meta,
      name,
      namespaceType: 'agnostic',
      osTypes,
      tags,
      type,
    };

    if (this.enableServerExtensionPoints) {
      updatedItem = await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreUpdateItem',
        updatedItem,
        this.getServerExtensionCallbackContext(),
        (data) => {
          return validateData(
            updateExceptionListItemSchema,
            transformUpdateExceptionListItemOptionsToUpdateExceptionListItemSchema(data)
          );
        }
      );
    }

    return updateExceptionListItem({
      ...updatedItem,
      savedObjectsClient,
      user,
    });
  };

  /**
   * This is the same as "getExceptionListItem" except it applies specifically to the endpoint list.
   * @param options
   * @param options.itemId The item id (Either this or id has to be defined)
   * @param options.id The id (Either this or itemId has to be defined)
   * @returns The exception list item found, otherwise null
   */
  public getEndpointListItem = async ({
    itemId,
    id,
  }: GetEndpointListItemOptions): Promise<ExceptionListItemSchema | null> => {
    const { savedObjectsClient } = this;

    if (this.enableServerExtensionPoints) {
      await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreGetOneItem',
        { id, itemId, namespaceType: 'agnostic' },
        this.getServerExtensionCallbackContext()
      );
    }

    return getExceptionListItem({ id, itemId, namespaceType: 'agnostic', savedObjectsClient });
  };

  /**
   * Create an exception list container
   * @param options
   * @param options.description a description of the exception list
   * @param options.osTypes item os types to apply
   * @param options.immutable True if it's a immutable list, otherwise false
   * @param options.listId the "list_id" of the exception list
   * @param options.meta Optional meta data to add to the exception list
   * @param options.name the "name" of the exception list
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @param options.tags user assigned tags of exception list
   * @param options.type container type
   * @param options.version document version
   * @returns the created exception list parent container
   */
  public createExceptionList = async ({
    description,
    osTypes,
    immutable,
    listId,
    meta,
    name,
    namespaceType,
    tags,
    type,
    version,
  }: CreateExceptionListOptions): Promise<ExceptionListSchema> => {
    const { savedObjectsClient, user } = this;
    return createExceptionList({
      description,
      immutable,
      listId,
      meta,
      name,
      namespaceType,
      osTypes,
      savedObjectsClient,
      tags,
      type,
      user,
      version,
    });
  };

  /**
   * Update an existing exception list container
   * @param options
   * @param options._version document version
   * @param options.id the "id" of the exception list
   * @param options.description a description of the exception list
   * @param options.listId the "list_id" of the exception list
   * @param options.meta Optional meta object
   * @param options.name the "name" of the exception list
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @param options.tags user assigned tags of exception list
   * @param options.type container type
   * @param options.version document version, if undefined the current version number will be auto-incremented
   * @returns the updated exception list parent container
   */
  public updateExceptionList = async ({
    _version,
    id,
    description,
    listId,
    meta,
    name,
    namespaceType,
    tags,
    type,
    version,
  }: UpdateExceptionListOptions): Promise<ExceptionListSchema | null> => {
    const { savedObjectsClient, user } = this;
    return updateExceptionList({
      _version,
      description,
      id,
      listId,
      meta,
      name,
      namespaceType,
      savedObjectsClient,
      tags,
      type,
      user,
      version,
    });
  };

  /**
   * Delete an exception list container by either id or list_id
   * @param options
   * @param options.listId the "list_id" of an exception list (Either this or id has to be defined)
   * @param options.id the "id" of an exception list (Either this or listId has to be defined)
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @returns the deleted exception list or null if none exists
   */
  public deleteExceptionList = async ({
    id,
    listId,
    namespaceType,
  }: DeleteExceptionListOptions): Promise<ExceptionListSchema | null> => {
    const { savedObjectsClient } = this;
    return deleteExceptionList({
      id,
      listId,
      namespaceType,
      savedObjectsClient,
    });
  };

  /**
   * Create an exception list item container
   * @param options
   * @param options.comments User comments for the exception list item
   * @param options.description a description of the exception list
   * @param options.entries an array with the exception list item entries
   * @param options.itemId the "item_id" of the exception list item
   * @param options.listId the "list_id" of the parent exception list
   * @param options.meta Optional meta data about the list item
   * @param options.name the "name" of the exception list
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @param options.osTypes item os types to apply
   * @param options.tags user assigned tags of exception list
   * @param options.type container type
   * @returns the created exception list item container
   */
  public createExceptionListItem = async ({
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
  }: CreateExceptionListItemOptions): Promise<ExceptionListItemSchema> => {
    const { savedObjectsClient, user } = this;
    let itemData: CreateExceptionListItemOptions = {
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

    if (this.enableServerExtensionPoints) {
      itemData = await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreCreateItem',
        itemData,
        this.getServerExtensionCallbackContext(),
        (data) => {
          return validateData(
            createExceptionListItemSchema,
            transformCreateExceptionListItemOptionsToCreateExceptionListItemSchema(data)
          );
        }
      );
    }

    return createExceptionListItem({
      ...itemData,
      savedObjectsClient,
      user,
    });
  };

  /**
   * Update an existing exception list item
   *
   * NOTE: This method will PATCH the targeted exception list item, not fully overwrite it.
   * Any undefined fields passed in will not be changed in the existing record. To unset any
   * fields use the `updateOverwriteExceptionListItem` method
   *
   * @param options
   * @param options._version document version
   * @param options.comments user comments attached to item
   * @param options.entries item exception entries logic
   * @param options.id the "id" of the exception list item
   * @param options.description a description of the exception list
   * @param options.itemId the "item_id" of the exception list item
   * @param options.meta Optional meta data about the exception list item
   * @param options.name the "name" of the exception list
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @param options.osTypes item os types to apply
   * @param options.tags user assigned tags of exception list
   * @param options.type container type
   * @returns the updated exception list item or null if none exists
   */
  public updateExceptionListItem = async ({
    _version,
    comments,
    description,
    entries,
    expireTime,
    id,
    itemId,
    meta,
    name,
    namespaceType,
    osTypes,
    tags,
    type,
  }: UpdateExceptionListItemOptions): Promise<ExceptionListItemSchema | null> => {
    const { savedObjectsClient, user } = this;
    let updatedItem: UpdateExceptionListItemOptions = {
      _version,
      comments,
      description,
      entries,
      expireTime,
      id,
      itemId,
      meta,
      name,
      namespaceType,
      osTypes,
      tags,
      type,
    };

    if (this.enableServerExtensionPoints) {
      updatedItem = await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreUpdateItem',
        updatedItem,
        this.getServerExtensionCallbackContext(),
        (data) => {
          return validateData(
            updateExceptionListItemSchema,
            transformUpdateExceptionListItemOptionsToUpdateExceptionListItemSchema(data)
          );
        }
      );
    }

    return updateExceptionListItem({
      ...updatedItem,
      savedObjectsClient,
      user,
    });
  };

  /**
   * Update an existing exception list item using the overwrite method in order to behave
   * more like a PUT request rather than a PATCH request.
   *
   * This was done in order to correctly unset types via update which cannot be accomplished
   * using the regular `updateExceptionItem` method. All other results of the methods are identical
   *
   * @param options
   * @param options._version document version
   * @param options.comments user comments attached to item
   * @param options.entries item exception entries logic
   * @param options.id the "id" of the exception list item
   * @param options.description a description of the exception list
   * @param options.itemId the "item_id" of the exception list item
   * @param options.meta Optional meta data about the exception list item
   * @param options.name the "name" of the exception list
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @param options.osTypes item os types to apply
   * @param options.tags user assigned tags of exception list
   * @param options.type container type
   * @returns the updated exception list item or null if none exists
   */
  public updateOverwriteExceptionListItem = async ({
    _version,
    comments,
    description,
    entries,
    expireTime,
    id,
    itemId,
    meta,
    name,
    namespaceType,
    osTypes,
    tags,
    type,
  }: UpdateExceptionListItemOptions): Promise<ExceptionListItemSchema | null> => {
    const { savedObjectsClient, user } = this;
    let updatedItem: UpdateExceptionListItemOptions = {
      _version,
      comments,
      description,
      entries,
      expireTime,
      id,
      itemId,
      meta,
      name,
      namespaceType,
      osTypes,
      tags,
      type,
    };

    if (this.enableServerExtensionPoints) {
      updatedItem = await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreUpdateItem',
        updatedItem,
        this.getServerExtensionCallbackContext(),
        (data) => {
          return validateData(
            updateExceptionListItemSchema,
            transformUpdateExceptionListItemOptionsToUpdateExceptionListItemSchema(data)
          );
        }
      );
    }

    return updateOverwriteExceptionListItem({
      ...updatedItem,
      savedObjectsClient,
      user,
    });
  };

  /**
   * Delete an exception list item by either id or item_id
   * @param options
   * @param options.itemId the "item_id" of an exception list item (Either this or id has to be defined)
   * @param options.id the "id" of an exception list item (Either this or itemId has to be defined)
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @returns the deleted exception list item or null if none exists
   */
  public deleteExceptionListItem = async ({
    id,
    itemId,
    namespaceType,
  }: DeleteExceptionListItemOptions): Promise<ExceptionListItemSchema | null> => {
    const { savedObjectsClient } = this;

    if (this.enableServerExtensionPoints) {
      await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreDeleteItem',
        { id, itemId, namespaceType },
        this.getServerExtensionCallbackContext()
      );
    }

    return deleteExceptionListItem({
      id,
      itemId,
      namespaceType,
      savedObjectsClient,
    });
  };

  /**
   * Delete an exception list item by id
   * @param options
   * @param options.id the "id" of an exception list item
   * @param options.namespaceType saved object namespace (single | agnostic)
   */
  public deleteExceptionListItemById = async ({
    id,
    namespaceType,
  }: DeleteExceptionListItemByIdOptions): Promise<void> => {
    const { savedObjectsClient } = this;

    if (this.enableServerExtensionPoints) {
      await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreDeleteItem',
        { id, itemId: undefined, namespaceType },
        this.getServerExtensionCallbackContext()
      );
    }

    return deleteExceptionListItemById({
      id,
      namespaceType,
      savedObjectsClient,
    });
  };

  /**
   * Bulk delete exception list items by an `id` array
   * @param options
   * @param options.ids the array of ids of exception list items to delete
   * @param options.namespaceType saved object namespace (single | agnostic)
   */
  public bulkDeleteExceptionListItems = async ({
    ids,
    namespaceType,
  }: BulkDeleteExceptionListItemsOptions): Promise<void> => {
    const { savedObjectsClient } = this;

    if (this.enableServerExtensionPoints) {
      // todo: this is not ideal, items will be checked one-by-one. we'd need an `exceptionsListPreBulkDeleteItems`
      // callback, but then that also needs a bulkGet function in exceptionListClient, which we don't have yet.
      for (const id of ids) {
        await this.serverExtensionsClient.pipeRun(
          'exceptionsListPreDeleteItem',
          { id, itemId: undefined, namespaceType },
          this.getServerExtensionCallbackContext()
        );
      }
    }

    return bulkDeleteExceptionListItems({ ids, namespaceType, savedObjectsClient });
  };

  /**
   * This is the same as "deleteExceptionListItem" except it applies specifically to the endpoint list.
   * Either id or itemId has to be defined to delete but not both is required. If both are provided, the id
   * is preferred.
   * @param options
   * @param options.id The id of the endpoint list item (Either this or itemId has to be defined)
   * @param options.itemId The item id of the endpoint list item (Either this or id has to be defined)
   */
  public deleteEndpointListItem = async ({
    id,
    itemId,
  }: DeleteEndpointListItemOptions): Promise<ExceptionListItemSchema | null> => {
    const { savedObjectsClient } = this;

    if (this.enableServerExtensionPoints) {
      await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreDeleteItem',
        { id, itemId, namespaceType: 'agnostic' },
        this.getServerExtensionCallbackContext()
      );
    }

    return deleteExceptionListItem({
      id,
      itemId,
      namespaceType: 'agnostic',
      savedObjectsClient,
    });
  };

  /**
   * Finds an exception list item given a set of criteria.
   * @param options
   * @param options.listId The single list id to do the search against
   * @param options.filter The filter to apply in the search
   * @param options.perPage How many per page to return
   * @param options.pit The Point in Time (pit) id if there is one, otherwise "undefined" can be send in
   * @param options.page The page number or "undefined" if there is no page number to continue from
   * @param options.searchAfter The search_after parameter if there is one, otherwise "undefined" can be sent in
   * @param options.sortField The sort field string if there is one, otherwise "undefined" can be sent in
   * @param options.sortOder The sort order string of "asc", "desc", otherwise "undefined" if there is no preference
   * @param options.namespaceType Set the list type of either "agnostic" | "single"
   * @returns The found exception list items or null if nothing is found
   */
  public findExceptionListItem = async ({
    listId,
    filter,
    perPage,
    pit,
    page,
    search,
    searchAfter,
    sortField,
    sortOrder,
    namespaceType,
  }: FindExceptionListItemOptions): Promise<FoundExceptionListItemSchema | null> => {
    const { savedObjectsClient } = this;

    const findOptions = {
      filter,
      listId,
      namespaceType,
      page,
      perPage,
      pit,
      searchAfter,
      sortField,
      sortOrder,
    };

    if (this.enableServerExtensionPoints) {
      await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreSingleListFind',
        findOptions,
        this.getServerExtensionCallbackContext()
      );
    }

    return findExceptionListItem({
      ...findOptions,
      savedObjectsClient,
      search,
    });
  };

  /**
   * Finds exception lists items given a set of criteria.
   * @param options
   * @param options.listId The multiple list id's to do the search against
   * @param options.filter The filter to apply in the search
   * @param options.perPage How many per page to return
   * @param options.pit The Point in Time (pit) id if there is one, otherwise "undefined" can be sent in
   * @param options.page The page number or "undefined" if there is no page number to continue from
   * @param options.search The simple query search parameter if there is one, otherwise "undefined" can be sent in
   * @param options.searchAfter The search_after parameter if there is one, otherwise "undefined" can be sent in
   * @param options.sortField The sort field string if there is one, otherwise "undefined" can be sent in
   * @param options.sortOder The sort order string of "asc", "desc", otherwise "undefined" if there is no preference
   * @param options.namespaceType Set the list type of either "agnostic" | "single"
   * @returns The found exception lists items or null if nothing is found
   */
  public findExceptionListsItem = async ({
    listId,
    filter,
    perPage,
    pit,
    page,
    search,
    searchAfter,
    sortField,
    sortOrder,
    namespaceType,
  }: FindExceptionListsItemOptions): Promise<FoundExceptionListItemSchema | null> => {
    const { savedObjectsClient } = this;

    if (this.enableServerExtensionPoints) {
      await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreMultiListFind',
        {
          filter,
          listId,
          namespaceType,
          page,
          perPage,
          pit,
          search,
          searchAfter,
          sortField,
          sortOrder,
        },
        this.getServerExtensionCallbackContext()
      );
    }

    return findExceptionListsItem({
      filter,
      listId,
      namespaceType,
      page,
      perPage,
      pit,
      savedObjectsClient,
      search,
      searchAfter,
      sortField,
      sortOrder,
    });
  };

  /**
   * Finds value list exception items given a set of criteria.
   * @param options
   * @param options.perPage How many per page to return
   * @param options.pit The Point in Time (pit) id if there is one, otherwise "undefined" can be send in
   * @param options.page The page number or "undefined" if there is no page number to continue from
   * @param options.searchAfter The search_after parameter if there is one, otherwise "undefined" can be sent in
   * @param options.sortField The sort field string if there is one, otherwise "undefined" can be sent in
   * @param options.sortOrder The sort order of "asc" or "desc", otherwise "undefined" can be sent in if there is no preference
   * @param options.valueListId The value list id
   * @returns The found value list exception list item or null if nothing is found
   */
  public findValueListExceptionListItems = async ({
    perPage,
    pit,
    page,
    searchAfter,
    sortField,
    sortOrder,
    valueListId,
  }: FindValueListExceptionListsItems): Promise<FoundExceptionListItemSchema | null> => {
    const { savedObjectsClient } = this;
    return findValueListExceptionListItems({
      page,
      perPage,
      pit,
      savedObjectsClient,
      searchAfter,
      sortField,
      sortOrder,
      valueListId,
    });
  };

  /**
   * Finds exception lists given a set of criteria.
   * @param options
   * @param options.filter The filter to apply in the search
   * @param options.perPage How many per page to return
   * @param options.page The page number or "undefined" if there is no page number to continue from
   * @param options.pit The Point in Time (pit) id if there is one, otherwise "undefined" can be sent in
   * @param options.searchAfter The search_after parameter if there is one, otherwise "undefined" can be sent in
   * @param options.sortField The sort field string if there is one, otherwise "undefined" can be sent in
   * @param options.sortOrder The sort order of "asc" or "desc", otherwise "undefined" can be sent in
   * @param options.namespaceType Set the list type of either "agnostic" | "single"
   * @returns The found exception lists or null if nothing is found
   */
  public findExceptionList = async ({
    filter,
    perPage,
    page,
    pit,
    searchAfter,
    sortField,
    sortOrder,
    namespaceType,
  }: FindExceptionListOptions): Promise<FoundExceptionListSchema> => {
    const { savedObjectsClient } = this;
    return findExceptionList({
      filter,
      namespaceType,
      page,
      perPage,
      pit,
      savedObjectsClient,
      searchAfter,
      sortField,
      sortOrder,
    });
  };

  /**
   * This is the same as "findExceptionList" except it applies specifically to the  endpoint list and will
   * auto-call the "createEndpointList" for you so that you have the best chance of the  endpoint
   * being there if it did not exist before. If the list did not exist before, then creating it here should give you
   * a good guarantee that you will get an empty record set rather than null. I keep the null as the return value in
   * the off chance that you still might somehow not get into a race condition where the  endpoint list does
   * not exist because someone deleted it in-between the initial create and then the find.
   * @param options
   * @param options.filter The filter to apply in the search
   * @param options.perPage How many per page to return
   * @param options.page The page number or "undefined" if there is no page number to continue from
   * @param options.pit The Point in Time (pit) id if there is one, otherwise "undefined" can be sent in
   * @param options.search The simple query search parameter if there is one, otherwise "undefined" can be sent in
   * @param options.searchAfter The search_after parameter if there is one, otherwise "undefined" can be sent in
   * @param options.sortField The sort field string if there is one, otherwise "undefined" can be sent in
   * @param options.sortOrder The sort order of "asc" or "desc", otherwise "undefined" can be sent in
   * @returns The found exception list items or null if nothing is found
   */
  public findEndpointListItem = async ({
    filter,
    perPage,
    page,
    pit,
    search,
    searchAfter,
    sortField,
    sortOrder,
  }: FindEndpointListItemOptions): Promise<FoundExceptionListItemSchema | null> => {
    const { savedObjectsClient } = this;

    // Attempt to auto-create the endpoint list for users with write access.
    // Silently ignore forbidden errors for read-only users - they can still query existing lists.
    try {
      await this.createEndpointList();
    } catch (err) {
      if (!SavedObjectsErrorHelpers.isForbiddenError(err)) {
        throw err;
      }
    }

    const findOptions = {
      filter,
      listId: ENDPOINT_ARTIFACT_LISTS.endpointExceptions.id,
      namespaceType: 'agnostic' as const,
      page,
      perPage,
      pit,
      searchAfter,
      sortField,
      sortOrder,
    };

    if (this.enableServerExtensionPoints) {
      await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreSingleListFind',
        findOptions,
        this.getServerExtensionCallbackContext()
      );
    }

    return findExceptionListItem({
      ...findOptions,
      savedObjectsClient,
      search,
    });
  };

  /**
   * Export an exception list parent container and it's items
   * @param options
   * @param options.listId the "list_id" of an exception list
   * @param options.id the "id" of an exception list
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @param options.includeExpiredExceptions include or exclude expired TTL exception items
   * @returns the ndjson of the list and items to export or null if none exists
   */
  public exportExceptionListAndItems = async (
    options: ExportExceptionListAndItemsOptions
  ): Promise<ExportExceptionListAndItemsReturn | null> => {
    const { savedObjectsClient } = this;

    if (this.enableServerExtensionPoints) {
      await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreExport',
        options,
        this.getServerExtensionCallbackContext()
      );
    }

    return exportExceptionListAndItems({
      ...options,
      savedObjectsClient,
    });
  };

  /**
   * Export multiple exception lists and their items
   * @param options
   * @param options.namespaceType saved object namespace (single | agnostic)
   * @returns the ndjson of the lists and items to export; an empty export with
   * zero counts when nothing matches
   */
  public exportExceptionListsAndItems = async (
    options: ExportExceptionListsAndItemsOptions
  ): Promise<ExportExceptionListsAndItemsReturn> => {
    const { savedObjectsClient } = this;

    return exportExceptionListsAndItems({
      ...options,
      savedObjectsClient,
    });
  };

  /**
   * Import exception lists parent containers and items as stream
   * @param options
   * @param options.exceptionsToImport ndjson stream of lists and items
   * @param options.maxExceptionsImportSize the max number of lists and items to import, defaults to 10,000
   * @param options.overwrite whether or not to overwrite an exception list with imported list if a matching list_id found
   * @returns summary of imported count and errors
   */
  public importExceptionListAndItems = async ({
    exceptionsToImport,
    maxExceptionsImportSize,
    overwrite,
    generateNewListId,
  }: ImportExceptionListAndItemsOptions): Promise<ImportExceptionsResponseSchema> => {
    const { savedObjectsClient, user } = this;

    // validation of import and sorting of lists and items
    const readStream = createExceptionsStreamFromNdjson(maxExceptionsImportSize);
    const [parsedObjects] = await createPromiseFromStreams<PromiseFromStreams[]>([
      exceptionsToImport,
      ...readStream,
    ]);

    let shouldListApiPerformOverwrite = overwrite;
    if (this.enableServerExtensionPoints) {
      const result = await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreImport',
        { data: parsedObjects, overwrite },
        this.getServerExtensionCallbackContext()
      );

      shouldListApiPerformOverwrite = result.overwrite;
    }

    return importExceptions({
      exceptions: parsedObjects,
      generateNewListId,
      overwrite: shouldListApiPerformOverwrite,
      savedObjectsClient,
      user,
    });
  };

  /**
   * Import exception lists parent containers and items as array
   * @param options
   * @param options.exceptionsToImport array of lists and items
   * @param options.maxExceptionsImportSize the max number of lists and items to import, defaults to 10,000
   * @param options.overwrite whether or not to overwrite an exception list with imported list if a matching list_id found
   * @returns summary of imported count and errors
   */
  public importExceptionListAndItemsAsArray = async ({
    exceptionsToImport,
    maxExceptionsImportSize,
    overwrite,
  }: ImportExceptionListAndItemsAsArrayOptions): Promise<ImportExceptionsResponseSchema> => {
    const { savedObjectsClient, user } = this;

    // validation of import and sorting of lists and items
    const parsedObjects = exceptionsChecksFromArray(exceptionsToImport, maxExceptionsImportSize);

    let shouldListApiPerformOverwrite = overwrite;
    if (this.enableServerExtensionPoints) {
      const result = await this.serverExtensionsClient.pipeRun(
        'exceptionsListPreImport',
        { data: parsedObjects, overwrite },
        this.getServerExtensionCallbackContext()
      );

      shouldListApiPerformOverwrite = result.overwrite;
    }

    return importExceptions({
      exceptions: parsedObjects,
      generateNewListId: false,
      overwrite: shouldListApiPerformOverwrite,
      savedObjectsClient,
      user,
    });
  };

  /**
   * Opens a point in time (PIT) for either exception lists or exception list items.
   * See: https://www.elastic.co/guide/en/elasticsearch/reference/current/point-in-time-api.html
   * @param options
   * @param options.namespaceType "agnostic" or "single" depending on which namespace you are targeting
   * @param options.options The saved object PIT options
   * @returns The point in time (PIT)
   */
  public openPointInTime = async ({
    namespaceType,
    options,
  }: OpenPointInTimeOptions): Promise<SavedObjectsOpenPointInTimeResponse> => {
    const { savedObjectsClient } = this;
    return openPointInTime({
      namespaceType,
      options,
      savedObjectsClient,
    });
  };

  /**
   * Closes a point in time (PIT) for either exception lists or exception list items.
   * See: https://www.elastic.co/guide/en/elasticsearch/reference/current/point-in-time-api.html
   * @param options
   * @param options.pit The point in time to close
   * @returns The point in time (PIT)
   */
  public closePointInTime = async ({
    pit,
  }: ClosePointInTimeOptions): Promise<SavedObjectsClosePointInTimeResponse> => {
    const { savedObjectsClient } = this;
    return closePointInTime({
      pit,
      savedObjectsClient,
    });
  };

  /**
   * Finds an exception list item within a point in time (PIT) and then calls the function
   * `executeFunctionOnStream` until the maxPerPage is reached and stops.
   * NOTE: This is slightly different from the saved objects version in that it takes
   * an injected function, so that we avoid doing additional plumbing with generators
   * to try to keep the maintenance of this machinery simpler for now.
   *
   * If you want to stream all results up to 10k into memory for correlation this would be:
   * @example
   * ```ts
   * const exceptionList: ExceptionListItemSchema[] = [];
   * const executeFunctionOnStream = (response: FoundExceptionListItemSchema) => {
   *   exceptionList = [...exceptionList, ...response.data];
   * }
   * await client.findExceptionListItemPointInTimeFinder({
   *   filter,
   *   executeFunctionOnStream,
   *   namespaceType,
   *   maxSize: 10_000, // NOTE: This is unbounded if it is "undefined"
   *   perPage: 1_000, // See https://github.com/elastic/kibana/issues/93770 for choice of 1k
   *   sortField,
   *   sortOrder,
   *   exe
   * });
   * ```
   * @param options
   * @param options.filter The filter to apply in the search
   * @param options.listId The "list_id" to filter against and find against
   * @param options.namespaceType "agnostic" | "single" of your namespace
   * @param options.perPage The number of items per page. Typical value should be 1_000 here. Never go above 10_000
   * @param options.maxSize If given a max size, this will not exceeded. Otherwise if undefined is passed down, all records will be processed.
   * @param options.sortField String of the field to sort against
   * @param options.sortOrder "asc" | "desc" The order to sort against, "undefined" if the order does not matter
   * @param options.executeFunctionOnStream The function to execute which will have the streamed results
   */
  public findExceptionListItemPointInTimeFinder = async ({
    executeFunctionOnStream,
    filter,
    listId,
    maxSize,
    namespaceType,
    perPage,
    sortField,
    sortOrder,
  }: FindExceptionListItemPointInTimeFinderOptions): Promise<void> => {
    const { savedObjectsClient } = this;
    return findExceptionListItemPointInTimeFinder({
      executeFunctionOnStream,
      filter,
      listId,
      maxSize,
      namespaceType,
      perPage,
      savedObjectsClient,
      sortField,
      sortOrder,
    });
  };

  /**
   * Finds an exception list within a point in time (PIT) and then calls the function
   * `executeFunctionOnStream` until the maxPerPage is reached and stops.
   * NOTE: This is slightly different from the saved objects version in that it takes
   * an injected function, so that we avoid doing additional plumbing with generators
   * to try to keep the maintenance of this machinery simpler for now.
   *
   * If you want to stream all results up to 10k into memory for correlation this would be:
   * @example
   * ```ts
   * const exceptionList: ExceptionListSchema[] = [];
   * const executeFunctionOnStream = (response: FoundExceptionListSchema) => {
   *   exceptionList = [...exceptionList, ...response.data];
   * }
   * await client.findExceptionListPointInTimeFinder({
   *   filter,
   *   executeFunctionOnStream,
   *   namespaceType,
   *   maxSize: 10_000, // NOTE: This is unbounded if it is "undefined"
   *   perPage: 1_000, // See https://github.com/elastic/kibana/issues/93770 for choice of 1k
   *   sortField,
   *   sortOrder,
   *   exe
   * });
   * ```
   * @param options
   * @param options.filter The filter to apply in the search
   * @param options.namespaceType "agnostic" | "single" of your namespace
   * @param options.perPage The number of items per page. Typical value should be 1_000 here. Never go above 10_000
   * @param options.maxSize If given a max size, this will not be exceeded. Otherwise if undefined is passed down, all records will be processed.
   * @param options.sortField String of the field to sort against
   * @param options.sortOrder "asc" | "desc" The order to sort against, "undefined" if the order does not matter
   * @param options.executeFunctionOnStream The function to execute which will have the streamed results
   */
  public findExceptionListPointInTimeFinder = async ({
    executeFunctionOnStream,
    filter,
    maxSize,
    namespaceType,
    perPage,
    sortField,
    sortOrder,
  }: FindExceptionListPointInTimeFinderOptions): Promise<void> => {
    const { savedObjectsClient } = this;
    return findExceptionListPointInTimeFinder({
      executeFunctionOnStream,
      filter,
      maxSize,
      namespaceType,
      perPage,
      savedObjectsClient,
      sortField,
      sortOrder,
    });
  };

  /**
   * Finds exception list items within a point in time (PIT) and then calls the function
   * `executeFunctionOnStream` until the maxPerPage is reached and stops.
   * NOTE: This is slightly different from the saved objects version in that it takes
   * an injected function, so that we avoid doing additional plumbing with generators
   * to try to keep the maintenance of this machinery simpler for now.
   *
   * If you want to stream all results up to 10k into memory for correlation this would be:
   * @example
   * ```ts
   * const exceptionList: ExceptionListItemSchema[] = [];
   * const executeFunctionOnStream = (response: FoundExceptionListItemSchema) => {
   *   exceptionList = [...exceptionList, ...response.data];
   * }
   * await client.findExceptionListItemsPointInTimeFinder({
   *   filter,
   *   executeFunctionOnStream,
   *   namespaceType,
   *   maxSize: 10_000, // NOTE: This is unbounded if it is "undefined"
   *   perPage: 1_000, // See https://github.com/elastic/kibana/issues/93770 for choice of 1k
   *   sortField,
   *   sortOrder,
   *   exe
   * });
   * ```
   * @param options
   * @param options.listId The "list_id" to find against
   * @param options.filter The filter to apply in the search
   * @param options.namespaceType "agnostic" | "single" of your namespace
   * @param options.perPage The number of items per page. Typical value should be 1_000 here. Never go above 10_000
   * @param options.maxSize If given a max size, this will not exceeded. Otherwise if undefined is passed down, all records will be processed.
   * @param options.sortField String of the field to sort against
   * @param options.sortOrder "asc" | "desc" The order to sort against, "undefined" if the order does not matter
   * @param options.executeFunctionOnStream The function to execute which will have the streamed results
   */
  public findExceptionListItemsPointInTimeFinder = async ({
    listId,
    namespaceType,
    executeFunctionOnStream,
    maxSize,
    filter,
    perPage,
    sortField,
    sortOrder,
  }: FindExceptionListItemsPointInTimeFinderOptions): Promise<void> => {
    const { savedObjectsClient } = this;
    return findExceptionListItemsPointInTimeFinder({
      executeFunctionOnStream,
      filter,
      listId,
      maxSize,
      namespaceType,
      perPage,
      savedObjectsClient,
      sortField,
      sortOrder,
    });
  };

  /**
   * Finds value lists within exception lists within a point in time (PIT) and then calls the function
   * `executeFunctionOnStream` until the maxPerPage is reached and stops.
   * NOTE: This is slightly different from the saved objects version in that it takes
   * an injected function, so that we avoid doing additional plumbing with generators
   * to try to keep the maintenance of this machinery simpler for now.
   *
   * If you want to stream all results up to 10k into memory for correlation this would be:
   * @example
   * ```ts
   * const exceptionList: ExceptionListItemSchema[] = [];
   * const executeFunctionOnStream = (response: FoundExceptionListItemSchema) => {
   *   exceptionList = [...exceptionList, ...response.data];
   * }
   * await client.findValueListExceptionListItemsPointInTimeFinder({
   *   valueListId,
   *   executeFunctionOnStream,
   *   namespaceType,
   *   maxSize: 10_000, // NOTE: This is unbounded if it is "undefined"
   *   perPage: 1_000, // See https://github.com/elastic/kibana/issues/93770 for choice of 1k
   *   sortField,
   *   sortOrder,
   *   exe
   * });
   * ```
   * @param options
   * @param options.valueListId The value list id
   * @param options.namespaceType "agnostic" | "single" of your namespace
   * @param options.perPage The number of items per page. Typical value should be 1_000 here. Never go above 10_000
   * @param options.maxSize If given a max size, this will not exceeded. Otherwise if undefined is passed down, all records will be processed.
   * @param options.sortField String of the field to sort against
   * @param options.sortOrder "asc" | "desc" The order to sort against, "undefined" if the order does not matter
   */
  public findValueListExceptionListItemsPointInTimeFinder = async ({
    valueListId,
    executeFunctionOnStream,
    perPage,
    maxSize,
    sortField,
    sortOrder,
  }: FindValueListExceptionListsItemsPointInTimeFinder): Promise<void> => {
    const { savedObjectsClient } = this;
    return findValueListExceptionListItemsPointInTimeFinder({
      executeFunctionOnStream,
      maxSize,
      perPage,
      savedObjectsClient,
      sortField,
      sortOrder,
      valueListId,
    });
  };
}
