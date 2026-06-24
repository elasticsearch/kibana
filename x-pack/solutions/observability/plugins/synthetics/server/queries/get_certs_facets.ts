/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CertFacets, Ping } from '../../common/runtime_types';
import type { GetCertsFacetsRequestBodyOptions } from '../../common/requests/get_certs_facets_request_body';
import {
  getCertsFacetsRequestBody,
  processCertsFacetsResult,
} from '../../common/requests/get_certs_facets_request_body';
import type { SyntheticsEsClient } from '../lib';

interface GetCertsFacetsParams {
  syntheticsEsClient: SyntheticsEsClient;
  monitorIds?: string[];
  from?: string;
  to?: string;
}

export const getSyntheticsCertsFacets = async ({
  syntheticsEsClient,
  ccsEnabled,
  remoteNames,
  spaceId,
  showFromAllSpaces,
  ...params
}: GetCertsFacetsParams & GetCertsFacetsRequestBodyOptions): Promise<CertFacets> => {
  const searchBody = getCertsFacetsRequestBody(params, {
    ccsEnabled,
    remoteNames,
    spaceId,
    showFromAllSpaces,
  });

  const { body: result } = await syntheticsEsClient.search<Ping, typeof searchBody>(searchBody);

  return processCertsFacetsResult(
    result.aggregations as Parameters<typeof processCertsFacetsResult>[0]
  );
};
