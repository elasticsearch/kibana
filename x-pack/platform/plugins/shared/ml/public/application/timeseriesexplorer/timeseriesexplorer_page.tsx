/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';

import { i18n } from '@kbn/i18n';

import { JobSelector } from '../components/job_selector';

import { HelpMenu } from '../components/help_menu';
import { useMlKibana } from '../contexts/kibana';
import { MlAppHeader } from '../components/ml_app_header';
import { useAnnotationStyles, useTimeseriesExplorerStyles } from './styles';

interface TimeSeriesExplorerPageProps {
  dateFormatTz?: string;
  resizeRef?: any;
  noSingleMetricJobsFound?: boolean;
  handleJobSelectionChange: ({
    jobIds,
    time,
  }: {
    jobIds: string[];
    time?: { from: string; to: string };
  }) => void;
  selectedJobId?: string[];
}

export const TimeSeriesExplorerPage: FC<PropsWithChildren<TimeSeriesExplorerPageProps>> = ({
  children,
  dateFormatTz,
  resizeRef,
  noSingleMetricJobsFound,
  handleJobSelectionChange,
  selectedJobId = [],
}) => {
  const {
    services: { cases, docLinks },
  } = useMlKibana();
  const CasesContext = cases?.ui.getCasesContext() ?? React.Fragment;
  const casesPermissions = cases?.helpers.canUseCases();
  const helpLink = docLinks.links.ml.anomalyDetection;

  const timeseriesExplorerStyles = useTimeseriesExplorerStyles();
  const annotationStyles = useAnnotationStyles();

  return (
    <>
      <div
        css={[timeseriesExplorerStyles, annotationStyles]}
        ref={resizeRef}
        data-test-subj="mlPageSingleMetricViewer"
      >
        <MlAppHeader
          title={i18n.translate('xpack.ml.timeSeriesExplorer.pageTitle', {
            defaultMessage: 'Single Metric Viewer',
          })}
          showDatePicker
        />

        {noSingleMetricJobsFound ? null : (
          <JobSelector
            dateFormatTz={dateFormatTz!}
            singleSelection={true}
            timeseriesOnly={true}
            onSelectionChange={handleJobSelectionChange}
            selectedJobIds={selectedJobId}
          />
        )}
        <CasesContext owner={[]} permissions={casesPermissions!}>
          {children}
        </CasesContext>
        <HelpMenu docLink={helpLink} />
      </div>
    </>
  );
};
