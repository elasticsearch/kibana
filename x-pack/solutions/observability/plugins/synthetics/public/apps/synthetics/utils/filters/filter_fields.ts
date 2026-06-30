/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { invert } from 'lodash';
import type { ServiceLocations } from '../../../../../common/runtime_types';
import { MonitorTypeEnum } from '../../../../../common/runtime_types';
import type { MonitorFilterState } from '../../state';

export type SyntheticsMonitorFilterField = keyof Omit<
  MonitorFilterState,
  'query' | 'monitorQueryIds' | 'showFromAllSpaces' | 'dateRangeStart' | 'dateRangeEnd'
>;

export interface LabelWithCountValue {
  label: string;
  count: number;
}

export interface SyntheticsMonitorFilterItem {
  label: string;
  values: LabelWithCountValue[];
  field: SyntheticsMonitorFilterField;
}

export function getMonitorFilterFields(): SyntheticsMonitorFilterField[] {
  return [
    'tags',
    'locations',
    'monitorTypes',
    'projects',
    'schedules',
    'remoteNames',
    'useLogicalAndFor',
  ];
}

export type SyntheticsMonitorFilterChangeHandler = (
  field: SyntheticsMonitorFilterField,
  selectedValues: string[] | undefined,
  isLogicalAND?: boolean
) => void;

export function getSyntheticsFilterDisplayValues(
  values: LabelWithCountValue[],
  field: SyntheticsMonitorFilterField,
  locations: ServiceLocations
) {
  switch (field) {
    case 'monitorTypes':
      return values.map(({ label, count }: { label: string; count: number }) => ({
        label: monitorTypeKeyLabelMap[label as MonitorTypeEnum] ?? label,
        count,
      }));
    case 'schedules':
      return values.map(({ label, count }: { label: string; count: number }) => ({
        label: i18n.translate('xpack.synthetics.monitorFilters.frequencyLabel', {
          defaultMessage: `Every {count} minutes`,
          values: { count: label },
        }),
        count,
      }));
    case 'locations':
      return values.map(({ label, count }) => {
        const foundLocation = locations.find(
          ({ id: locationId, label: locationLabel }) =>
            label === locationId || label === locationLabel
        );
        return {
          label: foundLocation?.label ?? label,
          count,
        };
      });
    default:
      return values;
  }
}

export function getSyntheticsFilterKeyForLabel(value: string, field: SyntheticsMonitorFilterField) {
  switch (field) {
    case 'monitorTypes':
      return invert(monitorTypeKeyLabelMap)[value] ?? value;
    case 'schedules':
      return (value ?? '').replace(/\D/g, '');
    default:
      return value;
  }
}

export const valueToLabelWithEmptyCount = (value?: string | string[]): LabelWithCountValue[] => {
  if (Array.isArray(value)) {
    return value.map((v) => ({ label: v, count: 0 }));
  }
  return value ? [{ label: value, count: 0 }] : [];
};

export const monitorTypeKeyLabelMap: Record<MonitorTypeEnum, string> = {
  [MonitorTypeEnum.BROWSER]: 'Journey / Page',
  [MonitorTypeEnum.HTTP]: 'HTTP',
  [MonitorTypeEnum.TCP]: 'TCP',
  [MonitorTypeEnum.ICMP]: 'ICMP',
};
