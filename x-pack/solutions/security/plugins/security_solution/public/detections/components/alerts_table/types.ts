/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ISearchStart } from '@kbn/data-plugin/public';
import type { Filter } from '@kbn/es-query';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import type { AlertsTablePropsWithRef } from '@kbn/response-ops-alerts-table/types';
import type { TableId } from '@kbn/securitysolution-data-table';
import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import type { GroupingBucket } from '@kbn/grouping/src';
import type { PageScope } from '../../../data_view_manager/constants';
import type { AlertsUserProfilesData } from '../../configurations/security_solution_detections/fetch_page_context';
import type { Status } from '../../../../common/api/detection_engine';
import type { Note } from '../../../../common/api/timeline';
import type { DataProvider } from '../../../timelines/components/timeline/data_providers/data_provider';
import type { TimelineModel } from '../../../timelines/store/model';
import type { ControlColumnProps, RowRenderer } from '../../../../common/types';
import type { AlertsGroupingAggregation } from './grouping_settings/types';

export interface SetEventsLoadingProps {
  eventIds: string[];
  isLoading: boolean;
}

export interface SetEventsDeletedProps {
  eventIds: string[];
  isDeleted: boolean;
}

export interface UpdateAlertStatusActionProps {
  query?: string;
  alertIds: string[];
  selectedStatus: Status;
  setEventsLoading: ({ eventIds, isLoading }: SetEventsLoadingProps) => void;
  setEventsDeleted: ({ eventIds, isDeleted }: SetEventsDeletedProps) => void;
  onAlertStatusUpdateSuccess: (updated: number, conflicts: number, status: Status) => void;
  onAlertStatusUpdateFailure: (status: Status, error: Error) => void;
}

export interface SendAlertToTimelineActionProps {
  createTimeline: CreateTimeline;
  ecsData: Ecs | Ecs[];
  searchStrategyClient: ISearchStart;
  getExceptionFilter: GetExceptionFilter;
}

export interface CreateTimelineProps {
  from: string;
  timeline: TimelineModel;
  to: string;
  notes: Note[] | null;
  ruleNote?: string;
  ruleAuthor?: string | string[];
}

export type CreateTimeline = ({ from, timeline, to }: CreateTimelineProps) => Promise<void>;
export type GetExceptionFilter = (ecsData: Ecs) => Promise<Filter | undefined>;

export interface ThresholdAggregationData {
  thresholdFrom: string;
  thresholdTo: string;
  dataProviders: DataProvider[];
}

export type AlertTableContextMenuItem = EuiContextMenuPanelItemDescriptor;

export interface SecurityAlertsTableContext {
  tableType: TableId;
  rowRenderers?: RowRenderer[];
  isDetails: boolean;
  truncate?: boolean;
  isDraggable: boolean;
  leadingControlColumn: ControlColumnProps;
  userProfiles: AlertsUserProfilesData;
  pageScope: PageScope;
  /**
   * Per-source-instance UUID minted by `AlertsTableComponent` at mount.
   * Passed here so `ActionsCell` can dispatch row-expand actions via the
   * correct pagination slice without relying on a global singleton.
   */
  paginationInstanceId: string;
}

export type SecurityAlertsTableProps = AlertsTablePropsWithRef<SecurityAlertsTableContext>;
export type GetSecurityAlertsTableProp<PropKey extends keyof SecurityAlertsTableProps> =
  NonNullable<SecurityAlertsTableProps[PropKey]>;

export type GroupTakeActionItems = (props: {
  /**
   * Query to run when an item is clicked (meaning when an alert status is updated)
   */
  query?: string;
  /**
   * Id of the table (used for telemetry)
   */
  tableId: string;
  /**
   * Group number to know which group to apply the logic to. This value is coming from the callback in the kbn-grouping package.
   */
  groupNumber: number;
  /**
   * Selected group to know which group is extended/visible. This is coming from the getLevel function in the detections alert grouping code.
   */
  selectedGroup: string;
  /**
   * Meta-data about the selected group
   */
  groupBucket: GroupingBucket<AlertsGroupingAggregation>;
  /**
   * Callback to close the containing popover menu
   */
  closePopover: () => void;
}) => JSX.Element | undefined;
