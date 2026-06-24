/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SYNTHETICS_API_URLS } from '../../../../../common/constants';
import type { CertFacets, CertResult, GetCertsParams } from '../../../../../common/runtime_types';
import { apiService } from '../../../../utils/api_service/api_service';

const toParam = (values?: string[]) => (values && values.length > 0 ? values.join(',') : undefined);

export const getCertsList = async (queryParams: GetCertsParams): Promise<CertResult> => {
  const {
    pageIndex,
    size,
    search,
    sortBy,
    direction,
    monitorTypes,
    browserResourceTypes,
    party,
    tags,
    issuers,
    notValidAfter,
    remoteNames,
  } = queryParams;
  const result = (await apiService.get(SYNTHETICS_API_URLS.CERTS, {
    pageIndex,
    size,
    search,
    sortBy,
    direction,
    monitorTypes: toParam(monitorTypes),
    browserResourceTypes: toParam(browserResourceTypes),
    party: toParam(party),
    tags: toParam(tags),
    issuers: toParam(issuers),
    notValidAfter,
    remoteNames: toParam(remoteNames),
  })) as {
    data: CertResult;
  };
  return result.data;
};

export const getCertFacets = async (remoteNames?: string[]): Promise<CertFacets> => {
  const result = (await apiService.get(SYNTHETICS_API_URLS.CERTS_FACETS, {
    remoteNames: toParam(remoteNames),
  })) as {
    data: CertFacets;
  };
  return result.data;
};
