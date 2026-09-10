/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React, { createContext, useContext } from 'react';
import { useFetcher } from '@kbn/observability-shared-plugin/public';
import type { DataViewsPublicPluginStart, DataView } from '@kbn/data-views-plugin/public';
import { SYNTHETICS_INDEX_PATTERN } from '../../../../common/constants';
import { useCanReadSyntheticsIndex } from '../../../hooks/use_capabilities';

// TODO: This should be changed to createContext<DataView | undefined> because this is the type returned by useFetcher, not changing it because not sure of the side effects
export const SyntheticsDataViewContext = createContext({} as DataView);

export const SyntheticsDataViewContextProvider: FC<
  PropsWithChildren<{
    dataViews: DataViewsPublicPluginStart;
  }>
> = ({ children, dataViews }) => {
  const { canRead } = useCanReadSyntheticsIndex();
  // Creating the data view calls field_caps and toasts a security_exception without index read.
  const { data } = useFetcher(() => {
    if (canRead !== true) {
      return;
    }
    return dataViews.create({ title: SYNTHETICS_INDEX_PATTERN });
  }, [dataViews, canRead]);

  return <SyntheticsDataViewContext.Provider value={data!} children={children} />;
};

export const useSyntheticsDataView = () => useContext(SyntheticsDataViewContext);
