/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiDescriptionList } from '@elastic/eui';
import type { UnifiedValueAttachmentViewProps } from '@kbn/cases-plugin/public';
import { EmbeddableRenderer } from '@kbn/embeddable-plugin/public';
import { FIELD_FORMAT_IDS } from '@kbn/field-formats-plugin/common';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import { FormattedMessage } from '@kbn/i18n-react';
import deepEqual from 'fast-deep-equal';
import { memoize } from 'lodash';
import React, { useMemo } from 'react';
import { BehaviorSubject } from 'rxjs';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import type { AnomalySwimLaneEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_swimlane';
import { ANOMALY_SWIMLANE_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_swimlane';
import { transformOut } from '../../common/embeddables/anomaly_swimlane/transform_out';
import type { AnomalySwimLaneAttachmentData } from '../../common/util/cases_utils';
import type { AnomalySwimLaneEmbeddableApi } from '../embeddables/anomaly_swimlane/types';
import type { AnomalySwimLaneAttachmentState } from '../embeddables';

type AnomalySwimLaneViewProps = UnifiedValueAttachmentViewProps<AnomalySwimLaneAttachmentData>;

export const initComponent = memoize((fieldFormats: FieldFormatsStart) => {
  return React.memo(
    (props: AnomalySwimLaneViewProps) => {
      const { caseData } = props;

      const attachmentState = props.data.state;
      const attachmentId = typeof attachmentState.id === 'string' ? attachmentState.id : undefined;

      const dataFormatter = fieldFormats.deserialize({
        id: FIELD_FORMAT_IDS.DATE,
      });

      const embeddableState = transformOut(
        attachmentState as unknown as AnomalySwimLaneEmbeddableState
      );

      // transformOut drops query/filters, so read them from the raw state.
      const { query, filters } = attachmentState as Partial<
        Pick<AnomalySwimLaneAttachmentState, 'query' | 'filters'>
      >;

      const parentApi = useMemo(
        () => ({
          getSerializedStateForChild: () => embeddableState,
          query$: new BehaviorSubject<Query | undefined>(query),
          filters$: new BehaviorSubject<Filter[] | undefined>(filters ?? []),
          timeRange$: new BehaviorSubject<TimeRange | undefined>(embeddableState.time_range),
          executionContext: {
            type: 'cases',
            description: caseData.title,
            id: caseData.id,
          },
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
      );

      const listItems = [
        {
          title: (
            <FormattedMessage
              id="xpack.ml.cases.anomalySwimLane.description.jobIdsLabel"
              defaultMessage="Job IDs"
            />
          ),
          description: embeddableState.job_ids.join(', '),
        },
        ...(embeddableState.swimlane_type === 'viewBy'
          ? [
              {
                title: (
                  <FormattedMessage
                    id="xpack.ml.cases.anomalySwimLane.description.viewByLabel"
                    defaultMessage="View by"
                  />
                ),
                description: embeddableState.view_by,
              },
            ]
          : []),
        ...(embeddableState.time_range
          ? [
              {
                title: (
                  <FormattedMessage
                    id="xpack.ml.cases.anomalySwimLane.description.timeRangeLabel"
                    defaultMessage="Time range"
                  />
                ),
                description: `${dataFormatter.convertToText(
                  embeddableState.time_range.from
                )} - ${dataFormatter.convertToText(embeddableState.time_range.to)}`,
              },
            ]
          : []),
        ...(typeof query?.query === 'string' && query.query !== ''
          ? [
              {
                title: (
                  <FormattedMessage
                    id="xpack.ml.cases.anomalySwimLane.description.queryLabel"
                    defaultMessage="Query"
                  />
                ),
                description: query.query,
              },
            ]
          : []),
      ];

      return (
        <>
          <EuiDescriptionList compressed type={'inline'} listItems={listItems} />
          <EmbeddableRenderer<AnomalySwimLaneEmbeddableState, AnomalySwimLaneEmbeddableApi>
            maybeId={attachmentId}
            type={ANOMALY_SWIMLANE_EMBEDDABLE_TYPE}
            getParentApi={() => parentApi}
          />
        </>
      );
    },
    (prevProps, nextProps) => deepEqual(prevProps.data.state, nextProps.data.state)
  );
});
