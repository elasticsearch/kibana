/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import type { DataGridCellValueElementProps } from '@kbn/unified-data-table';
import type { TimelineNonEcsData } from '@kbn/timelines-plugin/common';
import type { SecuritySolutionCellRendererFeature } from '@kbn/discover-shared-plugin/public';
import type { ColumnHeaderType } from '../../../common/types';
import type { Maybe } from '../../../common/search_strategy';
import { DefaultCellRenderer } from '../../timelines/components/timeline/cell_rendering/default_cell_renderer';
import {
  IP_FIELD_TYPE,
  LEGACY_SIGNAL_RULE_NAME_FIELD_NAME,
  SIGNAL_RULE_NAME_FIELD_NAME,
  SIGNAL_STATUS_FIELD_NAME,
} from '../../timelines/components/timeline/body/renderers/constants';
import { getEcsField } from '../../flyout/document_details/right/components/table_field_name_cell';
import type { StartServices } from '../../types';
import type { SecurityAppStore } from '../../common/store/types';
import { IpCellRenderer } from './ip_cell_renderer';
import { RuleNameCellRenderer } from './rule_name_cell_renderer';
import { HostCellRenderer, HOST_CELL_RENDERER_FIELDS } from './host_cell_renderer';
import { ONE_DISCOVER_SCOPE_ID } from '../constants';

export type SecuritySolutionRowCellRendererGetter = Awaited<
  ReturnType<SecuritySolutionCellRendererFeature['getRenderer']>
>;

/**
 *
 * This controls the list of fields that are allowed custom security solution rendering
 * in Discover's contextual View
 * Also see: src/platform/plugins/shared/discover/public/context_awareness/profile_providers/security/constants.ts
 */
const ALLOWED_DISCOVER_RENDERED_FIELDS = new Set([
  SIGNAL_STATUS_FIELD_NAME,
  SIGNAL_RULE_NAME_FIELD_NAME,
  LEGACY_SIGNAL_RULE_NAME_FIELD_NAME,
  ...HOST_CELL_RENDERER_FIELDS,
]);

export const getCellRendererForGivenRecord = (
  services: StartServices,
  store: SecurityAppStore
): SecuritySolutionRowCellRendererGetter => {
  return (fieldName: string) => {
    if (ALLOWED_DISCOVER_RENDERED_FIELDS.has(fieldName)) {
      if (
        fieldName === SIGNAL_RULE_NAME_FIELD_NAME ||
        fieldName === LEGACY_SIGNAL_RULE_NAME_FIELD_NAME
      ) {
        return function RuleNameFieldRenderer(props: DataGridCellValueElementProps) {
          return <RuleNameCellRenderer {...props} services={services} store={store} />;
        };
      }

      if (HOST_CELL_RENDERER_FIELDS.has(fieldName)) {
        return function HostFieldRenderer(props: DataGridCellValueElementProps) {
          return <HostCellRenderer {...props} services={services} store={store} />;
        };
      }

      return function UnifiedFieldRenderBySecuritySolution(props: DataGridCellValueElementProps) {
        // convert discover data format to timeline data format
        const data: TimelineNonEcsData[] = useMemo(
          () =>
            Object.keys(props.row.flattened).map((field) => ({
              field,
              value: Array.isArray(props.row.flattened[field])
                ? (props.row.flattened[field] as Maybe<string[]>)
                : ([props.row.flattened[field]] as Maybe<string[]>),
            })),
          [props.row.flattened]
        );

        const header = useMemo(() => {
          return {
            id: props.columnId,
            columnHeaderType: 'not-filtered' as ColumnHeaderType,
            type:
              props.columnsMeta?.[props.columnId]?.type ??
              props.dataView.getFieldByName(props.columnId)?.type,
          };
        }, [props.columnId, props.dataView, props.columnsMeta]);

        return (
          <DefaultCellRenderer
            data={data}
            ecsData={undefined}
            eventId={props.row.id}
            header={header}
            isDetails={props.isDetails}
            isTimeline={false}
            linkValues={undefined}
            rowRenderers={undefined}
            scopeId={ONE_DISCOVER_SCOPE_ID}
            asPlainText={false}
            context={undefined}
            isExpandable={props.isExpandable}
            rowIndex={props.rowIndex}
            colIndex={props.colIndex}
            setCellProps={props.setCellProps}
            isExpanded={props.isExpanded}
            columnId={props.columnId}
          />
        );
      };
    }

    const ecsField = getEcsField(fieldName);
    if (ecsField?.type === IP_FIELD_TYPE) {
      return function IpFieldRenderer(props: DataGridCellValueElementProps) {
        return <IpCellRenderer {...props} services={services} store={store} />;
      };
    }

    return undefined;
  };
};
