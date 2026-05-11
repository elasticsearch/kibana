/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useRef, useState } from 'react';
import { EuiButton, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import type { SampleDataSet } from '@kbn/home-sample-data-types';
import { useServices } from '../services';
import { pollForInstallation, pollForCustomInstallation } from '../hooks/poll_sample_data_status';

/**
 * Props for the `InstallingAsyncFooter` component.
 */
export type Props = Pick<SampleDataSet, 'id' | 'name' | 'customStatusCheck'> & {
  /** Handler to invoke when the Sample Data Set is successfully installed. */
  onInstall: (id: string) => void;
};

const installingLabel = i18n.translate('homePackages.sampleDataCard.installingButtonLabel', {
  defaultMessage: 'Installing',
});

/**
 * A footer displayed when a Sample Data Set is being installed via an async background task.
 * This component polls the status endpoint until installation is confirmed complete.
 */
export const InstallingAsyncFooter = ({ id, name, customStatusCheck, onInstall }: Props) => {
  const { fetchSampleDataSets, notifyError, notifySuccess } = useServices();
  const [isInstalling, setIsInstalling] = useState(true);
  const hasStartedPolling = useRef(false);
  const cancelledRef = useRef(false);

  const installingAriaLabel = i18n.translate(
    'homePackages.sampleDataCard.installingButtonAriaLabel',
    {
      defaultMessage: 'Installing {datasetName}',
      values: {
        datasetName: name,
      },
    }
  );

  // Start polling immediately on mount since we know the server status is 'installing'
  useEffect(() => {
    if (hasStartedPolling.current) {
      return;
    }

    hasStartedPolling.current = true;

    const pollForCompletion = async () => {
      try {
        if (customStatusCheck) {
          await pollForCustomInstallation(customStatusCheck);
        } else {
          await pollForInstallation(id, fetchSampleDataSets, {
            maxAttempts: 60,
            initialDelayMs: 2000,
            minTimeout: 2000,
            factor: 1.2,
          });
        }

        // Bail out if component unmounted during polling
        if (cancelledRef.current) {
          return;
        }

        setIsInstalling(false);

        notifySuccess({
          title: i18n.translate('homePackages.sampleDataSet.installedLabel', {
            defaultMessage: '{name} installed',
            values: { name },
          }),
          ['data-test-subj']: 'sampleDataSetInstallToast',
        });

        onInstall(id);
      } catch (e) {
        // Bail out if component unmounted during polling
        if (cancelledRef.current) {
          return;
        }

        setIsInstalling(false);
        notifyError({
          title: i18n.translate('homePackages.sampleDataSet.unableToInstallErrorMessage', {
            defaultMessage: 'Unable to install sample data set: {name}',
            values: { name },
          }),
          text: `${e.message}`,
        });
      }
    };

    pollForCompletion();

    return () => {
      cancelledRef.current = true;
    };
  }, [id, name, customStatusCheck, fetchSampleDataSets, notifySuccess, notifyError, onInstall]);

  return (
    <EuiFlexGroup justifyContent="flexStart">
      <EuiFlexItem grow={false}>
        <EuiButton
          color="text"
          isLoading={isInstalling}
          isDisabled={isInstalling}
          iconType="download"
          data-test-subj={`addSampleDataSet${id}`}
          aria-label={installingAriaLabel}
        >
          {installingLabel}
        </EuiButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
