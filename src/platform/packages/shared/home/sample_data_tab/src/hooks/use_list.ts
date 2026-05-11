/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useState, useEffect } from 'react';
import { i18n } from '@kbn/i18n';

import type { SampleDataSet } from '@kbn/home-sample-data-types';
import { useServices } from '../services';

/**
 * A React hook that fetches a list of Sample Data Sets from Kibana, as well as failure
 * indicators in the Kibana UI.  It also provides a boolean that indicates if the list is
 * currently being fetched, as well as a method to refresh the list on demand.
 */
export const useList = (): [SampleDataSet[], typeof refresh, boolean] => {
  const { fetchSampleDataSets, fetchDocumentationSampleDataSet, notifyError } = useServices();
  const [isLoading, setIsLoading] = useState(false);
  const [sampleDataSets, setSampleDataSets] = useState<SampleDataSet[]>([]);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch sample data from both sources in parallel
      const [sets, documentationSampleDataSet] = await Promise.all([
        fetchSampleDataSets(),
        fetchDocumentationSampleDataSet(),
      ]);

      // Combine results if the documentation sample data set is available
      const allSets =
        documentationSampleDataSet !== null ? [...sets, documentationSampleDataSet] : sets;

      setIsLoading(false);

      setSampleDataSets(
        allSets.sort((a, b) => {
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        })
      );
    } catch (fetchError) {
      notifyError({
        title: i18n.translate('homePackages.sampleDataSet.unableToLoadListErrorMessage', {
          defaultMessage: 'Unable to load sample data sets list',
        }),
        text: `${fetchError.message}`,
      });
      setIsLoading(false);
      setSampleDataSets([]);
    }
  }, [fetchSampleDataSets, fetchDocumentationSampleDataSet, notifyError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return [sampleDataSets, refresh, isLoading];
};
