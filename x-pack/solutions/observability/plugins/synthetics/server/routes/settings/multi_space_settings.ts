/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { SyntheticsMultiSpaceSettingsWithSpaces } from '../../../common/runtime_types';
import { SYNTHETICS_API_URLS } from '../../../common/constants';
import { isCCSEnabled } from '../../lib/remote_result_utils';
import { DefaultSyntheticsMultiSpaceSettingsRepository } from '../../services/synthetics_multi_space_settings_repository';
import type { SyntheticsRestApiRouteFactory } from '../types';

const MAX_SELECTED_REMOTE_CLUSTERS = 100;
const MAX_SHARED_SPACES = 1_000;

export const SyntheticsMultiSpaceSettingsSchema = schema.object({
  useAllRemoteClusters: schema.maybe(schema.boolean()),
  selectedRemoteClusters: schema.maybe(
    schema.arrayOf(schema.string(), { maxSize: MAX_SELECTED_REMOTE_CLUSTERS })
  ),
  // Optional list of spaces the settings should be shared with. Accepts `*` for "all spaces".
  spaces: schema.maybe(
    schema.arrayOf(schema.string({ minLength: 1 }), {
      minSize: 1,
      maxSize: MAX_SHARED_SPACES,
    })
  ),
});

export const createGetMultiSpaceSettingsRoute: SyntheticsRestApiRouteFactory<
  SyntheticsMultiSpaceSettingsWithSpaces
> = () => ({
  method: 'GET',
  path: SYNTHETICS_API_URLS.MULTI_SPACE_SETTINGS,
  validate: false,
  handler: async ({ savedObjectsClient, server, response }) => {
    // Mirror the UI's gating: the endpoint must not exist on serverless (where CCS is
    // unavailable), so external clients can't write a `synthetics-settings-multi-space`
    // SO that nothing else respects.
    if (!isCCSEnabled(server)) {
      return response.notFound();
    }
    const repository = new DefaultSyntheticsMultiSpaceSettingsRepository(savedObjectsClient);
    return repository.get();
  },
});

export const createPutMultiSpaceSettingsRoute: SyntheticsRestApiRouteFactory<
  SyntheticsMultiSpaceSettingsWithSpaces
> = () => ({
  method: 'PUT',
  path: SYNTHETICS_API_URLS.MULTI_SPACE_SETTINGS,
  validate: {
    body: SyntheticsMultiSpaceSettingsSchema,
  },
  writeAccess: true,
  handler: async ({ savedObjectsClient, request, server, response }) => {
    if (!isCCSEnabled(server)) {
      return response.notFound();
    }
    const repository = new DefaultSyntheticsMultiSpaceSettingsRepository(savedObjectsClient);
    const { spaces, ...attributes } = request.body;
    return repository.save(attributes, spaces);
  },
});
