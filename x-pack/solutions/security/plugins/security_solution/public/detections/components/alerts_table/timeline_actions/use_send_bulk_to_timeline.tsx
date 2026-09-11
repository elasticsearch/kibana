/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TimelineItem, TimelineNonEcsData } from '@kbn/timelines-plugin/common';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { ALERT_RULE_TYPE } from '@kbn/rule-data-utils';
import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux-v7';
import type { TableId } from '@kbn/securitysolution-data-table';
import {
  dataTableActions,
  dataTableSelectors,
  tableDefaults,
} from '@kbn/securitysolution-data-table';
import set from '@kbn/safer-lodash-set/set';
import type { State } from '../../../../common/store/types';
import { useUpdateTimeline } from '../../../../timelines/components/open_timeline/use_update_timeline';
import { useCreateTimeline } from '../../../../timelines/hooks/use_create_timeline';
import { TimelineId } from '../../../../../common/types/timeline';
import { TimelineTypeEnum } from '../../../../../common/api/timeline';
import { sendBulkEventsToTimelineAction } from '../actions';
import type { CreateTimelineProps } from '../types';
import { ALERT_GROUP_ID } from '../../../../../common/field_maps/field_names';

const getNonEcsFieldValue = (data: TimelineNonEcsData[], field: string): string[] | undefined =>
  data.find((d) => d.field === field)?.value ?? undefined;

/**
 * Backfills kibana.alert.rule.type/kibana.alert.group.id from `item.data` onto `item.ecs`
 * for bulk selections, since only `_id`/`_index` are populated there by default.
 */
const enrichEcsForBulkSend = (item: TimelineItem): Ecs => {
  const ruleType = getNonEcsFieldValue(item.data, ALERT_RULE_TYPE);
  const groupId = getNonEcsFieldValue(item.data, ALERT_GROUP_ID);
  if (!ruleType && !groupId) {
    return item.ecs;
  }
  const enriched: Ecs = { ...item.ecs };
  if (ruleType) {
    set(enriched, ALERT_RULE_TYPE, ruleType);
  }
  if (groupId) {
    set(enriched, ALERT_GROUP_ID, groupId);
  }
  return enriched;
};

const { setSelected } = dataTableActions;

export interface UseSendBulkToTimelineProps {
  /** ID of the data table (e.g. alerts table) used to read selected event IDs and clear selection after sending to timeline. */
  tableId: TableId;
  /** Start of the time range applied to the timeline when bulk events are sent. */
  from: string;
  /** End of the time range applied to the timeline when bulk events are sent. */
  to: string;
}

/**
 * Hook that provides a handler to send bulk events to the timeline.
 * This can be used independently from the bulk actions table infrastructure.
 */
export const useSendBulkToTimeline = ({ tableId, from, to }: UseSendBulkToTimelineProps) => {
  const dispatch = useDispatch();

  const selectTableById = useMemo(() => dataTableSelectors.createTableSelector(tableId), [tableId]);
  const { selectedEventIds } = useSelector(
    (state: State) => selectTableById(state) ?? tableDefaults
  );

  const clearActiveTimeline = useCreateTimeline({
    timelineId: TimelineId.active,
    timelineType: TimelineTypeEnum.default,
  });

  const updateTimeline = useUpdateTimeline();

  const createTimeline = useCallback(
    async ({ timeline, ruleNote, timeline: { filters: eventIdFilters } }: CreateTimelineProps) => {
      await clearActiveTimeline();
      updateTimeline({
        duplicate: true,
        from,
        id: TimelineId.active,
        notes: [],
        timeline: {
          ...timeline,
          indexNames: timeline.indexNames ?? [],
          show: true,
          filters: eventIdFilters,
        },
        to,
        ruleNote,
      });
    },
    [updateTimeline, clearActiveTimeline, from, to]
  );

  const sendBulkEventsToTimelineHandler = useCallback(
    (items: TimelineItem[]) => {
      sendBulkEventsToTimelineAction(createTimeline, items.map(enrichEcsForBulkSend), 'KqlFilter');

      dispatch(
        setSelected({
          id: tableId,
          isSelectAllChecked: false,
          isSelected: false,
          eventIds: selectedEventIds,
        })
      );
    },
    [dispatch, createTimeline, selectedEventIds, tableId]
  );

  return { sendBulkEventsToTimelineHandler };
};
