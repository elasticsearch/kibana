/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { partition, remove, uniq } from 'lodash';
import type { KueryNode } from '@kbn/es-query';
import { nodeBuilder } from '@kbn/es-query';
import type { SavedObject } from '@kbn/core-saved-objects-server';
import { CASE_ATTACHMENT_SAVED_OBJECT, OWNER_FIELD } from '../../common/constants';
import type { Authorization } from './authorization';
import type { AuthFilterHelpers, OperationDetails } from './types';

export const getOwnersFilter = (
  savedObjectType: string,
  owners: string[]
): KueryNode | undefined => {
  if (owners.length <= 0) {
    return;
  }

  return nodeBuilder.or(
    owners.reduce<KueryNode[]>((query, owner) => {
      ensureFieldIsSafeForQuery(OWNER_FIELD, owner);
      query.push(nodeBuilder.is(`${savedObjectType}.attributes.${OWNER_FIELD}`, owner));
      return query;
    }, [])
  );
};

export const combineFilterWithAuthorizationFilter = (
  filter?: KueryNode,
  authorizationFilter?: KueryNode
) => {
  if (!filter && !authorizationFilter) {
    return;
  }

  const kueries = [
    ...(filter !== undefined ? [filter] : []),
    ...(authorizationFilter !== undefined ? [authorizationFilter] : []),
  ];
  return nodeBuilder.and(kueries);
};

export const ensureFieldIsSafeForQuery = (field: string, value: string): boolean => {
  const matches = value.match(/([>=<\*:()]+|\s+)/g);
  if (matches) {
    const invalid = Array.from(matches);
    const whitespace = remove(invalid, (chars) => chars.trim().length === 0);
    const errors = [];
    if (whitespace.length) {
      errors.push(`whitespace`);
    }
    if (invalid.length) {
      errors.push(`invalid character${invalid.length > 1 ? `s` : ``}: ${invalid?.join(`, `)}`);
    }
    throw new Error(`expected ${field} not to include ${errors.join(' and ')}`);
  }
  return true;
};

export const includeFieldsRequiredForAuthentication = (fields?: string[]): string[] | undefined => {
  if (fields === undefined || fields.length === 0) {
    return;
  }
  return uniq([...fields, OWNER_FIELD]);
};

/**
 * Returns an authorization filter that covers both the legacy `cases-comments`
 * and the unified `cases-attachments` saved object types.
 */
export const getAttachmentAuthorizationFilter = async (
  authorization: Pick<Authorization, 'getAuthorizationFilter'>,
  operation: OperationDetails
): Promise<AuthFilterHelpers> => {
  const { filter, authorizedOwners, ensureSavedObjectsAreAuthorized } =
    await authorization.getAuthorizationFilter(operation);

  const unifiedFilter = authorizedOwners?.length
    ? getOwnersFilter(CASE_ATTACHMENT_SAVED_OBJECT, authorizedOwners)
    : undefined;

  const combinedFilter =
    filter && unifiedFilter ? nodeBuilder.or([filter, unifiedFilter]) : filter ?? unifiedFilter;

  return {
    filter: combinedFilter,
    authorizedOwners,
    ensureSavedObjectsAreAuthorized,
  };
};

export const groupByAuthorization = <T extends { owner: string }>(
  savedObjects: Array<SavedObject<T>>,
  authorizedOwners: string[]
): { authorized: Array<SavedObject<T>>; unauthorized: Array<SavedObject<T>> } => {
  const [authorized, unauthorized] = partition(savedObjects, (so) =>
    authorizedOwners.includes(so.attributes.owner)
  );

  return { authorized, unauthorized };
};
