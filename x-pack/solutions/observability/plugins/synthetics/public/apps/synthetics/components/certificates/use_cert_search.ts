/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useContext, useEffect } from 'react';

import { useDispatch, useSelector } from 'react-redux';
import { getCertsListAction, selectCertsListState } from '../../state/certs';
import {
  DEFAULT_DIRECTION,
  DEFAULT_SIZE,
  DEFAULT_SORT,
} from '../../../../../common/requests/get_certs_request_body';
import type { CertResult, GetCertsParams } from '../../../../../common/runtime_types';
import { SyntheticsRefreshContext } from '../../contexts';

export const useCertSearch = ({
  pageIndex,
  size = DEFAULT_SIZE,
  search,
  sortBy = DEFAULT_SORT,
  direction = DEFAULT_DIRECTION,
  monitorTypes,
  browserResourceTypes,
  party,
  tags,
  issuers,
  notValidAfter,
  remoteNames,
}: GetCertsParams): CertResult & { isLoading?: boolean } => {
  const { lastRefresh } = useContext(SyntheticsRefreshContext);

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(
      getCertsListAction.get({
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
      })
    );
  }, [
    direction,
    dispatch,
    lastRefresh,
    pageIndex,
    search,
    size,
    sortBy,
    monitorTypes,
    browserResourceTypes,
    party,
    tags,
    issuers,
    notValidAfter,
    remoteNames,
  ]);

  const { data, isLoading } = useSelector(selectCertsListState);

  return { ...(data ?? { certs: [], total: 0 }), isLoading };
};
