/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useEffect, useRef, useState } from 'react';
import useMountedState from 'react-use/lib/useMountedState';

import type { MlJob } from '@elastic/elasticsearch/lib/api/types';

import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiTitle,
  EuiFieldText,
  EuiSpacer,
} from '@elastic/eui';

import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { extractErrorMessage } from '@kbn/ml-error-utils';
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import type { TimeRangeBounds } from '@kbn/ml-time-buckets';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';

import type { MlApi } from '../../application/services/ml_api_service';
import { SeriesControls } from '../../application/timeseriesexplorer/components/series_controls';
import {
  APP_STATE_ACTION,
  type TimeseriesexplorerActionType,
} from '../../application/timeseriesexplorer/timeseriesexplorer_constants';
import { useMlLink } from '../../application/contexts/kibana';
import { JobSelectorControl } from '../../alerting/job_selector';

import type { MlEntity } from './types';

import { getDefaultSingleMetricViewerPanelTitle } from './get_default_panel_title';

export interface SingleMetricViewerInitializerProps {
  bounds: TimeRangeBounds;
  initialInput?: Partial<SingleMetricViewerEmbeddableState>;
  mlApi: MlApi;
  onCreate: (state: SingleMetricViewerEmbeddableState) => void;
  onCancel: () => void;
}

export const SingleMetricViewerInitializer: FC<SingleMetricViewerInitializerProps> = ({
  bounds,
  initialInput,
  onCreate,
  onCancel,
  mlApi,
}) => {
  const isMounted = useMountedState();
  const newJobUrl = useMlLink({ page: ML_PAGES.ANOMALY_DETECTION_CREATE_JOB });
  const [jobId, setJobId] = useState<string | undefined>(
    initialInput?.job_ids && initialInput?.job_ids[0]
  );
  const titleManuallyChanged = useRef(!!initialInput?.title);

  const [job, setJob] = useState<MlJob | undefined>();
  const [panelTitle, setPanelTitle] = useState<string>(initialInput?.title ?? '');
  const [functionDescription, setFunctionDescription] = useState<string | undefined>(
    initialInput?.function_description
  );
  // Reset detector index and entities if the job has changed
  const [selectedDetectorIndex, setSelectedDetectorIndex] = useState<number>(
    initialInput?.selected_detector_index ?? 0
  );
  const [selectedEntities, setSelectedEntities] = useState<MlEntity | undefined>(
    initialInput?.selected_entities
  );
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const isPanelTitleValid = panelTitle.length > 0;

  useEffect(
    function setUpPanel() {
      async function fetchJob() {
        const { jobs } = await mlApi.getJobs({ jobId });

        if (isMounted() && jobs.length === 1) {
          setJob(jobs[0]);
          setErrorMessage(undefined);
        }
      }

      if (jobId) {
        if (!titleManuallyChanged.current) {
          setPanelTitle(getDefaultSingleMetricViewerPanelTitle(jobId));
        }
        // Fetch job if a jobId has been selected and if there is no corresponding fetched job or the job selection has changed
        if (mlApi && jobId && jobId !== job?.job_id) {
          fetchJob().catch((error) => {
            const errorMsg = extractErrorMessage(error);
            setErrorMessage(errorMsg);
          });
        }
      }
    },
    [isMounted, jobId, mlApi, panelTitle, job?.job_id]
  );

  const handleStateUpdate = (
    action: TimeseriesexplorerActionType,
    payload: string | number | MlEntity
  ) => {
    switch (action) {
      case APP_STATE_ACTION.SET_ENTITIES:
        setSelectedEntities(payload as MlEntity);
        break;
      case APP_STATE_ACTION.SET_FUNCTION_DESCRIPTION:
        setFunctionDescription(payload as string);
        break;
      case APP_STATE_ACTION.SET_DETECTOR_INDEX:
        setSelectedDetectorIndex(payload as number);
        break;
      default:
        break;
    }
  };

  return (
    <>
      <EuiFlyoutHeader>
        <EuiTitle>
          <h2>
            <FormattedMessage
              id="xpack.ml.SingleMetricViewerEmbeddable.setupModal.title"
              defaultMessage="Single metric viewer configuration"
            />
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiForm>
          <JobSelectorControl
            adJobsApiService={mlApi.jobs}
            createJobUrl={newJobUrl}
            jobsAndGroupIds={jobId ? [jobId] : undefined}
            onChange={(update) => {
              setJobId(update?.jobIds && update?.jobIds[0]);
              // Reset values when selected job has changed
              setSelectedDetectorIndex(0);
              setSelectedEntities(undefined);
              setFunctionDescription(undefined);
            }}
            {...(errorMessage && { errors: [errorMessage] })}
          />
          {job?.job_id && jobId && jobId === job.job_id ? (
            <EuiFormRow
              label={
                <FormattedMessage
                  id="xpack.ml.singleMetricViewerEmbeddable.panelTitleLabel"
                  defaultMessage="Panel title"
                />
              }
              isInvalid={!isPanelTitleValid}
              fullWidth
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
                fullWidth
              />
            </EuiFormRow>
          ) : null}
          <EuiSpacer />
          {job?.job_id && jobId && jobId === job.job_id ? (
            <SeriesControls
              selectedJobId={jobId}
              job={job}
              direction="column"
              appStateHandler={handleStateUpdate}
              selectedDetectorIndex={selectedDetectorIndex}
              selectedEntities={selectedEntities}
              bounds={bounds}
              functionDescription={functionDescription}
              setFunctionDescription={setFunctionDescription}
            />
          ) : null}
        </EuiForm>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent={'spaceBetween'}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              aria-label={i18n.translate(
                'xpack.ml.singleMetricViewerEmbeddable.setupModal.cancelButtonAriaLabel',
                { defaultMessage: 'Cancel' }
              )}
              onClick={onCancel}
              data-test-subj="mlsingleMetricViewerInitializerCancelButton"
            >
              <FormattedMessage
                id="xpack.ml.singleMetricViewerEmbeddable.setupModal.cancelButtonLabel"
                defaultMessage="Cancel"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="mlSingleMetricViewerInitializerConfirmButton"
              isDisabled={!isPanelTitleValid || errorMessage !== undefined || !jobId || !job}
              onClick={() =>
                onCreate({
                  job_ids: jobId ? [jobId] : [],
                  selected_detector_index: selectedDetectorIndex,
                  ...(functionDescription !== undefined
                    ? { function_description: functionDescription }
                    : {}),
                  ...(selectedEntities !== undefined
                    ? { selected_entities: selectedEntities }
                    : {}),
                  ...(panelTitle ? { title: panelTitle } : {}),
                })
              }
              fill
            >
              <FormattedMessage
                id="xpack.ml.singleMetricViewerEmbeddable.setupModal.confirmButtonLabel"
                defaultMessage="Confirm"
              />
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </>
  );
};
