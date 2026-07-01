/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeEvent, FC } from 'react';
import React, { useCallback, useMemo } from 'react';

import {
  EuiFieldText,
  EuiForm,
  EuiFormRow,
  EuiSpacer,
  EuiFieldNumber,
  EuiCallOut,
} from '@elastic/eui';

import { FormattedMessage } from '@kbn/i18n-react';
import { parseInterval } from '@kbn/ml-parse-interval';
import type { ProjectRouting } from '@kbn/es-query';
import { useFetchProjects } from '@kbn/cps-utils';
import { MlProjectPickerPanel } from '@kbn/ml-cps';
import { useMlKibana } from '../../../../../contexts/kibana';
import { calculateDatafeedFrequencyDefaultSeconds } from '../../../../../../../common/util/job_utils';
import { getNewJobDefaults } from '../../../../../services/ml_server_info';
import { MLJobEditor, ML_EDITOR_MODE } from '../../ml_job_editor';

interface EditDatafeedTabProps {
  datafeedRunning: boolean;
  datafeedQuery: string;
  datafeedQueryDelay: string;
  datafeedFrequency: string;
  datafeedScrollSize: number;
  datafeedProjectRouting: string | undefined;
  jobBucketSpan: string;
  setDatafeed: (datafeed: Record<string, string | number | undefined>) => void;
}

export const EditDatafeedTab: FC<EditDatafeedTabProps> = ({
  datafeedRunning,
  datafeedQuery,
  datafeedQueryDelay,
  datafeedFrequency,
  datafeedScrollSize,
  datafeedProjectRouting,
  jobBucketSpan,
  setDatafeed,
}) => {
  const {
    services: { cps },
  } = useMlKibana();
  const defaults = useMemo(() => {
    const jobDefaults = getNewJobDefaults();
    const bucketSpanSeconds =
      jobBucketSpan !== undefined ? parseInterval(jobBucketSpan)?.asSeconds() ?? 0 : 0;
    return {
      queryDelay: '60s',
      frequency: calculateDatafeedFrequencyDefaultSeconds(bucketSpanSeconds) + 's',
      scrollSize: jobDefaults.datafeeds.scroll_size ?? 0,
    };
  }, [jobBucketSpan]);

  const onQueryChange = useCallback(
    (query: string) => {
      setDatafeed({ datafeedQuery: query });
    },
    [setDatafeed]
  );

  const onQueryDelayChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setDatafeed({ datafeedQueryDelay: e.target.value });
    },
    [setDatafeed]
  );

  const onFrequencyChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setDatafeed({ datafeedFrequency: e.target.value });
    },
    [setDatafeed]
  );

  const onScrollSizeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setDatafeed({ datafeedScrollSize: +e.target.value });
    },
    [setDatafeed]
  );

  const cpsManager = cps?.cpsManager;
  const totalProjectCount = cpsManager?.getTotalProjectCount() ?? 0;

  const fetchProjects = useCallback(
    (routing?: ProjectRouting) => {
      return cpsManager?.fetchProjects(routing) ?? Promise.resolve(null);
    },
    [cpsManager]
  );

  const projects = useFetchProjects(fetchProjects, datafeedProjectRouting);

  const onProjectRoutingChange = useCallback(
    (projectRouting: ProjectRouting) => {
      setDatafeed({ datafeedProjectRouting: projectRouting });
    },
    [setDatafeed]
  );

  return (
    <>
      <EuiSpacer size="m" />
      {datafeedRunning && (
        <>
          <EuiCallOut announceOnMount color="warning">
            <FormattedMessage
              id="xpack.ml.jobsList.editJobFlyout.datafeed.readOnlyCalloutText"
              defaultMessage="Datafeed settings cannot be edited while the datafeed is running. Please stop the job if you wish to edit these settings."
            />
          </EuiCallOut>
          <EuiSpacer size="l" />
        </>
      )}
      <EuiForm>
        {totalProjectCount > 1 && projects ? (
          <EuiFormRow
            label={
              <FormattedMessage
                id="xpack.ml.jobsList.editJobFlyout.datafeed.projectRoutingLabel"
                defaultMessage="Project scope"
              />
            }
          >
            <MlProjectPickerPanel
              projectRouting={datafeedProjectRouting}
              onProjectRoutingChange={onProjectRoutingChange}
              projects={projects}
              totalProjectCount={totalProjectCount}
              disabled={datafeedRunning}
              displayDisabledTooltip={false}
            />
          </EuiFormRow>
        ) : null}
        <EuiFormRow
          label={
            <FormattedMessage
              id="xpack.ml.jobsList.editJobFlyout.datafeed.queryLabel"
              defaultMessage="Query"
            />
          }
          style={{ maxWidth: 'inherit' }}
        >
          <MLJobEditor
            mode={ML_EDITOR_MODE.XJSON}
            value={datafeedQuery}
            onChange={onQueryChange}
            height="200px"
            readOnly={datafeedRunning}
          />
        </EuiFormRow>
        <EuiFormRow
          label={
            <FormattedMessage
              id="xpack.ml.jobsList.editJobFlyout.datafeed.queryDelayLabel"
              defaultMessage="Query delay"
            />
          }
        >
          <EuiFieldText
            value={datafeedQueryDelay}
            placeholder={defaults.queryDelay}
            onChange={onQueryDelayChange}
            disabled={datafeedRunning}
          />
        </EuiFormRow>
        <EuiFormRow
          label={
            <FormattedMessage
              id="xpack.ml.jobsList.editJobFlyout.datafeed.frequencyLabel"
              defaultMessage="Frequency"
            />
          }
        >
          <EuiFieldText
            value={datafeedFrequency}
            placeholder={defaults.frequency}
            onChange={onFrequencyChange}
            disabled={datafeedRunning}
          />
        </EuiFormRow>
        <EuiFormRow
          label={
            <FormattedMessage
              id="xpack.ml.jobsList.editJobFlyout.datafeed.scrollSizeLabel"
              defaultMessage="Scroll size"
            />
          }
        >
          <EuiFieldNumber
            value={datafeedScrollSize}
            placeholder={String(defaults.scrollSize)}
            onChange={onScrollSizeChange}
            disabled={datafeedRunning}
          />
        </EuiFormRow>
      </EuiForm>
    </>
  );
};
