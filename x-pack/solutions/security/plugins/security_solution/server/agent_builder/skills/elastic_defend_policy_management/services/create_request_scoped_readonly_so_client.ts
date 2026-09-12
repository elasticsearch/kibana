/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { SECURITY_EXTENSION_ID } from '@kbn/core-saved-objects-server';
import type { KibanaRequest, StartServicesAccessor } from '@kbn/core/server';

export class PolicyReadonlySoClientMethodNotAllowedError extends Error {
  constructor(methodName: string) {
    super(`Method [${methodName}] not allowed on readonly SO client`);
    this.name = 'PolicyReadonlySoClientMethodNotAllowedError';
  }
}

const METHOD_CLASSIFICATION: Record<
  keyof SavedObjectsClientContract,
  'read' | 'blocked' | 'wrapped'
> = {
  create: 'blocked',
  bulkCreate: 'blocked',
  update: 'blocked',
  bulkUpdate: 'blocked',
  delete: 'blocked',
  bulkDelete: 'blocked',
  removeReferencesTo: 'blocked',
  updateObjectsSpaces: 'blocked',
  changeOwnership: 'blocked',
  changeAccessMode: 'blocked',
  createPointInTimeFinder: 'blocked',
  asScopedToNamespace: 'wrapped',
  checkConflicts: 'read',
  find: 'read',
  search: 'read',
  esql: 'read',
  bulkGet: 'read',
  get: 'read',
  bulkResolve: 'read',
  resolve: 'read',
  openPointInTimeForType: 'read',
  closePointInTime: 'read',
  collectMultiNamespaceReferences: 'read',
  getCurrentNamespace: 'read',
};

const wrapReadonly = (soClient: SavedObjectsClientContract): SavedObjectsClientContract =>
  new Proxy(soClient, {
    get(target: SavedObjectsClientContract, property: string | symbol, receiver: unknown): unknown {
      if (typeof property !== 'string' || !(property in METHOD_CLASSIFICATION)) {
        return Reflect.get(target, property, receiver);
      }

      const methodName = property as keyof SavedObjectsClientContract;
      const classification = METHOD_CLASSIFICATION[methodName];

      if (classification === 'blocked') {
        throw new PolicyReadonlySoClientMethodNotAllowedError(methodName);
      }

      if (classification === 'wrapped') {
        return (namespace: string): SavedObjectsClientContract =>
          wrapReadonly(target.asScopedToNamespace(namespace));
      }

      return Reflect.get(target, methodName, receiver);
    },
  });

export const createRequestScopedReadonlySoClient = async ({
  getStartServices,
  request,
}: {
  getStartServices: StartServicesAccessor;
  request: KibanaRequest;
}): Promise<SavedObjectsClientContract> => {
  const [coreStart] = await getStartServices();
  const soClient = coreStart.savedObjects.getScopedClient(request, {
    excludedExtensions: [SECURITY_EXTENSION_ID],
  });

  return wrapReadonly(soClient);
};
