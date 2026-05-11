/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback } from 'react';
import { i18n } from '@kbn/i18n';

import type { SampleDataSet } from '@kbn/home-sample-data-types';
import { useServices } from '../services';
import { pollForRemoval, pollForCustomRemoval } from './poll_sample_data_status';

/**
 * Parameters for the `useRemove` React hook.
 */
export type Params = Pick<
  SampleDataSet,
  'id' | 'defaultIndex' | 'name' | 'customRemove' | 'customStatusCheck'
> & {
  /** Handler to invoke when the Sample Data Set is successfully removed. */
  onRemove: (id: string) => void;
};

/**
 * A React hook that allows a component to remove a sample data set, handling success and
 * failure in the Kibana UI. It also provides a boolean that indicates if the data set is
 * in the process of being removed.
 *
 * After removal, this hook polls the status endpoint until the data is confirmed
 * as uninstalled
 */
export const useRemove = ({
  id,
  defaultIndex,
  name,
  customRemove,
  customStatusCheck,
  onRemove,
}: Params): [() => void, boolean] => {
  const { removeSampleDataSet, fetchSampleDataSets, notifyError, notifySuccess } = useServices();
  const [isRemoving, setIsRemoving] = React.useState(false);

  const remove = useCallback(async () => {
    try {
      setIsRemoving(true);

      if (customRemove) {
        // Use the custom remove handler if provided
        await customRemove();

        // Poll until removal is complete using custom status check if available
        if (customStatusCheck) {
          await pollForCustomRemoval(customStatusCheck);
        }
      } else {
        await removeSampleDataSet(id, defaultIndex);

        // Poll until removal is confirmed
        await pollForRemoval(id, fetchSampleDataSets, {
          maxAttempts: 20,
          initialDelayMs: 500,
          minTimeout: 500,
          factor: 1.5,
        });
      }

      setIsRemoving(false);

      notifySuccess({
        title: i18n.translate('homePackages.sampleDataSet.uninstalledLabel', {
          defaultMessage: '{name} uninstalled',
          values: { name },
        }),
        ['data-test-subj']: 'sampleDataSetUninstallToast',
      });

      onRemove(id);
    } catch (e) {
      setIsRemoving(false);

      notifyError({
        title: i18n.translate('homePackages.sampleDataSet.unableToUninstallErrorMessage', {
          defaultMessage: 'Unable to uninstall sample data set: {name}',
          values: { name },
        }),
        text: `${e.message}`,
      });
    }
  }, [
    removeSampleDataSet,
    fetchSampleDataSets,
    notifyError,
    notifySuccess,
    id,
    defaultIndex,
    name,
    customRemove,
    customStatusCheck,
    onRemove,
  ]);

  return [remove, isRemoving];
};
