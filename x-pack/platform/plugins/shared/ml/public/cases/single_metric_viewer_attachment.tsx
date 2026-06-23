/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiDescriptionList } from '@elastic/eui';
import type { UnifiedValueAttachmentViewProps } from '@kbn/cases-plugin/public';
import moment from 'moment';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import { FIELD_FORMAT_IDS } from '@kbn/field-formats-plugin/common';
import { FormattedMessage } from '@kbn/i18n-react';
import deepEqual from 'fast-deep-equal';
import { memoize } from 'lodash';
import React from 'react';
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import { transformOut } from '../../common/embeddables/single_metric_viewer/transform_out';
import type { SingleMetricViewerAttachmentData } from '../../common/util/cases_utils';
import type { SingleMetricViewerSharedComponent } from '../shared_components/single_metric_viewer';

type SingleMetricViewerViewProps =
  UnifiedValueAttachmentViewProps<SingleMetricViewerAttachmentData>;

export const initComponent = memoize(
  (
    fieldFormats: FieldFormatsStart,
    SingleMetricViewerComponent: SingleMetricViewerSharedComponent
  ) => {
    return React.memo(
      (props: SingleMetricViewerViewProps) => {
        const { caseData } = props;
        const attachmentState = props.data.state;

        const embeddableState = transformOut(
          attachmentState as unknown as SingleMetricViewerEmbeddableState
        );

        const dataFormatter = fieldFormats.deserialize({
          id: FIELD_FORMAT_IDS.DATE,
        });

        const {
          job_ids: jobIds,
          time_range: timeRange,
          selected_detector_index: selectedDetectorIndex,
          selected_entities: selectedEntities,
          function_description: functionDescription,
          forecast_id: forecastId,
        } = embeddableState;
        const selectedJobId = jobIds[0];

        const listItems = [
          {
            title: (
              <FormattedMessage
                id="xpack.ml.cases.singleMetricViewer.description.jobIdLabel"
                defaultMessage="Job ID"
              />
            ),
            description: jobIds.join(', '),
          },
          {
            title: (
              <FormattedMessage
                id="xpack.ml.cases.singleMetricViewer.description.timeRangeLabel"
                defaultMessage="Time range"
              />
            ),
            description: `${dataFormatter.convertToText(
              timeRange!.from
            )} - ${dataFormatter.convertToText(timeRange!.to)}`,
          },
        ];

        return (
          <>
            <EuiDescriptionList compressed type={'inline'} listItems={listItems} />
            <SingleMetricViewerComponent
              bounds={{ min: moment(timeRange!.from), max: moment(timeRange!.to) }}
              lastRefresh={Date.now()}
              selectedJobId={selectedJobId}
              uuid={caseData.id}
              forecastId={forecastId}
              selectedDetectorIndex={selectedDetectorIndex}
              selectedEntities={selectedEntities}
              functionDescription={functionDescription}
            />
          </>
        );
      },
      (prevProps, nextProps) => deepEqual(prevProps.data.state, nextProps.data.state)
    );
  }
);
