/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Boom from '@hapi/boom';
import type { SearchQuery, SearchIn } from '@kbn/content-management-plugin/common';
import type {
  ContentStorage,
  StorageContext,
  MSearchConfig,
} from '@kbn/content-management-plugin/server';
import type {
  SavedObject,
  SavedObjectReference,
  SavedObjectsFindOptions,
  SavedObjectsCreateOptions,
  SavedObjectsUpdateOptions,
  SavedObjectsFindResult,
} from '@kbn/core-saved-objects-api-server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/logging';
import { pick } from 'lodash';
import type {
  CMCrudTypes,
  ServicesDefinitionSet,
  SOWithMetadata,
  SOWithMetadataPartial,
} from './types';
import { tagsToFindOptions } from './utils';

export type PartialSavedObject<T> = Omit<SavedObject<Partial<T>>, 'references'> & {
  references: SavedObjectReference[] | undefined;
};

export interface SearchArgsToSOFindOptionsOptionsDefault {
  fields?: string[];
  searchFields?: string[];
}

/**
 * Builds a KQL filter string for createdBy filtering.
 * Note: createdBy is stored in saved object root level, not in attributes.
 */
const buildCreatedByFilter = (createdBy: SearchQuery['createdBy']): string | undefined => {
  if (!createdBy) return undefined;

  const includeConditions: string[] = [];
  const excludeConditions: string[] = [];

  // Include specific users
  if (createdBy.included?.length) {
    const userConditions = createdBy.included.map((uid) => `created_by:"${uid}"`);
    includeConditions.push(...userConditions);
  }

  // Include items with no creator (OR with included users)
  if (createdBy.includeNoCreator) {
    includeConditions.push('NOT created_by:*');
  }

  // Exclude specific users (AND logic - must not match any)
  if (createdBy.excluded?.length) {
    excludeConditions.push(...createdBy.excluded.map((uid) => `NOT created_by:"${uid}"`));
  }

  // Combine include (OR) and exclude (AND) conditions
  const parts: string[] = [];
  if (includeConditions.length > 0) {
    parts.push(`(${includeConditions.join(' OR ')})`);
  }
  if (excludeConditions.length > 0) {
    parts.push(excludeConditions.join(' AND '));
  }

  if (parts.length === 0) return undefined;
  return parts.join(' AND ');
};

/**
 * Builds options for favorites filtering using IDs.
 * Uses SavedObjects native ID filtering when available.
 */
const buildFavoritesFilter = (
  favorites: SearchQuery['favorites']
): { hasReference?: Array<{ type: string; id: string }> } | undefined => {
  if (!favorites?.only) return undefined;
  if (!favorites.ids?.length) {
    // If favorites.only is true but no IDs provided, return filter that matches nothing
    // We use hasReference with an impossible ID to match nothing
    return { hasReference: [{ type: '__invalid__', id: '__no_match__' }] };
  }
  // Map favorite IDs to hasReference format
  return {
    hasReference: favorites.ids.map((id) => ({ type: 'favorite', id })),
  };
};

/**
 * Builds Elasticsearch aggregations for requested facets.
 * Returns both the aggregations config and a flag indicating if any facets were requested.
 */
const buildFacetAggregations = (
  facets: SearchQuery['facets'],
  contentTypeId: string
): { aggs?: Record<string, any>; hasFacets: boolean } => {
  if (!facets) return { hasFacets: false };

  const aggs: Record<string, any> = {};
  let hasFacets = false;

  // Tag facets - tags are stored as references
  if (facets.tags) {
    hasFacets = true;
    aggs.tags = {
      nested: {
        path: `${contentTypeId}.references`,
      },
      aggs: {
        filtered_tags: {
          filter: {
            term: {
              [`${contentTypeId}.references.type`]: 'tag',
            },
          },
          aggs: {
            tag_ids: {
              terms: {
                field: `${contentTypeId}.references.id`,
                size: facets.tags.size ?? 10,
              },
            },
          },
        },
      },
    };

    // Handle missing tags if requested
    if (facets.tags.includeMissing) {
      aggs.missing_tags = {
        missing: {
          field: `${contentTypeId}.references`,
        },
      };
    }
  }

  // CreatedBy facets - created_by is a root level field
  if (facets.createdBy) {
    hasFacets = true;
    aggs.created_by = {
      terms: {
        field: 'created_by',
        size: facets.createdBy.size ?? 10,
      },
    };

    // Handle missing createdBy if requested
    if (facets.createdBy.includeMissing) {
      aggs.missing_created_by = {
        missing: {
          field: 'created_by',
        },
      };
    }
  }

  return { aggs: Object.keys(aggs).length > 0 ? aggs : undefined, hasFacets };
};

/**
 * Elasticsearch aggregation bucket structure
 */
interface AggregationBucket {
  key: string;
  doc_count: number;
}

/**
 * Expected structure of Elasticsearch aggregations response
 */
interface ElasticsearchAggregations {
  tags?: {
    filtered_tags?: {
      tag_ids?: {
        buckets?: AggregationBucket[];
      };
    };
  };
  missing_tags?: {
    doc_count?: number;
  };
  created_by?: {
    buckets?: AggregationBucket[];
  };
  missing_created_by?: {
    doc_count?: number;
  };
}

/**
 * Parses Elasticsearch aggregation results into facet format.
 */
export const parseFacetsFromAggregations = (
  aggregations: ElasticsearchAggregations | undefined,
  facetsRequested: SearchQuery['facets']
):
  | {
      tags?: Array<{ key: string; doc_count: number }>;
      createdBy?: Array<{ key: string; doc_count: number }>;
    }
  | undefined => {
  if (!aggregations || !facetsRequested) return undefined;

  const facets: {
    tags?: Array<{ key: string; doc_count: number }>;
    createdBy?: Array<{ key: string; doc_count: number }>;
  } = {};

  // Parse tag facets
  if (facetsRequested.tags && aggregations.tags?.filtered_tags?.tag_ids?.buckets) {
    const tagBuckets: AggregationBucket[] = aggregations.tags.filtered_tags.tag_ids.buckets;
    facets.tags = tagBuckets.map((bucket) => ({
      key: bucket.key,
      doc_count: bucket.doc_count,
    }));

    // Add missing count if requested and available
    if (
      facetsRequested.tags?.includeMissing &&
      aggregations.missing_tags?.doc_count !== undefined
    ) {
      facets.tags?.push({
        key: '__missing__',
        doc_count: aggregations.missing_tags.doc_count,
      });
    }
  }

  // Parse createdBy facets
  if (facetsRequested.createdBy && aggregations.created_by?.buckets) {
    const createdByBuckets: AggregationBucket[] = aggregations.created_by.buckets;
    facets.createdBy = createdByBuckets.map((bucket) => ({
      key: bucket.key,
      doc_count: bucket.doc_count,
    }));

    // Add missing count if requested and available
    if (
      facetsRequested.createdBy?.includeMissing &&
      aggregations.missing_created_by?.doc_count !== undefined
    ) {
      facets.createdBy?.push({
        key: '__missing__',
        doc_count: aggregations.missing_created_by.doc_count,
      });
    }
  }

  return Object.keys(facets).length > 0 ? facets : undefined;
};

export const searchArgsToSOFindOptionsDefault = <T extends string>(
  params: SearchIn<T, SearchArgsToSOFindOptionsOptionsDefault>
): SavedObjectsFindOptions => {
  const { query, contentTypeId, options } = params;

  const createdByFilter = buildCreatedByFilter(query.createdBy);
  const favoritesFilter = buildFavoritesFilter(query.favorites);
  const tagsFilter = tagsToFindOptions(query.tags);
  const { aggs } = buildFacetAggregations(query.facets, contentTypeId);

  // Combine hasReference from tags and favorites
  const hasReference = [
    ...(tagsFilter.hasReference || []),
    ...(favoritesFilter?.hasReference || []),
  ];

  return {
    type: contentTypeId,
    search: query.text,
    perPage: query.limit,
    page: query.cursor ? +query.cursor : undefined,
    defaultSearchOperator: 'AND',
    searchFields: options?.searchFields ?? ['description', 'title'],
    fields: options?.fields ?? ['description', 'title'],
    ...(tagsFilter.hasNoReference && { hasNoReference: tagsFilter.hasNoReference }),
    ...(hasReference.length > 0 && { hasReference }),
    ...(query.sort && {
      sortField: query.sort.field,
      sortOrder: query.sort.direction,
    }),
    ...(createdByFilter && { filter: createdByFilter }),
    ...(aggs && { aggs }),
  };
};

export const createArgsToSoCreateOptionsDefault = (
  params: SavedObjectsCreateOptions
): SavedObjectsCreateOptions => params;

export const updateArgsToSoUpdateOptionsDefault = <Types extends CMCrudTypes>(
  params: SavedObjectsUpdateOptions<Types['Attributes']>
): SavedObjectsUpdateOptions<Types['Attributes']> => params;

export type CreateArgsToSoCreateOptions<Types extends CMCrudTypes> = (
  params: Types['CreateOptions']
) => SavedObjectsCreateOptions;

export type SearchArgsToSOFindOptions<Types extends CMCrudTypes> = (
  params: Types['SearchIn']
) => SavedObjectsFindOptions;

export type UpdateArgsToSoUpdateOptions<Types extends CMCrudTypes> = (
  params: Types['UpdateOptions']
) => SavedObjectsUpdateOptions<Types['Attributes']>;

export interface SOContentStorageConstructorParams<Types extends CMCrudTypes> {
  savedObjectType: string;
  cmServicesDefinition: ServicesDefinitionSet;
  // this is necessary since unexpected saved object attributes could cause schema validation to fail
  allowedSavedObjectAttributes: Array<keyof Types['Attributes']>;
  createArgsToSoCreateOptions?: CreateArgsToSoCreateOptions<Types>;
  updateArgsToSoUpdateOptions?: UpdateArgsToSoUpdateOptions<Types>;
  searchArgsToSOFindOptions?: SearchArgsToSOFindOptions<Types>;
  /**
   * MSearch is a feature that allows searching across multiple content types
   * (for example, could be used in a general content finder or the like)
   *
   * defaults to false
   */
  enableMSearch?: boolean;
  mSearchAdditionalSearchFields?: string[];

  logger: Logger;
  throwOnResultValidationError: boolean;
}

export abstract class SOContentStorage<Types extends CMCrudTypes>
  implements
    ContentStorage<
      Types['Item'],
      Types['PartialItem'],
      MSearchConfig<Types['Item'], Types['Attributes']>
    >
{
  constructor({
    savedObjectType,
    cmServicesDefinition,
    createArgsToSoCreateOptions,
    updateArgsToSoUpdateOptions,
    searchArgsToSOFindOptions,
    enableMSearch,
    allowedSavedObjectAttributes,
    mSearchAdditionalSearchFields,
    logger,
    throwOnResultValidationError,
  }: SOContentStorageConstructorParams<Types>) {
    this.logger = logger;
    this.throwOnResultValidationError = throwOnResultValidationError ?? false;
    this.savedObjectType = savedObjectType;
    this.cmServicesDefinition = cmServicesDefinition;
    this.createArgsToSoCreateOptions =
      createArgsToSoCreateOptions || createArgsToSoCreateOptionsDefault;
    this.updateArgsToSoUpdateOptions =
      updateArgsToSoUpdateOptions || updateArgsToSoUpdateOptionsDefault;
    this.searchArgsToSOFindOptions = searchArgsToSOFindOptions || searchArgsToSOFindOptionsDefault;
    this.allowedSavedObjectAttributes = allowedSavedObjectAttributes;

    if (enableMSearch) {
      this.mSearch = {
        savedObjectType: this.savedObjectType,
        additionalSearchFields: mSearchAdditionalSearchFields,
        toItemResult: (ctx: StorageContext, savedObject: SavedObjectsFindResult): Types['Item'] => {
          const transforms = ctx.utils.getTransforms(this.cmServicesDefinition);

          const contentItem = this.savedObjectToItem(
            savedObject as SavedObjectsFindResult<Types['Attributes']>
          );

          const validationError = transforms.mSearch.out.result.validate(contentItem);
          if (validationError) {
            if (this.throwOnResultValidationError) {
              throw Boom.badRequest(`Invalid response. ${validationError.message}`);
            } else {
              this.logger.warn(`Invalid response. ${validationError.message}`);
            }
          }

          // Validate DB response and DOWN transform to the request version
          const { value, error: resultError } = transforms.mSearch.out.result.down<
            Types['Item'],
            Types['Item']
          >(
            contentItem,
            undefined, // do not override version
            { validate: false } // validation is done above
          );

          if (resultError) {
            throw Boom.badRequest(`Invalid response. ${resultError.message}`);
          }

          return value;
        },
      };
    }
  }

  protected static getSOClientFromRequest = async (ctx: StorageContext) => {
    if (!ctx.requestHandlerContext) {
      throw new Error('Storage context.requestHandlerContext missing.');
    }

    const { savedObjects } = await ctx.requestHandlerContext.core;
    return savedObjects.client;
  };

  protected readonly throwOnResultValidationError: boolean;
  protected readonly logger: Logger;
  protected readonly savedObjectType: SOContentStorageConstructorParams<Types>['savedObjectType'];
  protected readonly cmServicesDefinition: SOContentStorageConstructorParams<Types>['cmServicesDefinition'];
  protected readonly createArgsToSoCreateOptions: CreateArgsToSoCreateOptions<Types>;
  protected readonly updateArgsToSoUpdateOptions: UpdateArgsToSoUpdateOptions<Types>;
  protected readonly searchArgsToSOFindOptions: SearchArgsToSOFindOptions<Types>;
  protected readonly allowedSavedObjectAttributes: Array<keyof Types['Attributes']>;

  protected savedObjectToItem(savedObject: SavedObject<Types['Attributes']>): Types['Item'];
  protected savedObjectToItem(
    savedObject: PartialSavedObject<Types['Attributes']>,
    partial: true
  ): Types['PartialItem'];
  protected savedObjectToItem(
    savedObject:
      | SavedObject<Types['Attributes']>
      | PartialSavedObject<Types['Attributes']>
      | SavedObjectsFindResult<Types['Attributes']>
  ): SOWithMetadata | SOWithMetadataPartial {
    const {
      id,
      type,
      updated_at: updatedAt,
      updated_by: updatedBy,
      created_at: createdAt,
      created_by: createdBy,
      attributes,
      references,
      namespaces,
      version,
      managed,
    } = savedObject;

    return {
      id,
      type,
      managed,
      updatedBy,
      updatedAt,
      createdAt,
      createdBy,
      attributes: pick(attributes, this.allowedSavedObjectAttributes),
      references,
      namespaces,
      version,
    };
  }

  mSearch?: {
    savedObjectType: string;
    toItemResult: (ctx: StorageContext, savedObject: SavedObjectsFindResult) => Types['Item'];
    additionalSearchFields?: string[];
  };

  async get(ctx: StorageContext, id: string): Promise<Types['GetOut']> {
    const transforms = ctx.utils.getTransforms(this.cmServicesDefinition);
    const soClient = await SOContentStorage.getSOClientFromRequest(ctx);

    // Save data in DB
    const {
      saved_object: savedObject,
      alias_purpose: aliasPurpose,
      alias_target_id: aliasTargetId,
      outcome,
    } = await soClient.resolve<Types['Attributes']>(this.savedObjectType, id);

    if (isSavedObjectErrorResult(savedObject)) {
      throw Boom.notFound(savedObject.error.message);
    }

    const response: Types['GetOut'] = {
      item: this.savedObjectToItem(savedObject),
      meta: {
        aliasPurpose,
        aliasTargetId,
        outcome,
      },
    };

    const validationError = transforms.get.out.result.validate(response);
    if (validationError) {
      if (this.throwOnResultValidationError) {
        throw Boom.badRequest(`Invalid response. ${validationError.message}`);
      } else {
        this.logger.warn(`Invalid response. ${validationError.message}`);
      }
    }

    // Validate DB response and DOWN transform to the request version
    const { value, error: resultError } = transforms.get.out.result.down<
      Types['GetOut'],
      Types['GetOut']
    >(
      response,
      undefined, // do not override version
      { validate: false } // validation is done above
    );

    if (resultError) {
      throw Boom.badRequest(`Invalid response. ${resultError.message}`);
    }

    return value;
  }

  async bulkGet(): Promise<never> {
    // Not implemented
    throw new Error(`[bulkGet] has not been implemented. See ${this.constructor.name} class.`);
  }

  async create(
    ctx: StorageContext,
    data: Types['Attributes'],
    options: Types['CreateOptions']
  ): Promise<Types['CreateOut']> {
    const transforms = ctx.utils.getTransforms(this.cmServicesDefinition);
    const soClient = await SOContentStorage.getSOClientFromRequest(ctx);

    // Validate input (data & options) & UP transform them to the latest version
    const { value: dataToLatest, error: dataError } = transforms.create.in.data.up<
      Types['Attributes'],
      Types['Attributes']
    >(data);
    if (dataError) {
      throw Boom.badRequest(`Invalid data. ${dataError.message}`);
    }

    const { value: optionsToLatest, error: optionsError } = transforms.create.in.options.up<
      Types['CreateOptions'],
      Types['CreateOptions']
    >(options);
    if (optionsError) {
      throw Boom.badRequest(`Invalid options. ${optionsError.message}`);
    }

    const createOptions = this.createArgsToSoCreateOptions(optionsToLatest);

    // Save data in DB
    const savedObject = await soClient.create<Types['Attributes']>(
      this.savedObjectType,
      dataToLatest,
      createOptions
    );

    const result = {
      item: this.savedObjectToItem(savedObject),
    };

    const validationError = transforms.create.out.result.validate(result);
    if (validationError) {
      if (this.throwOnResultValidationError) {
        throw Boom.badRequest(`Invalid response. ${validationError.message}`);
      } else {
        this.logger.warn(`Invalid response. ${validationError.message}`);
      }
    }

    // Validate DB response and DOWN transform to the request version
    const { value, error: resultError } = transforms.create.out.result.down<
      Types['CreateOut'],
      Types['CreateOut']
    >(
      result,
      undefined, // do not override version
      { validate: false } // validation is done above
    );

    if (resultError) {
      throw Boom.badRequest(`Invalid response. ${resultError.message}`);
    }

    return value;
  }

  async update(
    ctx: StorageContext,
    id: string,
    data: Types['Attributes'],
    options: Types['UpdateOptions']
  ): Promise<Types['UpdateOut']> {
    const transforms = ctx.utils.getTransforms(this.cmServicesDefinition);
    const soClient = await SOContentStorage.getSOClientFromRequest(ctx);

    // Validate input (data & options) & UP transform them to the latest version
    const { value: dataToLatest, error: dataError } = transforms.update.in.data.up<
      Types['Attributes'],
      Types['Attributes']
    >(data);
    if (dataError) {
      throw Boom.badRequest(`Invalid data. ${dataError.message}`);
    }

    const { value: optionsToLatest, error: optionsError } = transforms.update.in.options.up<
      Types['UpdateOptions'],
      Types['UpdateOptions']
    >(options);
    if (optionsError) {
      throw Boom.badRequest(`Invalid options. ${optionsError.message}`);
    }

    const updateOptions = this.updateArgsToSoUpdateOptions(optionsToLatest);

    // Save data in DB
    const partialSavedObject = await soClient.update<Types['Attributes']>(
      this.savedObjectType,
      id,
      dataToLatest,
      updateOptions
    );

    const result = {
      item: this.savedObjectToItem(partialSavedObject, true),
    };

    const validationError = transforms.update.out.result.validate(result);
    if (validationError) {
      if (this.throwOnResultValidationError) {
        throw Boom.badRequest(`Invalid response. ${validationError.message}`);
      } else {
        this.logger.warn(`Invalid response. ${validationError.message}`);
      }
    }

    // Validate DB response and DOWN transform to the request version
    const { value, error: resultError } = transforms.update.out.result.down<
      Types['UpdateOut'],
      Types['UpdateOut']
    >(
      result,
      undefined, // do not override version
      { validate: false } // validation is done above
    );

    if (resultError) {
      throw Boom.badRequest(`Invalid response. ${resultError.message}`);
    }

    return value;
  }

  async delete(
    ctx: StorageContext,
    id: string,
    // force is necessary to delete saved objects that exist in multiple namespaces
    options?: { force: boolean }
  ): Promise<Types['DeleteOut']> {
    const soClient = await SOContentStorage.getSOClientFromRequest(ctx);
    await soClient.delete(this.savedObjectType, id, { force: options?.force ?? false });
    return { success: true };
  }

  async search(
    ctx: StorageContext,
    query: SearchQuery,
    options: Types['SearchOptions'] = {}
  ): Promise<Types['SearchOut']> {
    const transforms = ctx.utils.getTransforms(this.cmServicesDefinition);
    const soClient = await SOContentStorage.getSOClientFromRequest(ctx);

    // Validate and UP transform the options
    const { value: optionsToLatest, error: optionsError } = transforms.search.in.options.up<
      Types['SearchOptions'],
      Types['SearchOptions']
    >(options);
    if (optionsError) {
      throw Boom.badRequest(`Invalid payload. ${optionsError.message}`);
    }

    const soQuery: SavedObjectsFindOptions = this.searchArgsToSOFindOptions({
      contentTypeId: this.savedObjectType,
      query,
      options: optionsToLatest,
    });
    // Execute the query in the DB
    const soResponse = await soClient.find<Types['Attributes']>(soQuery);
    const facets = parseFacetsFromAggregations(soResponse.aggregations, query.facets);
    const response = {
      hits: soResponse.saved_objects.map((so) => this.savedObjectToItem(so)),
      pagination: {
        total: soResponse.total,
      },
      ...(facets && { facets }),
    };

    const validationError = transforms.search.out.result.validate(response);
    if (validationError) {
      if (this.throwOnResultValidationError) {
        throw Boom.badRequest(`Invalid response. ${validationError.message}`);
      } else {
        this.logger.warn(`Invalid response. ${validationError.message}`);
      }
    }

    // Validate the response and DOWN transform to the request version
    const { value, error: resultError } = transforms.search.out.result.down<
      Types['SearchOut'],
      Types['SearchOut']
    >(
      response,
      undefined, // do not override version
      { validate: false } // validation is done above
    );

    if (resultError) {
      throw Boom.badRequest(`Invalid response. ${resultError.message}`);
    }

    return value;
  }
}
