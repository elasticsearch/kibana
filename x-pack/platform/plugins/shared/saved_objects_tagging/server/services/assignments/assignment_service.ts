/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniq, difference } from 'lodash';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type {
  SavedObjectsClientContract,
  ISavedObjectTypeRegistry,
  KibanaRequest,
  SavedObjectsBulkGetObject,
} from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import type { SecurityPluginSetup } from '@kbn/security-plugin/server';
import type {
  AssignableObject,
  UpdateTagAssignmentsOptions,
  FindAssignableObjectsOptions,
  ObjectReference,
} from '../../../common/assignments';
import { getKey } from '../../../common/assignments';
import { updateTagReferences } from '../../../common/references';
import { taggableTypes } from '../../../common/constants';
import { getUpdatableSavedObjectTypes } from './get_updatable_types';
import { AssignmentError } from './errors';
import { toAssignableObject } from './utils';

interface AssignmentServiceOptions {
  request?: KibanaRequest;
  client: SavedObjectsClientContract;
  typeRegistry: ISavedObjectTypeRegistry;
  authorization?: SecurityPluginSetup['authz'];
  internal?: boolean;
}

export type IAssignmentService = PublicMethodsOf<AssignmentService>;

export class AssignmentService {
  private readonly soClient: SavedObjectsClientContract;
  private readonly typeRegistry: ISavedObjectTypeRegistry;
  private readonly authorization?: SecurityPluginSetup['authz'];
  private readonly request?: KibanaRequest;
  private readonly internal: boolean;

  constructor({
    client,
    typeRegistry,
    authorization,
    request,
    internal = false,
  }: AssignmentServiceOptions) {
    if (!internal && !request) {
      throw new Error('request required for non-internal usages');
    }
    this.internal = internal;
    this.soClient = client;
    this.typeRegistry = typeRegistry;
    this.authorization = authorization;
    this.request = request;
  }

  public async findAssignableObjects({
    search,
    types,
    maxResults = 100,
  }: FindAssignableObjectsOptions): Promise<AssignableObject[]> {
    const searchedTypes = (
      types ? types.filter((type) => taggableTypes.includes(type)) : taggableTypes
    ).filter((type) => this.typeRegistry.getType(type) !== undefined);
    const assignableTypes = await this.getAssignableTypes(searchedTypes);

    // if no provided type was assignable, return an empty list instead of throwing an error
    if (assignableTypes.length === 0) {
      return [];
    }

    const searchFields = uniq(
      assignableTypes.map(
        (name) => this.typeRegistry.getType(name)?.management!.defaultSearchField!
      )
    );

    const findResponse = await this.soClient.find({
      page: 1,
      perPage: maxResults,
      search,
      type: assignableTypes,
      searchFields,
    });

    return findResponse.saved_objects.map((object) =>
      toAssignableObject(object, this.typeRegistry.getType(object.type)!)
    );
  }

  public async getAssignableTypes(types?: string[]) {
    if (this.internal) {
      return types ?? taggableTypes;
    }
    return getUpdatableSavedObjectTypes({
      request: this.request!,
      types: types ?? taggableTypes,
      authorization: this.authorization,
    });
  }

  public async updateTagAssignments({
    tags,
    assign,
    unassign,
    refresh,
  }: UpdateTagAssignmentsOptions) {
    const updatedTypes = uniq([...assign, ...unassign].map(({ type }) => type));

    const untaggableTypes = difference(updatedTypes, taggableTypes);
    if (untaggableTypes.length) {
      throw new AssignmentError(`Unsupported type [${untaggableTypes.join(', ')}]`, 400);
    }

    const assignableTypes = await this.getAssignableTypes();
    const forbiddenTypes = difference(updatedTypes, assignableTypes);
    if (forbiddenTypes.length) {
      throw new AssignmentError(`Forbidden type [${forbiddenTypes.join(', ')}]`, 403);
    }

    const { saved_objects: objects } = await this.soClient.bulkGet([
      ...assign.map(referenceToBulkGet),
      ...unassign.map(referenceToBulkGet),
    ]);

    // if we failed to fetch any object, just halt and throw an error
    const firstObjWithError = objects.find(isSavedObjectErrorResult);
    if (firstObjWithError) {
      const firstError = firstObjWithError.error!;
      throw new AssignmentError(firstError.message, firstError.statusCode);
    }

    const toAssign = new Set(assign.map(getKey));
    const toUnassign = new Set(unassign.map(getKey));

    const updatedObjects = objects.map((object) => {
      return {
        id: object.id,
        type: object.type,
        // partial update. this will not update any attribute
        attributes: {},
        references: updateTagReferences({
          references: object.references,
          toAdd: toAssign.has(getKey(object)) ? tags : [],
          toRemove: toUnassign.has(getKey(object)) ? tags : [],
        }),
      };
    });

    await this.soClient.bulkUpdate(updatedObjects, { refresh });
  }
}

const referenceToBulkGet = ({ type, id }: ObjectReference): SavedObjectsBulkGetObject => ({
  type,
  id,
  // we only need `type`, `id` and `references` that are included by default.
  fields: [],
});
