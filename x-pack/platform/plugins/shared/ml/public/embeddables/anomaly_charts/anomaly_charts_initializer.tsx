/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useState, useRef, useEffect } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiForm,
  EuiFormRow,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiTitle,
  EuiFieldNumber,
  EuiFieldText,
  EuiSpacer,
  EuiFlexGroup,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import type { AnomalyChartsEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { DEFAULT_MAX_SERIES_TO_PLOT } from '../../application/services/anomaly_explorer_charts_service';
import { JobSelectorControl } from '../../alerting/job_selector';
import { getDefaultExplorerChartsPanelTitle } from './utils';
import { useMlLink } from '../../application/contexts/kibana';
import { getJobSelectionErrors } from '../utils';
import type { MlApi } from '../../application/services/ml_api_service';

export const MAX_ANOMALY_CHARTS_ALLOWED = 50;
export interface AnomalyChartsInitializerProps {
  initialInput?: Partial<
    Pick<AnomalyChartsEmbeddableState, 'title' | 'job_ids' | 'max_series_to_plot'>
  >;
  onCreate: (props: AnomalyChartsEmbeddableState) => void;
  onCancel: () => void;
  adJobsApiService: MlApi['jobs'];
}

export const AnomalyChartsInitializer: FC<AnomalyChartsInitializerProps> = ({
  initialInput,
  onCreate,
  onCancel,
  adJobsApiService,
}) => {
  const titleManuallyChanged = useRef(!!initialInput?.title);

  const [panelTitle, setPanelTitle] = useState(initialInput?.title ?? '');
  const [maxSeriesToPlot, setMaxSeriesToPlot] = useState(
    initialInput?.max_series_to_plot ?? DEFAULT_MAX_SERIES_TO_PLOT
  );
  const isPanelTitleValid = panelTitle?.length > 0;
  const isMaxSeriesToPlotValid =
    maxSeriesToPlot >= 1 && maxSeriesToPlot <= MAX_ANOMALY_CHARTS_ALLOWED;
  const newJobUrl = useMlLink({ page: ML_PAGES.ANOMALY_DETECTION_CREATE_JOB });

  const [jobIds, setJobIds] = useState(initialInput?.job_ids ?? []);
  const jobIdsErrors = getJobSelectionErrors(jobIds);

  const isFormValid = isPanelTitleValid && isMaxSeriesToPlotValid && jobIdsErrors === undefined;

  useEffect(
    function updateDefaultTitle() {
      if (!titleManuallyChanged.current) {
        setPanelTitle(getDefaultExplorerChartsPanelTitle(jobIds));
      }
    },
    [initialInput?.title, jobIds]
  );

  return (
    <>
      <EuiFlyoutHeader>
        <EuiTitle>
          <h2>
            <FormattedMessage
              id="xpack.ml.anomalyChartsEmbeddable.setupModal.title"
              defaultMessage="Anomaly explorer charts configuration"
            />
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <JobSelectorControl
          createJobUrl={newJobUrl}
          multiSelect
          jobsAndGroupIds={jobIds}
          adJobsApiService={adJobsApiService}
          onChange={(update) => {
            setJobIds([...(update?.jobIds ?? []), ...(update?.groupIds ?? [])]);
          }}
          errors={jobIdsErrors}
        />
        <EuiSpacer size="s" />
        {jobIds.length > 0 ? (
          <EuiForm>
            <EuiFormRow
              label={
                <FormattedMessage
                  id="xpack.ml.anomalyChartsEmbeddable.panelTitleLabel"
                  defaultMessage="Panel title"
                />
              }
              isInvalid={!isPanelTitleValid}
            >
              <EuiFieldText
                data-test-subj="panelTitleInput"
                id="panelTitle"
                name="panelTitle"
                value={panelTitle}
                onChange={(e) => {
                  titleManuallyChanged.current = true;
                  setPanelTitle(e.target.value);
                }}
                isInvalid={!isPanelTitleValid}
              />
            </EuiFormRow>

            <EuiFormRow
              isInvalid={!isMaxSeriesToPlotValid}
              error={
                !isMaxSeriesToPlotValid ? (
                  <FormattedMessage
                    id="xpack.ml.anomalyChartsEmbeddable.maxSeriesToPlotError"
                    defaultMessage="Maximum number of series to plot must be between 1 and 50."
                  />
                ) : undefined
              }
              label={
                <FormattedMessage
                  id="xpack.ml.anomalyChartsEmbeddable.maxSeriesToPlotLabel"
                  defaultMessage="Maximum number of series to plot"
                />
              }
            >
              <EuiFieldNumber
                isInvalid={!isMaxSeriesToPlotValid}
                data-test-subj="mlAnomalyChartsInitializerMaxSeries"
                id="selectMaxSeriesToPlot"
                name="selectMaxSeriesToPlot"
                value={maxSeriesToPlot}
                onChange={(e) => setMaxSeriesToPlot(parseInt(e.target.value, 10))}
                min={1}
                max={MAX_ANOMALY_CHARTS_ALLOWED}
              />
            </EuiFormRow>
          </EuiForm>
        ) : null}
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent={'spaceBetween'}>
          <EuiButtonEmpty
            onClick={onCancel}
            data-test-subj="mlAnomalyChartsInitializerCancelButton"
          >
            <FormattedMessage
              id="xpack.ml.anomalyChartsEmbeddable.setupModal.cancelButtonLabel"
              defaultMessage="Cancel"
            />
          </EuiButtonEmpty>

          <EuiButton
            data-test-subj="mlAnomalyChartsInitializerConfirmButton"
            isDisabled={!isFormValid}
            onClick={onCreate.bind(null, {
              title: panelTitle,
              max_series_to_plot: maxSeriesToPlot,
              job_ids: jobIds,
            })}
            fill
          >
            <FormattedMessage
              id="xpack.ml.anomalyChartsEmbeddable.setupFlyout.confirmButtonLabel"
              defaultMessage="Confirm"
            />
          </EuiButton>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </>
  );
};
