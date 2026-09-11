/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback } from 'react';
import { METRIC_TYPE } from '@kbn/analytics';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import type { DataView } from '@kbn/data-views-plugin/common';
import { isDataViewSource } from '../../../../common/data_sources';
import { useDiscoverServices } from '../../../hooks/use_discover_services';
import { useInspector } from './use_inspector';
import {
  internalStateActions,
  useCurrentTabAction,
  useCurrentTabSelector,
  useInternalStateDispatch,
} from '../state_management/redux';

interface UseCurrentTabMenuActionsParams {
  currentDataView: DataView | undefined;
  switchToEsqlMetric?: string;
}

export const useCurrentTabMenuActions = ({
  currentDataView,
  switchToEsqlMetric = 'esql:try_btn_clicked',
}: UseCurrentTabMenuActionsParams) => {
  const services = useDiscoverServices();
  const dispatch = useInternalStateDispatch();
  const currentTab = useCurrentTabSelector((tab) => tab);
  const transitionFromDataViewToESQL = useCurrentTabAction(
    internalStateActions.transitionFromDataViewToESQL
  );
  const transitionFromESQLToDataView = useCurrentTabAction(
    internalStateActions.transitionFromESQLToDataView
  );
  const openInspector = useInspector({ inspector: services.inspector });

  const isEsqlEnabled = services.uiSettings.get(ENABLE_ESQL);
  const isDataViewMode = isDataViewSource(currentTab.appState.dataSource);
  const canSwitchLanguageMode = Boolean(currentDataView) && isEsqlEnabled;

  const switchLanguageMode = useCallback(() => {
    if (!currentDataView || !isEsqlEnabled) {
      return;
    }

    if (isDataViewMode) {
      services.trackUiMetric?.(METRIC_TYPE.CLICK, switchToEsqlMetric);
      dispatch(transitionFromDataViewToESQL({ dataView: currentDataView }));
      return;
    }

    services.trackUiMetric?.(METRIC_TYPE.CLICK, 'esql:back_to_classic_clicked');
    dispatch(transitionFromESQLToDataView({ dataView: currentDataView }));
  }, [
    currentDataView,
    dispatch,
    isDataViewMode,
    isEsqlEnabled,
    services,
    switchToEsqlMetric,
    transitionFromDataViewToESQL,
    transitionFromESQLToDataView,
  ]);

  return {
    canSwitchLanguageMode,
    isDataViewMode,
    openInspector,
    switchLanguageMode,
  };
};
