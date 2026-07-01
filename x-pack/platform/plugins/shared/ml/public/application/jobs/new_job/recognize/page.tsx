/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useState, Fragment, useEffect, useCallback } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import {
  EuiTitle,
  EuiFlexItem,
  EuiFlexGroup,
  EuiText,
  EuiSpacer,
  EuiCallOut,
  EuiPanel,
} from '@elastic/eui';
import { isEqual, merge } from 'lodash';
import moment from 'moment';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import { addExcludeFrozenToQuery } from '@kbn/ml-query-utils';
import { TIME_FORMAT } from '@kbn/ml-date-utils';
import { type RuntimeMappings } from '@kbn/ml-runtime-field-utils';
import type { Module } from '@kbn/ml-common-types/modules';
import type {
  DatafeedResponse,
  JobOverride,
  JobResponse,
  KibanaObject,
  KibanaObjects,
  KibanaObjectResponse,
  ModuleJob,
} from '@kbn/ml-common-types/modules';
import type { JobId } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import { useMlKibana, useMlLocator } from '../../../contexts/kibana';
import { useDataSource } from '../../../contexts/ml';
import { CreateResultCallout } from './components/create_result_callout';
import { KibanaObjectList } from './components/kibana_objects';
import { ModuleJobs } from './components/module_jobs';
import type { JobSettingsFormValues } from './components/job_settings_form';
import { JobSettingsForm } from './components/job_settings_form';
import type { TimeRange } from '../common/components';
import { JobsAwaitingNodeWarning } from '../../../components/jobs_awaiting_node_warning';
import { MlPageHeader } from '../../../components/page_header';
import { PageTitle } from '../../../components/page_title';

export interface ModuleJobUI extends ModuleJob {
  datafeedResult?: DatafeedResponse;
  setupResult?: JobResponse;
}

export type KibanaObjectUi = KibanaObject & KibanaObjectResponse;

interface PageProps {
  moduleId: string;
  existingGroupIds: string[];
}

export type JobOverrides = Record<JobId, JobOverride>;

export enum SAVE_STATE {
  NOT_SAVED,
  SAVING,
  SAVED,
  FAILED,
  PARTIAL_FAILURE,
}

export const Page: FC<PageProps> = ({ moduleId, existingGroupIds }) => {
  const {
    services: {
      notifications,
      mlServices: {
        mlApi: { getTimeFieldRange, setupDataRecognizerConfig, getDataRecognizerModule },
      },
    },
  } = useMlKibana();
  const locator = useMlLocator();

  const [jobPrefix, setJobPrefix] = useState<string>('');
  const [jobs, setJobs] = useState<ModuleJobUI[]>([]);
  const [jobOverrides, setJobOverrides] = useState<JobOverrides>({});
  const [kibanaObjects, setKibanaObjects] = useState<KibanaObjects>({});
  const [saveState, setSaveState] = useState<SAVE_STATE>(SAVE_STATE.NOT_SAVED);
  const [resultsUrl, setResultsUrl] = useState<string>('');
  const [existingGroups, setExistingGroups] = useState(existingGroupIds);
  const [jobsAwaitingNodeCount, setJobsAwaitingNodeCount] = useState(0);

  const {
    selectedSavedSearch,
    selectedDataView: dataView,
    combinedQuery,
    projectRouting,
  } = useDataSource();
  const pageTitle = selectedSavedSearch
    ? i18n.translate('xpack.ml.newJob.recognize.savedSearchPageTitle', {
        defaultMessage: 'Discover session {savedSearchTitle}',
        values: { savedSearchTitle: selectedSavedSearch.title ?? '' },
      })
    : i18n.translate('xpack.ml.newJob.recognize.dataViewPageTitle', {
        defaultMessage: 'data view {dataViewName}',
        values: { dataViewName: dataView.getName() },
      });
  const displayQueryWarning = selectedSavedSearch !== null;
  const tempQuery = selectedSavedSearch === null ? undefined : combinedQuery;

  /**
   * Loads recognizer module configuration.
   */
  const loadModule = useCallback(async () => {
    try {
      const response = (await getDataRecognizerModule({ moduleId })) as Module;
      setJobs(response.jobs);
      setKibanaObjects(response.kibana);

      setSaveState(SAVE_STATE.NOT_SAVED);

      // mix existing groups from the server with the groups used across all jobs in the module.
      const moduleGroups = [...response.jobs.map((j) => j.config.groups || [])].flat();
      const newGroups = [...new Set([...existingGroups, ...moduleGroups])].sort();
      if (!isEqual(newGroups, existingGroups)) {
        setExistingGroups(newGroups);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }, [existingGroups, getDataRecognizerModule, moduleId]);

  const getTimeRange = useCallback(
    async (useFullIndexData: boolean, timeRange: TimeRange): Promise<TimeRange> => {
      if (useFullIndexData) {
        const runtimeMappings = dataView.getComputedFields().runtimeFields as RuntimeMappings;
        const { start, end } = await getTimeFieldRange({
          index: dataView.getIndexPattern(),
          timeFieldName: dataView.timeFieldName,
          // By default we want to use full non-frozen time range
          query: addExcludeFrozenToQuery(combinedQuery),
          ...(isPopulatedObject(runtimeMappings) ? { runtimeMappings } : {}),
          projectRouting,
        });
        return {
          start,
          end,
        };
      } else {
        return Promise.resolve(timeRange);
      }
    },
    [dataView, getTimeFieldRange, combinedQuery, projectRouting]
  );

  useEffect(() => {
    loadModule();
  }, [loadModule]);

  /**
   * Sets up recognizer module configuration.
   */
  const save = useCallback(
    async (formValues: JobSettingsFormValues) => {
      setSaveState(SAVE_STATE.SAVING);
      const {
        jobPrefix: resultJobPrefix,
        startDatafeedAfterSave,
        useDedicatedIndex,
        useFullIndexData,
        timeRange,
      } = formValues;
      const resultTimeRange = await getTimeRange(useFullIndexData, timeRange);

      try {
        let jobOverridesPayload: JobOverride[] | null = Object.values(jobOverrides);
        jobOverridesPayload = jobOverridesPayload.length > 0 ? jobOverridesPayload : null;

        const response = await setupDataRecognizerConfig({
          moduleId,
          prefix: resultJobPrefix,
          query: tempQuery,
          indexPatternName: dataView.getIndexPattern(),
          useDedicatedIndex,
          startDatafeed: startDatafeedAfterSave,
          ...(jobOverridesPayload !== null ? { jobOverrides: jobOverridesPayload } : {}),
          ...resultTimeRange,
          ...(projectRouting ? { projectRouting } : {}),
        });
        const {
          datafeeds: datafeedsResponse,
          jobs: jobsResponse,
          kibana: kibanaResponse,
        } = response;

        setJobs(
          jobs.map((job) => {
            return {
              ...job,
              datafeedResult: datafeedsResponse.find(({ id }) => id.endsWith(job.id)),
              setupResult: jobsResponse.find(({ id }) => id === resultJobPrefix + job.id),
            };
          })
        );
        setKibanaObjects(merge(kibanaObjects, kibanaResponse));

        if (locator) {
          const url = await locator.getUrl({
            page: ML_PAGES.ANOMALY_EXPLORER,
            pageState: {
              jobIds: jobsResponse.filter(({ success }) => success).map(({ id }) => id),
              timeRange: {
                from: moment(resultTimeRange.start).format(TIME_FORMAT),
                to: moment(resultTimeRange.end).format(TIME_FORMAT),
                mode: 'absolute',
              },
            },
          });
          setResultsUrl(url);
        }

        const failedJobsCount = jobsResponse.reduce(
          (count, { success }) => (success ? count : count + 1),
          0
        );

        const lazyJobsCount = datafeedsResponse.reduce(
          (count, { awaitingMlNodeAllocation }) =>
            awaitingMlNodeAllocation === true ? count + 1 : count,
          0
        );

        setJobsAwaitingNodeCount(lazyJobsCount);

        setSaveState(
          failedJobsCount === 0
            ? SAVE_STATE.SAVED
            : failedJobsCount === jobs.length
            ? SAVE_STATE.FAILED
            : SAVE_STATE.PARTIAL_FAILURE
        );
      } catch (e) {
        setSaveState(SAVE_STATE.FAILED);
        const { toasts } = notifications;
        toasts.addError(e, {
          title: i18n.translate('xpack.ml.newJob.recognize.moduleSetupFailedWarningTitle', {
            defaultMessage: 'Error setting up module {moduleId}',
            values: { moduleId },
          }),
          toastMessage: i18n.translate(
            'xpack.ml.newJob.recognize.moduleSetupFailedWarningDescription',
            {
              defaultMessage:
                'An error occurred trying to create the {count, plural, one {job} other {jobs}} in the module.',
              values: {
                count: jobs.length,
              },
            }
          ),
        });
      }
    },
    [
      projectRouting,
      dataView,
      getTimeRange,
      jobOverrides,
      jobs,
      kibanaObjects,
      locator,
      moduleId,
      notifications,
      setupDataRecognizerConfig,
      tempQuery,
    ]
  );

  const onJobOverridesChange = (job: JobOverride) => {
    setJobOverrides({
      ...jobOverrides,
      [job.job_id as string]: job,
    });
    if (job.groups !== undefined) {
      // add newly added jobs to the list of existing groups
      // for use when editing other jobs in the module
      const groups = [...new Set([...existingGroups, ...job.groups])];
      setExistingGroups(groups);
    }
  };

  const isFormVisible = [SAVE_STATE.NOT_SAVED, SAVE_STATE.SAVING].includes(saveState);

  return (
    <>
      <MlPageHeader>
        <>
          <PageTitle
            title={
              <FormattedMessage
                id="xpack.ml.newJob.recognize.newJobFromTitle"
                defaultMessage="New job from {pageTitle}"
                values={{ pageTitle }}
              />
            }
          />
          {projectRouting ? (
            <EuiText size="s">
              <FormattedMessage
                id="xpack.ml.newJob.recognize.projectRouting"
                defaultMessage="Project scope: {projectRouting}"
                values={{ projectRouting }}
              />
            </EuiText>
          ) : null}
        </>
        <EuiSpacer size="s" />
      </MlPageHeader>

      {displayQueryWarning && (
        <>
          <EuiCallOut
            announceOnMount={false}
            title={
              <FormattedMessage
                id="xpack.ml.newJob.recognize.searchWillBeOverwrittenLabel"
                defaultMessage="Search will be overwritten"
              />
            }
            color="warning"
            iconType="warning"
          >
            <EuiText size="s">
              <FormattedMessage
                id="xpack.ml.newJob.recognize.usingSavedSearchDescription"
                defaultMessage="Using a saved Discover session will mean the query used in the datafeeds will be different from the default ones we supply in the {moduleId} module."
                values={{ moduleId }}
              />
            </EuiText>
          </EuiCallOut>
          <EuiSpacer size="l" />
        </>
      )}

      {jobsAwaitingNodeCount > 0 && <JobsAwaitingNodeWarning jobCount={jobsAwaitingNodeCount} />}

      <EuiFlexGroup wrap={true} gutterSize="m" data-test-subj="mlPageJobWizard recognizer">
        <EuiFlexItem grow={1}>
          <EuiPanel grow={false} hasShadow={false} hasBorder>
            <EuiTitle size="s">
              <h4>
                <FormattedMessage
                  id="xpack.ml.newJob.recognize.jobSettingsTitle"
                  defaultMessage="Job settings"
                />
              </h4>
            </EuiTitle>

            <EuiSpacer size="m" />

            {isFormVisible && (
              <JobSettingsForm
                onSubmit={save}
                onJobPrefixChange={setJobPrefix}
                saveState={saveState}
                jobs={jobs}
              />
            )}
            <CreateResultCallout
              saveState={saveState}
              resultsUrl={resultsUrl}
              onReset={loadModule}
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={2}>
          <EuiPanel grow={false} hasShadow={false} hasBorder>
            <ModuleJobs
              jobs={jobs}
              jobPrefix={jobPrefix}
              saveState={saveState}
              existingGroupIds={existingGroups}
              jobOverrides={jobOverrides}
              onJobOverridesChange={onJobOverridesChange}
            />
          </EuiPanel>
          {Object.keys(kibanaObjects).length > 0 && (
            <>
              <EuiSpacer size="m" />
              <EuiPanel grow={false} hasShadow={false} hasBorder>
                {Object.keys(kibanaObjects).map((objectType, i) => (
                  <Fragment key={objectType}>
                    <KibanaObjectList
                      objectType={objectType}
                      kibanaObjects={kibanaObjects[objectType]}
                      isSaving={saveState === SAVE_STATE.SAVING}
                    />
                    {i < Object.keys(kibanaObjects).length - 1 && <EuiSpacer size="s" />}
                  </Fragment>
                ))}
              </EuiPanel>
            </>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
    </>
  );
};
