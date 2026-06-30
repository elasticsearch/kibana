/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { RegionPolicyBody, RegionPolicyResponse } from '../../common/types';

const REGION_POLICY_PATH = '/_inference/_region_policy';

export const getRegionPolicy = async (
  client: ElasticsearchClient
): Promise<RegionPolicyResponse> => {
  return client.transport.request<RegionPolicyResponse>({
    method: 'GET',
    path: REGION_POLICY_PATH,
  });
};

export const putRegionPolicy = async (
  client: ElasticsearchClient,
  body: RegionPolicyBody
): Promise<RegionPolicyResponse> => {
  return client.transport.request<RegionPolicyResponse>({
    method: 'PUT',
    path: REGION_POLICY_PATH,
    body: { region_policy: body },
  });
};

export const deleteRegionPolicy = async (client: ElasticsearchClient): Promise<void> => {
  await client.transport.request({
    method: 'DELETE',
    path: REGION_POLICY_PATH,
  });
};
