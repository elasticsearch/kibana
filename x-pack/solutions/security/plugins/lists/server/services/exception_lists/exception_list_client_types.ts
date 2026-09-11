/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Readable } from 'stream';

import type {
  KibanaRequest,
  SavedObjectsClientContract,
  SavedObjectsOpenPointInTimeOptions,
} from '@kbn/core/server';
import type { ExceptionListItemEntryArray } from '@kbn/securitysolution-exceptions-common/api';
import type {
  CreateCommentsArray,
  Description,
  DescriptionOrUndefined,
  ExceptionListItemType,
  ExceptionListItemTypeOrUndefined,
  ExceptionListSchema,
  ExceptionListType,
  ExceptionListTypeOrUndefined,
  ExpireTimeOrUndefined,
  ExportExceptionDetails,
  FilterOrUndefined,
  FoundExceptionListItemSchema,
  FoundExceptionListSchema,
  Id,
  IdOrUndefined,
  Immutable,
  ImportExceptionListItemSchema,
  ImportExceptionsListSchema,
  ItemId,
  ItemIdOrUndefined,
  ListId,
  ListIdOrUndefined,
  MaxSizeOrUndefined,
  MetaOrUndefined,
  Name,
  NameOrUndefined,
  NamespaceType,
  NamespaceTypeArray,
  OsTypeArray,
  PageOrUndefined,
  PerPageOrUndefined,
  PitId,
  PitOrUndefined,
  SearchAfterOrUndefined,
  SearchOrUndefined,
  SortFieldOrUndefined,
  SortOrderOrUndefined,
  Tags,
  TagsOrUndefined,
  UpdateCommentsArray,
  _VersionOrUndefined,
} from '@kbn/securitysolution-io-ts-list-types';
import type {
  EmptyStringArrayDecoded,
  NonEmptyStringArrayDecoded,
  Version,
  VersionOrUndefined,
} from '@kbn/securitysolution-io-ts-types';

import type { ExtensionPointStorageClientInterface } from '../extension_points';

/**
 * Constructor options to {@link ExceptionListClient:constructor}
 */
export interface ConstructorOptions {
  /** User creating, modifying, deleting, or updating an exception list */
  user: string;
  /** Human-readable user label for comment authors */
  userDisplayName?: string;
  /** Saved objects client to create, modify, delete, an exception list */
  savedObjectsClient: SavedObjectsClientContract;
  /** server extensions client that can be useful for injecting domain specific rules */
  serverExtensionsClient: ExtensionPointStorageClientInterface;
  /** Set to `false` if wanting to disable executing registered server extension points. Default is true. */
  enableServerExtensionPoints?: boolean;
  /** Should be provided when creating an instance from an HTTP request handler */
  request?: KibanaRequest;
}

/**
 * ExceptionListClient.getExceptionList
 * {@link ExceptionListClient.getExceptionList}
 */
export interface GetExceptionListOptions {
  /** the "list_id" of an exception list */
  listId: ListIdOrUndefined;
  /** the "id" of an exception list */
  id: IdOrUndefined;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
}

/**
 * ExceptionListClient.getExceptionListSummary
 * {@link ExceptionListClient.getExceptionListSummary}
 */
export interface GetExceptionListSummaryOptions {
  /** kql "filter" expression */
  filter: FilterOrUndefined;
  /** the "list_id" of an exception list */
  listId: ListIdOrUndefined;
  /** the "id" of an exception list */
  id: IdOrUndefined;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
}

/**
 * ExceptionListClient.createExceptionList
 * {@link ExceptionListClient.createExceptionList}
 */
export interface CreateExceptionListOptions {
  /** the "list_id" of the exception list */
  listId: ListId;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
  /** the "name" of the exception list */
  name: Name;
  /** a description of the exception list */
  description: Description;
  /** Optional meta data to add to the exception list */
  meta: MetaOrUndefined;
  /** user assigned tags of exception list */
  tags: Tags;
  /** container type */
  type: ExceptionListType;
  /** True if it's a immutable list, otherwise false */
  immutable: Immutable;
  /** document version */
  version: Version;
  /** item os types to apply */
  osTypes: OsTypeArray;
}

/**
 * ExceptionListClient.updateExceptionList
 * {@link ExceptionListClient.updateExceptionList}
 */
export interface UpdateExceptionListOptions {
  /** document version */
  _version: _VersionOrUndefined;
  /** the "id" of the exception list */
  id: IdOrUndefined;
  /** the "list_id" of the exception list */
  listId: ListIdOrUndefined;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
  /** the "name" of the exception list */
  name: NameOrUndefined;
  /** item os types to apply */
  osTypes: OsTypeArray;
  /** a description of the exception list */
  description: DescriptionOrUndefined;
  /** Optional meta object */
  meta: MetaOrUndefined;
  /** user assigned tags of exception list */
  tags: TagsOrUndefined;
  /** container type */
  type: ExceptionListTypeOrUndefined;
  /** document version, if undefined the current version number will be auto-incremented */
  version: VersionOrUndefined;
}

/**
 * ExceptionListClient.deleteExceptionList
 * {@link ExceptionListClient.deleteExceptionList}
 */
export interface DeleteExceptionListOptions {
  /* the "id" of an exception list (Either this or listId has to be defined) */
  id: IdOrUndefined;
  /** the "list_id" of an exception list (Either this or id has to be defined) */
  listId: ListIdOrUndefined;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
}

/**
 * ExceptionListClient.deleteExceptionListItem
 * {@link ExceptionListClient.deleteExceptionListItem}
 */
export interface DeleteExceptionListItemOptions {
  /** the "id" of an exception list item (Either this or itemId has to be defined) */
  id: IdOrUndefined;
  /** the "item_id" of an exception list item (Either this or id has to be defined) */
  itemId: ItemIdOrUndefined;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
}

/**
 * ExceptionListClient.deleteExceptionListItemById
 * {@link ExceptionListClient.deleteExceptionListItemById}
 */
export interface DeleteExceptionListItemByIdOptions {
  /** the "id" of an exception list item */
  id: Id;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
}

/**
 * ExceptionListClient.bulkDeleteExceptionListItems
 * {@link ExceptionListClient.bulkDeleteExceptionListItems}
 */
export interface BulkDeleteExceptionListItemsOptions {
  /** the "ids" of the exception list items */
  ids: Id[];

  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
}

/**
 * ExceptionListClient.deleteEndpointListItem
 * {@link ExceptionListClient.deleteEndpointListItem}
 */
export interface DeleteEndpointListItemOptions {
  /** The id of the endpoint list item (Either this or itemId has to be defined) */
  id: IdOrUndefined;
  /** The item id of the endpoint list item (Either this or id has to be defined) */
  itemId: ItemIdOrUndefined;
}

/**
 * ExceptionListClient.getExceptionListItem
 * {@link ExceptionListClient.getExceptionListItem}
 */
export interface GetExceptionListItemOptions {
  /** the "item_id" of an exception list (Either this or id has to be defined) */
  itemId: ItemIdOrUndefined;
  /** the "id" of an exception list (Either this or itemId has to be defined) */
  id: IdOrUndefined;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
}

/**
 * ExceptionListClient.getEndpointListItem
 * {@link ExceptionListClient.getEndpointListItem}
 */
export interface GetEndpointListItemOptions {
  /** The item id (Either this or id has to be defined) */
  itemId: ItemIdOrUndefined;
  /** The id (Either this or itemId has to be defined) */
  id: IdOrUndefined;
}

/**
 * ExceptionListClient.createExceptionListItem
 * {@link ExceptionListClient.createExceptionListItem}
 */
export interface CreateExceptionListItemOptions {
  /** User comments for the exception list item */
  comments: CreateCommentsArray;
  /** an array with the exception list item entries */
  entries: ExceptionListItemEntryArray;
  /** an optional datetime string with an expiration time */
  expireTime: ExpireTimeOrUndefined;
  /** the "item_id" of the exception list item */
  itemId: ItemId;
  /** the "list_id" of the parent exception list */
  listId: ListId;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
  /** the "name" of the exception list */
  name: Name;
  /** item os types to apply */
  osTypes: OsTypeArray;
  /** a description of the exception list */
  description: Description;
  /** Optional meta data about the list item */
  meta: MetaOrUndefined;
  /** user assigned tags of exception list */
  tags: Tags;
  /** container type */
  type: ExceptionListItemType;
  /** Human-readable user label for comment authors */
  userDisplayName?: string;
}

/**
 * ExceptionListClient.createEndpointListItem
 * {@link ExceptionListClient.createEndpointListItem}
 */
export interface CreateEndpointListItemOptions {
  /** The comments of the endpoint list item */
  comments: CreateCommentsArray;
  /** The entries of the endpoint list item */
  entries: ExceptionListItemEntryArray;
  /** The item id of the list item */
  itemId: ItemId;
  /** The name of the list item */
  name: Name;
  /** The description of the endpoint list item */
  description: Description;
  /** Optional meta data of the list item */
  meta: MetaOrUndefined;
  /** The OS type of the list item */
  osTypes: OsTypeArray;
  /** Tags of the endpoint list item */
  tags: Tags;
  /** The type of the endpoint list item (Default is "simple") */
  type: ExceptionListItemType;
}

/**
 * ExceptionListClient.duplicateExceptionListAndItems
 * {@link ExceptionListClient.duplicateExceptionListAndItems}
 */
export interface DuplicateExceptionListOptions {
  /** The list to be duplicated */
  list: ExceptionListSchema;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
  /** determines whether exception items with an expired TTL are included in duplication */
  includeExpiredExceptions: boolean;
}

/**
 * ExceptionListClient.updateExceptionListItem
 * {@link ExceptionListClient.updateExceptionListItem}
 */
export interface UpdateExceptionListItemOptions {
  /** document version */
  _version: _VersionOrUndefined;
  /** user comments attached to item */
  comments: UpdateCommentsArray;
  /** item exception entries logic */
  entries: ExceptionListItemEntryArray;
  /** an optional datetime string with an expiration time */
  expireTime: ExpireTimeOrUndefined;
  /** the "id" of the exception list item */
  id: IdOrUndefined;
  /** the "item_id" of the exception list item */
  itemId: ItemIdOrUndefined;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
  /** the "name" of the exception list */
  name: NameOrUndefined;
  /** item os types to apply */
  osTypes: OsTypeArray;
  /** a description of the exception list */
  description: DescriptionOrUndefined;
  /** Optional meta data about the exception list item */
  meta: MetaOrUndefined;
  /** user assigned tags of exception list */
  tags: TagsOrUndefined;
  /** container type */
  type: ExceptionListItemTypeOrUndefined;
  /** Human-readable user label for comment authors */
  userDisplayName?: string;
}

/**
 * ExceptionListClient.updateEndpointListItem
 * {@link ExceptionListClient.updateEndpointListItem}
 */
export interface UpdateEndpointListItemOptions {
  /** The version to update the endpoint list item to */
  _version: _VersionOrUndefined;
  /** The comments of the endpoint list item */
  comments: UpdateCommentsArray;
  /** The entries of the endpoint list item */
  entries: ExceptionListItemEntryArray;
  /** The id of the list item (Either this or itemId has to be defined) */
  id: IdOrUndefined;
  /** The item id of the list item (Either this or id has to be defined) */
  itemId: ItemIdOrUndefined;
  /** The name of the list item */
  name: NameOrUndefined;
  /** The OS type of the list item */
  osTypes: OsTypeArray;
  /** The description of the endpoint list item */
  description: DescriptionOrUndefined;
  /** Optional meta data of the list item */
  meta: MetaOrUndefined;
  /** Tags of the endpoint list item */
  tags: TagsOrUndefined;
  /** The type of the endpoint list item (Default is "simple") */
  type: ExceptionListItemTypeOrUndefined;
}

/**
 * ExceptionListClient.findExceptionListItem
 * {@link ExceptionListClient.findExceptionListItem}
 */
export interface FindExceptionListItemOptions {
  /** The single list id to do the search against */
  listId: ListId;
  /** Set the list type of either "agnostic" | "single" */
  namespaceType: NamespaceType;
  /** The filter to apply in the search */
  filter: FilterOrUndefined;
  /** How many per page to return */
  perPage: PerPageOrUndefined;
  /** The Point in Time (pit) id if there is one, otherwise "undefined" can be send in */
  pit?: PitOrUndefined;
  /** The simple search parameter if there is one, otherwise "undefined" can be sent in */
  search?: SearchOrUndefined;
  /** The search_after parameter if there is one, otherwise "undefined" can be sent in */
  searchAfter?: SearchAfterOrUndefined;
  /** The page number or "undefined" if there is no page number to continue from */
  page: PageOrUndefined;
  /** The sort field string if there is one, otherwise "undefined" can be sent in */
  sortField: SortFieldOrUndefined;
  /** The sort order string of "asc", "desc", otherwise "undefined" if there is no preference */
  sortOrder: SortOrderOrUndefined;
}

/**
 * ExceptionListClient.findEndpointListItem
 * {@link ExceptionListClient.findEndpointListItem}
 */
export interface FindEndpointListItemOptions {
  /** The filter to apply in the search */
  filter: FilterOrUndefined;
  /** How many per page to return */
  perPage: PerPageOrUndefined;
  /** The Point in Time (pit) id if there is one, otherwise "undefined" can be sent in */
  pit?: PitOrUndefined;
  /** The simple search parameter if there is one, otherwise "undefined" can be sent in */
  search?: SearchOrUndefined;
  /** The search_after parameter if there is one, otherwise "undefined" can be sent in */
  searchAfter?: SearchAfterOrUndefined;
  /** The page number or "undefined" if there is no page number to continue from */
  page: PageOrUndefined;
  /** The sort field string if there is one, otherwise "undefined" can be sent in */
  sortField: SortFieldOrUndefined;
  /** The sort order of "asc" or "desc", otherwise "undefined" can be sent in */
  sortOrder: SortOrderOrUndefined;
}

/**
 * ExceptionListClient.findExceptionListsItem
 * {@link ExceptionListClient.findExceptionListsItem}
 */
export interface FindExceptionListsItemOptions {
  /** The multiple list id's to do the search against */
  listId: NonEmptyStringArrayDecoded;
  /** Set the list type of either "agnostic" | "single" */
  namespaceType: NamespaceTypeArray;
  /** The filter to apply in the search */
  filter: EmptyStringArrayDecoded;
  /** How many per page to return */
  perPage: PerPageOrUndefined;
  /** The Point in Time (pit) id if there is one, otherwise "undefined" can be sent in */
  pit?: PitOrUndefined;
  /** The simple search parameter if there is one, otherwise "undefined" can be sent in */
  search?: SearchOrUndefined;
  /** The search_after parameter if there is one, otherwise "undefined" can be sent in */
  searchAfter?: SearchAfterOrUndefined;
  /** The page number or "undefined" if there is no page number to continue from */
  page: PageOrUndefined;
  /** The sort field string if there is one, otherwise "undefined" can be sent in */
  sortField: SortFieldOrUndefined;
  /** The sort order string of "asc", "desc", otherwise "undefined" if there is no preference */
  sortOrder: SortOrderOrUndefined;
}

/**
 * ExceptionListClient.findValueListExceptionListItems
 * {@link ExceptionListClient.findValueListExceptionListItems}
 */
export interface FindValueListExceptionListsItems {
  /** The value list id */
  valueListId: Id;
  /** How many per page to return */
  perPage: PerPageOrUndefined;
  /** The Point in Time (pit) id if there is one, otherwise "undefined" can be send in */
  pit?: PitOrUndefined;
  /** The search_after parameter if there is one, otherwise "undefined" can be sent in */
  searchAfter?: SearchAfterOrUndefined;
  /** The page number or "undefined" if there is no page number to continue from */
  page: PageOrUndefined;
  /** The sort field string if there is one, otherwise "undefined" can be sent in */
  sortField: SortFieldOrUndefined;
  /** The sort order of "asc" or "desc", otherwise "undefined" can be sent in if there is no preference */
  sortOrder: SortOrderOrUndefined;
}

/**
 * ExceptionListClient.findExceptionList
 * {@link ExceptionListClient.findExceptionList}
 */
export interface FindExceptionListOptions {
  /** Set the list type of either "agnostic" | "single" */
  namespaceType: NamespaceTypeArray;
  /** The filter to apply in the search */
  filter: FilterOrUndefined;
  /** How many per page to return */
  perPage: PerPageOrUndefined;
  /** The page number or "undefined" if there is no page number to continue from */
  page: PageOrUndefined;
  /** The Point in Time (pit) id if there is one, otherwise "undefined" can be sent in */
  pit?: PitOrUndefined;
  /** The search_after parameter if there is one, otherwise "undefined" can be sent in */
  searchAfter?: SearchAfterOrUndefined;
  /** The sort field string if there is one, otherwise "undefined" can be sent in */
  sortField: SortFieldOrUndefined;
  /** The sort order of "asc" or "desc", otherwise "undefined" can be sent in */
  sortOrder: SortOrderOrUndefined;
}

/**
 * ExceptionListClient.exportExceptionListAndItems
 * {@link ExceptionListClient.exportExceptionListAndItems}
 */
export interface ExportExceptionListAndItemsOptions {
  /** the "list_id" of an exception list */
  listId: ListIdOrUndefined;
  /** the "id" of an exception list */
  id: IdOrUndefined;
  /** saved object namespace (single | agnostic) */
  namespaceType: NamespaceType;
  /** whether or not to include expired exceptions */
  includeExpiredExceptions: boolean;
}

/**
 * Used to export list and items
 */
export interface ExportExceptionListAndItemsReturn {
  /** The exported data as ndjson */
  exportData: string;
  /** The exported data details such as counts and missing data */
  exportDetails: ExportExceptionDetails;
}

/**
 * ExceptionListClient.importExceptionListAndItems
 * {@link ExceptionListClient.importExceptionListAndItems}
 */
export interface ImportExceptionListAndItemsOptions {
  /** ndjson stream of lists and items */
  exceptionsToImport: Readable;
  /** the max number of lists and items to import, defaults to 10,000 */
  maxExceptionsImportSize: number;
  /** whether or not to overwrite an exception list with imported list if a matching list_id found */
  overwrite: boolean;
  generateNewListId: boolean;
}

/**
 * ExceptionListClient.importExceptionListAndItemsAsArray
 * {@link ExceptionListClient.importExceptionListAndItemsAsArray}
 */
export interface ImportExceptionListAndItemsAsArrayOptions {
  /** array of lists and items */
  exceptionsToImport: Array<ImportExceptionsListSchema | ImportExceptionListItemSchema>;
  /** the max number of lists and items to import, defaults to 10,000 */
  maxExceptionsImportSize: number;
  /** whether or not to overwrite an exception list with imported list if a matching list_id found */
  overwrite: boolean;
}

/**
 * ExceptionListClient.openPointInTime
 * {@link ExceptionListClient.openPointInTime}
 */
export interface OpenPointInTimeOptions {
  /** "agnostic" or "single" depending on which namespace you are targeting */
  namespaceType: NamespaceType;
  /** The saved object PIT options */
  options: SavedObjectsOpenPointInTimeOptions | undefined;
}

/**
 * ExceptionListClient.closePointInTime
 * {@link ExceptionListClient.closePointInTime}
 */
export interface ClosePointInTimeOptions {
  /** The point in time to close */
  pit: PitId;
}

/**
 * ExceptionListClient.findExceptionListItemPointInTimeFinder
 * {@link ExceptionListClient.findExceptionListItemPointInTimeFinder}
 */
export interface FindExceptionListItemPointInTimeFinderOptions {
  /** The "list_id" to filter against and find against */
  listId: ListId;
  /** "agnostic" | "single" of your namespace */
  namespaceType: NamespaceType;
  /** The filter to apply in the search */
  filter: FilterOrUndefined;
  /** The number of items per page. Typical value should be 1_000 here. Never go above 10_000 */
  perPage: PerPageOrUndefined;
  /** String of the field to sort against */
  sortField: SortFieldOrUndefined;
  /** "asc" | "desc" The order to sort against, "undefined" if the order does not matter */
  sortOrder: SortOrderOrUndefined;
  /**
   * The function to execute which will have the streamed results
   * @param response The streaming response
   */
  executeFunctionOnStream: (response: FoundExceptionListItemSchema) => void;
  /** If given a max size, this will not be exceeded. Otherwise if undefined is passed down, all records will be processed. */
  maxSize: MaxSizeOrUndefined;
}

/**
 * ExceptionListClient.findExceptionListPointInTimeFinder
 * {@link ExceptionListClient.findExceptionListPointInTimeFinder}
 */
export interface FindExceptionListPointInTimeFinderOptions {
  /** If given a max size, this will not be exceeded. Otherwise if undefined is passed down, all records will be processed. */
  maxSize: MaxSizeOrUndefined;
  /** "agnostic" | "single" of your namespace */
  namespaceType: NamespaceTypeArray;
  /** The filter to apply in the search */
  filter: FilterOrUndefined;
  /** The number of items per page. Typical value should be 1_000 here. Never go above 10_000 */
  perPage: PerPageOrUndefined;
  /** String of the field to sort against */
  sortField: SortFieldOrUndefined;
  /** "asc" | "desc" The order to sort against, "undefined" if the order does not matter */
  sortOrder: SortOrderOrUndefined;
  /**
   * The function to execute which will have the streamed results
   * @param response The streaming response
   */
  executeFunctionOnStream: (response: FoundExceptionListSchema) => void;
}

/**
 * ExceptionListClient.findExceptionListsItemPointInTimeFinder
 * {@link ExceptionListClient.findExceptionListsItemPointInTimeFinder}
 */
export interface FindExceptionListItemsPointInTimeFinderOptions {
  /** The "list_id" to find against */
  listId: NonEmptyStringArrayDecoded;
  /** "agnostic" | "single" of your namespace */
  namespaceType: NamespaceTypeArray;
  /** The filter to apply in the search */
  filter: EmptyStringArrayDecoded;
  /** The number of items per page. Typical value should be 1_000 here. Never go above 10_000 */
  perPage: PerPageOrUndefined;
  /** String of the field to sort against */
  sortField: SortFieldOrUndefined;
  /* "asc" | "desc" The order to sort against */
  sortOrder: SortOrderOrUndefined;
  /**
   * The function to execute which will have the streamed results
   * @param response The streaming response
   */
  executeFunctionOnStream: (response: FoundExceptionListItemSchema) => void;
  /** If given a max size, this will not exceeded. Otherwise if undefined is passed down, all records will be processed. */
  maxSize: MaxSizeOrUndefined;
}

/**
 * ExceptionListClient.findValueListExceptionListItemsPointInTimeFinder
 * {@link ExceptionListClient.findValueListExceptionListItemsPointInTimeFinder}
 */
export interface FindValueListExceptionListsItemsPointInTimeFinder {
  /** The value list id */
  valueListId: Id;
  /** The number of items per page. Typical value should be 1_000 here. Never go above 10_000 */
  perPage: PerPageOrUndefined;
  /** String of the field to sort against */
  sortField: SortFieldOrUndefined;
  /** "asc" | "desc" The order to sort against, "undefined" if the order does not matter */
  sortOrder: SortOrderOrUndefined;
  /**
   * The function to execute which will have the streamed results
   * @param response The streaming response
   */
  executeFunctionOnStream: (response: FoundExceptionListItemSchema) => void;
  /** If given a max size, this will not exceeded. Otherwise if undefined is passed down, all records will be processed. */
  maxSize: MaxSizeOrUndefined;
}
