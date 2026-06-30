/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import type { Mixed } from 'io-ts';
import { useLogicalAndFields } from '../../constants/filters_fields_with_logical_and';

const useLogicalAndFileLiteral = useLogicalAndFields.map((f) => t.literal(f)) as unknown as [
  Mixed,
  Mixed,
  ...Mixed[]
];

const FetchMonitorQueryArgsCommon = {
  query: t.string,
  searchFields: t.array(t.string),
  tags: t.array(t.string),
  locations: t.array(t.string),
  monitorTypes: t.array(t.string),
  projects: t.array(t.string),
  schedules: t.array(t.string),
  remoteNames: t.array(t.string),
  monitorQueryIds: t.array(t.string),
  configIds: t.array(t.string),
  sortField: t.string,
  sortOrder: t.union([t.literal('desc'), t.literal('asc')]),
  showFromAllSpaces: t.boolean,
  useLogicalAndFor: t.array(t.union(useLogicalAndFileLiteral)),
  // Date-range window for the overview list. When `[dateRangeStart, dateRangeEnd]`
  // are present, the server scopes each monitor's status to that window (and
  // surfaces monitors with no run in the window as `pending`). The range strings
  // accept datemath (e.g. `now-24h`) or ISO timestamps.
  dateRangeStart: t.string,
  dateRangeEnd: t.string,
};

export const FetchMonitorManagementListQueryArgsCodec = t.partial({
  ...FetchMonitorQueryArgsCommon,
  page: t.number,
  perPage: t.number,
  internal: t.boolean,
});

export type FetchMonitorManagementListQueryArgs = t.TypeOf<
  typeof FetchMonitorManagementListQueryArgsCodec
>;

export const FetchMonitorOverviewQueryArgsCodec = t.partial({
  ...FetchMonitorQueryArgsCommon,
});

export type FetchMonitorOverviewQueryArgs = t.TypeOf<typeof FetchMonitorOverviewQueryArgsCodec>;

export const MonitorManagementEnablementResultCodec = t.type({
  isEnabled: t.boolean,
  canEnable: t.boolean,
  canManageApiKeys: t.boolean,
  areApiKeysEnabled: t.boolean,
  isValidApiKey: t.boolean,
  isServiceAllowed: t.boolean,
});

export type MonitorManagementEnablementResult = t.TypeOf<
  typeof MonitorManagementEnablementResultCodec
>;
