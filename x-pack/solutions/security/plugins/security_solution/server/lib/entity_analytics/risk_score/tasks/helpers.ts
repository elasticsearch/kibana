/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import datemath from '@kbn/datemath';

import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import type { CoreStart } from '@kbn/core-lifecycle-server';
import { SECURITY_EXTENSION_ID, SPACES_EXTENSION_ID } from '@kbn/core-saved-objects-server';
import { asSpaceId } from '@kbn/core-spaces-common';
import type { Range } from '../../../../../common/entity_analytics/risk_engine';

export const convertDateToISOString = (dateString: string): string => {
  const date = datemath.parse(dateString);

  if (date?.isValid()) {
    return date.toISOString();
  } else {
    throw new Error(`Could not convert string "${dateString}" to ISO string`);
  }
};

export const convertRangeToISO = (range: Range): Range => ({
  start: convertDateToISOString(range.start),
  end: convertDateToISOString(range.end),
});

/**
 *  Builds a SavedObjectsClient scoped to the given namespace. This should be used with caution, and only in cases where a real kibana request is not available to build a proper scoped client (e.g. a task manager task).
 *
 __Note__: Because the kibana system user cannot access SavedObjects itself, this client does not have the security extension enabled, which has (negative) implications both for logging and for security.
 * @param coreStart CoreStart plugin context
 * @param namespace the namespace to which the client should be scoped
 * @returns a SavedObjectsClient scoped to the given namespace
 */
export const buildScopedInternalSavedObjectsClientUnsafe = ({
  coreStart,
  namespace,
  includedHiddenTypes,
}: {
  coreStart: CoreStart;
  namespace: string;
  includedHiddenTypes?: string[];
}) => {
  const fakeScopedRequest = kibanaRequestFactory({
    headers: {},
    spaceId: asSpaceId(namespace),
  });

  return coreStart.savedObjects.getScopedClient(fakeScopedRequest, {
    excludedExtensions: [SECURITY_EXTENSION_ID],
    includedHiddenTypes,
  });
};

/**
 * Builds an internal SavedObjectsClient with security/spaces extensions disabled.
 * Intended for background execution paths where no authenticated request exists.
 */
export const buildInternalSavedObjectsClientUnsafe = ({ coreStart }: { coreStart: CoreStart }) => {
  return coreStart.savedObjects.getUnsafeInternalClient({
    excludedExtensions: [SECURITY_EXTENSION_ID, SPACES_EXTENSION_ID],
  });
};
