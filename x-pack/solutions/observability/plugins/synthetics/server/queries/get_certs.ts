/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PromiseType } from 'utility-types';
import type { CertResult, GetCertsParams, Ping } from '../../common/runtime_types';
import type { GetCertsRequestBodyOptions } from '../../common/requests/get_certs_request_body';
import {
  getCertsRequestBody,
  processCertsResult,
} from '../../common/requests/get_certs_request_body';
import type { SyntheticsEsClient } from '../lib';

export type GetSyntheticsCertsParams = GetCertsParams & {
  syntheticsEsClient: SyntheticsEsClient;
} & GetCertsRequestBodyOptions;

export const getSyntheticsCerts = async (
  requestParams: GetSyntheticsCertsParams
): Promise<CertResult> => {
  const result = await getCertsResults(requestParams);

  return processCertsResult(result);
};

export type CertificatesResults = PromiseType<ReturnType<typeof getCertsResults>>;

const getCertsResults = async (requestParams: GetSyntheticsCertsParams) => {
  const { syntheticsEsClient, ccsEnabled, remoteNames, spaceId, showFromAllSpaces, ...rest } =
    requestParams;

  const searchBody = getCertsRequestBody(rest, {
    ccsEnabled,
    remoteNames,
    spaceId,
    showFromAllSpaces,
  });

  const { body: result } = await syntheticsEsClient.search<Ping, typeof searchBody>(searchBody);

  return result;
};
