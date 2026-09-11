/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useContext, useState } from 'react';
import type { CoreStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import type { AppDataType, ConfigProps, ReportViewType, SeriesConfig } from '../types';

export type ReportConfigMap = Record<string, Array<(config: ConfigProps) => SeriesConfig>>;

type StartServices = Pick<CoreStart, 'analytics' | 'i18n' | 'theme'>;

interface ExploratoryViewContextValue extends StartServices {
  dataTypes: Array<{ id: AppDataType; label: string }>;
  reportTypes: Array<{
    reportType: ReportViewType | typeof SELECT_REPORT_TYPE;
    label: string;
  }>;
  reportConfigMap: ReportConfigMap;
  asPanel?: boolean;
  isEditMode?: boolean;
  setIsEditMode?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ExploratoryViewContext = createContext<ExploratoryViewContextValue>(
  {} as ExploratoryViewContextValue
);

export function ExploratoryViewContextProvider({
  children,
  reportTypes,
  dataTypes,
  reportConfigMap,
  asPanel = true,
  ...startServices
}: { children: JSX.Element } & ExploratoryViewContextValue) {
  const [isEditMode, setIsEditMode] = useState(false);

  const value = {
    asPanel,
    reportTypes,
    dataTypes,
    reportConfigMap,
    isEditMode,
    setIsEditMode,
    ...startServices,
  };

  return (
    <ExploratoryViewContext.Provider value={value}>{children}</ExploratoryViewContext.Provider>
  );
}

export function useExploratoryView() {
  const context = useContext(ExploratoryViewContext);

  if (context === undefined) {
    throw new Error('useExploratoryView must be used within a ExploratoryViewContextProvider');
  }
  return context;
}

export const SELECT_REPORT_TYPE = i18n.translate(
  'xpack.exploratoryView.expView.seriesBuilder.selectReportType',
  {
    defaultMessage: 'No report type selected',
  }
);
