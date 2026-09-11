/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty } from 'lodash';
import { INITIAL_REST_VERSION, SYNTHETICS_API_URLS } from '../../../../../common/constants';
import type {
  DeleteParamsResponse,
  SyntheticsParamRequest,
  SyntheticsParams,
} from '../../../../../common/runtime_types';
import {
  SyntheticsParamsCodec,
  SyntheticsParamsReadonlyCodec,
  SyntheticsParamsReadonlyCodecList,
} from '../../../../../common/runtime_types/zod/synthetics_params';
import { apiService } from '../../../../utils/api_service/api_service';

export const getGlobalParams = async (): Promise<SyntheticsParams[]> => {
  return apiService.get<SyntheticsParams[]>(
    SYNTHETICS_API_URLS.PARAMS,
    { version: INITIAL_REST_VERSION },
    SyntheticsParamsReadonlyCodecList
  );
};

export const addGlobalParam = async (
  paramRequest: SyntheticsParamRequest
): Promise<SyntheticsParams> =>
  apiService.post(SYNTHETICS_API_URLS.PARAMS, paramRequest, SyntheticsParamsReadonlyCodec, {
    version: INITIAL_REST_VERSION,
  });

export const editGlobalParam = async ({
  paramRequest,
  id,
}: {
  id: string;
  paramRequest: Partial<SyntheticsParamRequest>;
}): Promise<SyntheticsParams> => {
  const data = paramRequest;
  if (isEmpty(paramRequest.value)) {
    // omit empty value
    delete data.value;
  }
  return await apiService.put<SyntheticsParams>(
    SYNTHETICS_API_URLS.PARAMS + `/${id}`,
    data,
    SyntheticsParamsCodec,
    {
      version: INITIAL_REST_VERSION,
    }
  );
};

export const deleteGlobalParams = async (ids: string[]): Promise<DeleteParamsResponse[]> => {
  return await apiService.post(
    SYNTHETICS_API_URLS.PARAMS + '/_bulk_delete',
    {
      ids,
    },
    null,
    { version: INITIAL_REST_VERSION }
  );
};
