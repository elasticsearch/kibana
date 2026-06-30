/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Type, TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { isEmpty } from 'lodash';
import { escapeQuotes } from '@kbn/es-query';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { useLogicalAndFields } from '../../common/constants';
import type { RouteContext } from './types';
import { MonitorSortFieldSchema } from '../../common/runtime_types/monitor_management/sort_field';
import { getAllLocations } from '../synthetics_service/get_all_locations';
import type { PrivateLocation, ServiceLocation } from '../../common/runtime_types';
import { syntheticsMonitorAttributes } from '../../common/types/saved_objects';

// A datemath expression or ISO-8601 timestamp is well under this; the cap only
// exists to keep the date-range query params from being unbounded strings.
const MAX_DATE_RANGE_PARAM_LENGTH = 256;
const MAX_MONITOR_QUERY_IDS_IN_BODY = 10000;
const MAX_MONITOR_QUERY_ID_LENGTH = 256;

const StringOrArraySchema = schema.maybe(
  schema.oneOf([schema.string(), schema.arrayOf(schema.string())])
);

const UseLogicalAndFieldLiterals = useLogicalAndFields.map((f) => schema.literal(f)) as [
  Type<string>
];

const CommonQuerySchema = {
  query: schema.maybe(schema.string()),
  filter: schema.maybe(schema.string()),
  tags: StringOrArraySchema,
  monitorTypes: StringOrArraySchema,
  locations: StringOrArraySchema,
  projects: StringOrArraySchema,
  schedules: StringOrArraySchema,
  // Remote cluster aliases. Only honoured by the overview status route, where
  // it scopes pings to documents whose `_index` is prefixed by one of the
  // selected aliases (CCS pattern `<alias>:<index>`). Saved-object-backed
  // routes ignore it because remote monitors have no local saved object.
  remoteNames: StringOrArraySchema,
  status: StringOrArraySchema,
  monitorQueryIds: StringOrArraySchema,
  configIds: StringOrArraySchema,
  showFromAllSpaces: schema.maybe(schema.boolean()),
  useLogicalAndFor: schema.maybe(
    schema.oneOf([schema.string(), schema.arrayOf(schema.oneOf(UseLogicalAndFieldLiterals))])
  ),
  // Date-range window for the overview list (see runtime type docs). The
  // overview page always sends these; their presence scopes each monitor's
  // status to the window instead of the default "current status" look-back.
  // Bounded length: these only ever carry a short datemath expression
  // (`now-15m`) or an ISO-8601 timestamp, so cap the input to avoid unbounded
  // strings reaching `datemath.parse` (CodeQL: unbounded string DoS).
  dateRangeStart: schema.maybe(schema.string({ maxLength: MAX_DATE_RANGE_PARAM_LENGTH })),
  dateRangeEnd: schema.maybe(schema.string({ maxLength: MAX_DATE_RANGE_PARAM_LENGTH })),
};

export const QuerySchema = schema.object({
  ...CommonQuerySchema,
  page: schema.maybe(schema.number()),
  perPage: schema.maybe(schema.number()),
  sortField: MonitorSortFieldSchema,
  sortOrder: schema.maybe(schema.oneOf([schema.literal('desc'), schema.literal('asc')])),
  searchAfter: schema.maybe(schema.arrayOf(schema.string())),
  internal: schema.maybe(
    schema.boolean({
      defaultValue: false,
    })
  ),
});

export type MonitorsQuery = TypeOf<typeof QuerySchema>;

export const OverviewStatusSchema = schema.object({
  ...CommonQuerySchema,
  scopeStatusByLocation: schema.maybe(schema.boolean()),
  groupByMonitor: schema.maybe(schema.boolean()),
});

export type OverviewStatusQuery = TypeOf<typeof OverviewStatusSchema>;

export const OverviewStatusStaleBodySchema = schema.object({
  monitorQueryIds: schema.arrayOf(schema.string({ maxLength: MAX_MONITOR_QUERY_ID_LENGTH }), {
    minSize: 1,
    maxSize: MAX_MONITOR_QUERY_IDS_IN_BODY,
  }),
});

export type OverviewStatusStaleBody = TypeOf<typeof OverviewStatusStaleBodySchema>;

export const MONITOR_SEARCH_FIELDS = [
  'name',
  'tags.text',
  'locations.id.text',
  'locations.label',
  'urls',
  'hosts',
  'project_id.text',
];

/**
 * Ping-document equivalents of `MONITOR_SEARCH_FIELDS`, used to scope the
 * overview status aggregation by the search box query.
 *
 * These MUST stay aligned with the saved-object search fields above: the
 * overview lists monitors via the saved-object search but derives each
 * monitor's status from ping data matched by these fields. A field that lists a
 * monitor (e.g. by location or host) but is not matched here would strip that
 * monitor's status data, misclassifying it — e.g. a `stale` monitor would read
 * as `pending`.
 */
export const MONITOR_STATUS_PING_SEARCH_FIELDS = [
  'monitor.name',
  'monitor.name.text',
  'tags',
  'observer.name',
  'observer.geo.name',
  'urls',
  'hosts',
  'url.full',
  'url.domain',
  'monitor.project.id',
];

interface Filters {
  filter?: string;
  tags?: string | string[];
  monitorTypes?: string | string[];
  locations?: string | string[];
  projects?: string | string[];
  schedules?: string | string[];
  monitorQueryIds?: string | string[];
  configIds?: string | string[];
}

export const getMonitorFilters = async (
  context: RouteContext<Record<string, any>, OverviewStatusQuery>,
  attr: string = syntheticsMonitorAttributes
) => {
  const {
    tags,
    monitorTypes,
    filter = '',
    projects,
    schedules,
    monitorQueryIds,
    configIds,
    locations: queryLocations,
    useLogicalAndFor,
  } = context.request.query;
  const locations = await parseLocationFilter(context, queryLocations);

  return parseArrayFilters(
    {
      filter,
      tags,
      monitorTypes,
      projects,
      schedules,
      monitorQueryIds,
      configIds,
      locations,
    },
    useLogicalAndFor,
    attr
  );
};

export const parseArrayFilters = (
  {
    tags,
    filter,
    configIds,
    projects,
    monitorTypes,
    schedules,
    monitorQueryIds,
    locations,
  }: Filters,
  useLogicalAndFor: MonitorsQuery['useLogicalAndFor'] = [],
  attributes: string = syntheticsMonitorAttributes
) => {
  const filtersStr = [
    filter,
    getSavedObjectKqlFilter({
      field: 'tags',
      values: tags,
      operator: useLogicalAndFor.includes('tags') ? 'AND' : 'OR',
      attributes,
    }),
    getSavedObjectKqlFilter({ field: 'project_id', values: projects, attributes }),
    getSavedObjectKqlFilter({ field: 'type', values: monitorTypes, attributes }),
    getSavedObjectKqlFilter({
      field: 'locations.id',
      values: locations,
      operator: useLogicalAndFor.includes('locations') ? 'AND' : 'OR',
      attributes,
    }),
    getSavedObjectKqlFilter({ field: 'schedule.number', values: schedules, attributes }),
    getSavedObjectKqlFilter({ field: 'id', values: monitorQueryIds, attributes }),
    getSavedObjectKqlFilter({ field: 'config_id', values: configIds, attributes }),
  ]
    .filter((f) => !!f)
    .join(' AND ');

  return { filtersStr, locationIds: locations };
};

export const getSavedObjectKqlFilter = ({
  field,
  values,
  operator = 'OR',
  searchAtRoot = false,
  attributes = syntheticsMonitorAttributes,
}: {
  field: string;
  values?: string | string[];
  operator?: string;
  searchAtRoot?: boolean;
  attributes?: string;
}) => {
  if (values === 'All' || (Array.isArray(values) && values?.includes('All'))) {
    return undefined;
  }

  if (isEmpty(values) || !values) {
    return '';
  }
  let fieldKey = '';
  if (searchAtRoot) {
    fieldKey = `${field}`;
  } else {
    fieldKey = `${attributes}.${field}`;
  }

  if (Array.isArray(values)) {
    return `${fieldKey}:(${values
      .map((value) => `"${escapeQuotes(value)}"`)
      .join(` ${operator} `)})`;
  }

  return `${fieldKey}:"${escapeQuotes(values)}"`;
};

export const parseLocationFilter = async (
  {
    syntheticsMonitorClient,
    savedObjectsClient,
    server,
  }: Pick<RouteContext, 'syntheticsMonitorClient' | 'savedObjectsClient' | 'server'>,
  locations?: string | string[]
) => {
  if (!locations || locations?.length === 0) {
    return;
  }

  const { allLocations } = await getAllLocations({
    syntheticsMonitorClient,
    savedObjectsClient,
    server,
    excludeAgentPolicies: true,
  });

  if (Array.isArray(locations)) {
    return locations
      .map((loc) => findLocationItem(loc, allLocations)?.id ?? '')
      .filter((val) => !!val);
  }

  return [findLocationItem(locations, allLocations)?.id ?? ''];
};

export const findLocationItem = (
  query: string,
  locations: Array<ServiceLocation | PrivateLocation>
) => {
  return locations.find(({ id, label }) => query === id || label === query);
};

/**
 * Returns whether the query is likely to return a subset of monitor objects.
 * Useful where `absoluteTotal` needs to be determined with a separate call
 * @param monitorQuery { MonitorsQuery }
 */
export const isMonitorsQueryFiltered = (monitorQuery: MonitorsQuery) => {
  const {
    query,
    tags,
    monitorTypes,
    locations,
    status,
    filter,
    projects,
    schedules,
    remoteNames,
    monitorQueryIds,
    configIds,
  } = monitorQuery;

  return (
    !!query ||
    !!filter ||
    !!locations?.length ||
    !!monitorTypes?.length ||
    !!tags?.length ||
    !!status?.length ||
    !!projects?.length ||
    !!schedules?.length ||
    !!remoteNames?.length ||
    !!monitorQueryIds?.length ||
    !!configIds?.length
  );
};

export function parseMappingKey(key: string | undefined) {
  switch (key) {
    case 'schedule.keyword':
      return 'schedule.number';
    case 'project_id.keyword':
      return 'project_id';
    default:
      return key;
  }
}

export const validateRouteSpaceName = async (routeContext: RouteContext) => {
  const { spaceId, server, request, response } = routeContext;
  if (spaceId === DEFAULT_SPACE_ID) {
    // default space is always valid
    return { spaceId: DEFAULT_SPACE_ID };
  }

  try {
    await server.spaces?.spacesService.getActiveSpace(request);
  } catch (error) {
    if (error.output?.statusCode === 404) {
      return {
        spaceId,
        invalidResponse: response.notFound({
          body: { message: `Kibana space '${spaceId}' does not exist` },
        }),
      };
    }
  }

  return { invalidResponse: undefined };
};
