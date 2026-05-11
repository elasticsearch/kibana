/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, PropsWithChildren } from 'react';
import React, { useContext } from 'react';
import type { EuiGlobalToastListToast as EuiToast } from '@elastic/eui';
import type { SampleDataSet } from '@kbn/home-sample-data-types';
import type {
  SampleDataCardServices,
  SampleDataCardKibanaDependencies,
} from '@kbn/home-sample-data-card';
import { SampleDataCardProvider, SampleDataCardKibanaProvider } from '@kbn/home-sample-data-card';

import { URL_SAMPLE_DATA_API } from './constants';

type UnmountCallback = () => void;
type MountPoint<T extends HTMLElement = HTMLElement> = (element: T) => UnmountCallback;
type ValidNotifyString = string | MountPoint<HTMLElement>;

type NotifyInputFields = Pick<EuiToast, Exclude<keyof EuiToast, 'id' | 'text' | 'title'>> & {
  title?: ValidNotifyString;
  text?: ValidNotifyString;
};

type NotifyInput = string | NotifyInputFields;
type NotifyFn = (notification: NotifyInput) => void;

interface Services {
  fetchSampleDataSets: () => Promise<SampleDataSet[]>;
  fetchDocumentationSampleDataSet: () => Promise<SampleDataSet | null>;
  notifyError: NotifyFn;
  logClick: (metric: string) => void;
}

/**
 * A list of services that are consumed by this component.
 */
export type SampleDataTabServices = Services & SampleDataCardServices;

const Context = React.createContext<Services | null>(null);

/**
 * A Context Provider that provides services to the component and its dependencies.
 */
export const SampleDataTabProvider: FC<PropsWithChildren<SampleDataTabServices>> = ({
  children,
  ...services
}) => {
  const { fetchSampleDataSets, fetchDocumentationSampleDataSet, notifyError, logClick } = services;

  return (
    <Context.Provider
      value={{
        fetchSampleDataSets,
        fetchDocumentationSampleDataSet,
        notifyError,
        logClick,
      }}
    >
      <SampleDataCardProvider {...services}>{children}</SampleDataCardProvider>
    </Context.Provider>
  );
};

interface KibanaDependencies {
  coreStart: {
    http: {
      get: (path: string) => Promise<unknown>;
    };
    notifications: {
      toasts: {
        addDanger: NotifyFn;
      };
    };
  };
  // TODO: clintandrewhall - This is using a type from the home plugin.  I'd prefer we
  // use the type directly from Kibana instead.
  trackUiMetric: (type: string, eventNames: string | string[], count?: number) => void;
  /**
   * Optional sample data ingest plugin API for fetching the documentation sample data set.
   * If not provided, the documentation sample data set will not be included in the list.
   */
  sampleDataIngest?: {
    getSampleDataSet: () => Promise<SampleDataSet | null>;
  };
}

/**
 * Services that are consumed by this component and its dependencies.
 */
export type SampleDataTabKibanaDependencies = KibanaDependencies & SampleDataCardKibanaDependencies;

/**
 * Kibana-specific Provider that maps dependencies to services.
 */
export const SampleDataTabKibanaProvider: FC<
  PropsWithChildren<SampleDataTabKibanaDependencies>
> = ({ children, ...dependencies }) => {
  const { coreStart, trackUiMetric, sampleDataIngest } = dependencies;
  const { http, notifications } = coreStart;

  const value: Services = {
    fetchSampleDataSets: async () => (await http.get(URL_SAMPLE_DATA_API)) as SampleDataSet[],
    fetchDocumentationSampleDataSet: async () => {
      // Use the sample_data_ingest plugin if available
      if (sampleDataIngest) {
        return sampleDataIngest.getSampleDataSet();
      }
      return null;
    },
    notifyError: (input) => notifications.toasts.addDanger(input),
    logClick: (eventName) => trackUiMetric('click', eventName),
  };

  return (
    <Context.Provider {...{ value }}>
      <SampleDataCardKibanaProvider {...dependencies}>{children}</SampleDataCardKibanaProvider>
    </Context.Provider>
  );
};

/**
 * React hook for accessing pre-wired services.
 */
export function useServices() {
  const context = useContext(Context);

  if (!context) {
    throw new Error(
      'SampleDataTab Context is missing.  Ensure your component or React root is wrapped with SampleDataTabContext.'
    );
  }

  return context;
}
