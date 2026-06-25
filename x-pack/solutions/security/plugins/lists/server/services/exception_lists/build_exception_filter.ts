/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import agent from 'elastic-apm-node';
import { chunk } from 'lodash/fp';
import type {
  CreateExceptionListItemSchema,
  Entry,
  EntryExists,
  EntryList,
  EntryMatch,
  EntryMatchAny,
  EntryMatchWildcard,
  EntryNested,
  ExceptionListItemSchema,
  OsTypeArray,
  Type,
} from '@kbn/securitysolution-io-ts-list-types';
import {
  entriesExists,
  entriesList,
  entriesMatch,
  entriesMatchAny,
  entriesMatchWildcard,
  entriesNested,
} from '@kbn/securitysolution-io-ts-list-types';
import type { Filter } from '@kbn/es-query';
import type { estypes } from '@elastic/elasticsearch';
import { partition } from 'lodash';
import { hasLargeValueList } from '@kbn/securitysolution-list-utils';
import {
  MAXIMUM_SMALL_IP_RANGE_VALUE_LIST_DASH_SIZE,
  MAXIMUM_SMALL_VALUE_LIST_SIZE,
} from '@kbn/securitysolution-list-constants';

import {
  SECURITY_NUM_LARGE_LIST_EXCEPTIONS,
  SECURITY_NUM_REGULAR_EXCEPTIONS,
  SECURITY_NUM_SMALL_LIST_EXCEPTIONS,
} from '../../apm_field_names';
import type { ListClient } from '../..';

type ExceptionEntry = Entry | EntryNested;
export interface BooleanFilter {
  bool: estypes.QueryDslBoolQuery;
}

export interface NestedFilter {
  nested: estypes.QueryDslNestedQuery;
}

export const chunkExceptions = <T extends ExceptionListItemSchema | CreateExceptionListItemSchema>(
  exceptions: T[],
  chunkSize: number
): T[][] => {
  return chunk(chunkSize, exceptions);
};

/**
 * Transforms the os_type into a regular filter as if the user had created it
 * from the fields for the next state of transforms which will create the elastic filters
 * from it.
 *
 * Note: We use two types of fields, the "host.os.type" and "host.os.name.caseless"
 * The endpoint/endgame agent has been using "host.os.name.caseless" as the same value as the ECS
 * value of "host.os.type" where the auditbeat, winlogbeat, etc... (other agents) are all using
 * "host.os.type". In order to be compatible with both, I create an "OR" between these two data types
 * where if either has a match then we will exclude it as part of the match. This should also be
 * forwards compatible for endpoints/endgame agents when/if they upgrade to using "host.os.type"
 * rather than using "host.os.name.caseless" values.
 *
 * Also we create another "OR" from the osType names so that if there are multiples such as ['windows', 'linux']
 * this will exclude anything with either 'windows' or with 'linux'
 * @param osTypes The os_type array from the REST interface that is an array such as ['windows', 'linux']
 * @param entries The entries to join the OR's with before the elastic filter change out
 */
export const transformOsType = (
  osTypes: OsTypeArray,
  entries: ExceptionEntry[]
): ExceptionEntry[][] => {
  const hostTypeTransformed = osTypes.map<ExceptionEntry[]>((osType) => {
    return [
      { field: 'host.os.type', operator: 'included', type: 'match', value: osType },
      ...entries,
    ];
  });
  const caseLessTransformed = osTypes.map<ExceptionEntry[]>((osType) => {
    return [
      { field: 'host.os.name.caseless', operator: 'included', type: 'match', value: osType },
      ...entries,
    ];
  });
  return [...hostTypeTransformed, ...caseLessTransformed];
};

/**
 * This builds an exception item filter with the os type
 * @param osTypes The os_type array from the REST interface that is an array such as ['windows', 'linux']
 * @param entries The entries to join the OR's with before the elastic filter change out
 */
export const buildExceptionItemFilterWithOsType = async (
  osTypes: OsTypeArray,
  entries: ExceptionEntry[],
  listClient: ListClient
): Promise<BooleanFilter[] | undefined> => {
  let isUnprocessable = false;
  const entriesWithOsTypes = transformOsType(osTypes, entries);
  const exceptionItemFilter: BooleanFilter[] = [];
  await Promise.all(
    entriesWithOsTypes.map(async (entryWithOsType) => {
      const esFilter: Array<BooleanFilter | NestedFilter> = [];
      await Promise.all(
        entryWithOsType.map(async (entry) => {
          const filter = await createInnerAndClauses({
            entry,
            listClient,
          });
          if (!filter) {
            isUnprocessable = true;
            return;
          }
          esFilter.push(filter);
        })
      );
      exceptionItemFilter.push({
        bool: {
          filter: esFilter,
        },
      });
    })
  );
  return isUnprocessable ? undefined : exceptionItemFilter;
};

export const buildExceptionItemFilter = async <
  T extends ExceptionListItemSchema | CreateExceptionListItemSchema
>(
  exceptionItem: T,
  listClient: ListClient
): Promise<Array<BooleanFilter | NestedFilter> | undefined> => {
  const { entries, os_types: osTypes } = exceptionItem;
  if (osTypes != null && osTypes.length > 0) {
    return buildExceptionItemFilterWithOsType(osTypes, entries, listClient);
  } else {
    if (entries.length === 1) {
      const filter = await createInnerAndClauses({
        entry: entries[0],
        listClient,
      });
      if (!filter) {
        return undefined;
      }
      return [filter];
    } else {
      const esFilter: Array<BooleanFilter | NestedFilter> = [];

      for (const entry of entries) {
        const filter = await createInnerAndClauses({
          entry,
          listClient,
        });
        if (!filter) {
          return undefined;
        }
        esFilter.push(filter);
      }

      return [
        {
          bool: {
            filter: esFilter,
          },
        },
      ];
    }
  }
};

export const createOrClauses = async <
  T extends ExceptionListItemSchema | CreateExceptionListItemSchema
>({
  exceptionsWithoutValueLists,
  exceptionsWithValueLists,
  chunkSize,
  listClient,
}: {
  exceptionsWithoutValueLists: T[];
  exceptionsWithValueLists: T[];
  chunkSize: number;
  listClient: ListClient;
}): Promise<{
  orClauses: Array<BooleanFilter | NestedFilter>;
  unprocessableExceptionItems: T[];
}> => {
  const unprocessableExceptionItems: T[] = [];
  const orClauses: Array<Array<BooleanFilter | NestedFilter>> = [];

  for (const exceptionItem of exceptionsWithoutValueLists) {
    const filter = await buildExceptionItemFilter(exceptionItem, listClient);
    if (!filter) {
      unprocessableExceptionItems.push(exceptionItem);
    } else {
      orClauses.push(filter);
    }
  }

  // Chunk the exceptions that will require list client requests
  const chunks = chunkExceptions(exceptionsWithValueLists, chunkSize);
  for (const exceptionsChunk of chunks) {
    await Promise.all(
      exceptionsChunk.map(async (exceptionItem) => {
        const filter = await buildExceptionItemFilter(exceptionItem, listClient);
        if (!filter) {
          unprocessableExceptionItems.push(exceptionItem);
          return;
        }
        orClauses.push(filter);
      })
    );
  }

  return { orClauses: orClauses.flat(), unprocessableExceptionItems };
};

const isListTypeProcessable = (type: Type): boolean =>
  type === 'keyword' ||
  type === 'ip' ||
  type === 'ip_range' ||
  type === 'byte' ||
  type === 'integer_range' ||
  type === 'float_range' ||
  type === 'long_range' ||
  type === 'double_range' ||
  type === 'date_range' ||
  type === 'geo_point' ||
  type === 'geo_shape' ||
  type === 'shape';

export const filterOutUnprocessableValueLists = async <
  T extends ExceptionListItemSchema | CreateExceptionListItemSchema
>(
  exceptionItems: T[],
  listClient: ListClient
): Promise<{
  filteredExceptions: T[];
  unprocessableValueListExceptions: T[];
}> => {
  const exceptionBooleans = await Promise.all(
    exceptionItems.map(async (exceptionItem) => {
      const listEntries = exceptionItem.entries.filter((entry): entry is EntryList =>
        entriesList.is(entry)
      );
      for await (const listEntry of listEntries) {
        const {
          list: { id, type },
        } = listEntry;

        if (!isListTypeProcessable(type)) {
          return false;
        }

        // Don't want any items, just the total list size
        const valueList = await listClient.findListItem({
          currentIndexPosition: 0,
          filter: '',
          listId: id,
          page: 0,
          perPage: 0,
          runtimeMappings: undefined,
          searchAfter: [],
          sortField: undefined,
          sortOrder: undefined,
        });

        if (!valueList || (valueList && valueList.total > MAXIMUM_SMALL_VALUE_LIST_SIZE)) {
          return false;
        }
      }
      // If we're here, all the entries are processable
      return true;
    })
  );
  const filteredExceptions = exceptionItems.filter((item, index) => exceptionBooleans[index]);
  const unprocessableValueListExceptions = exceptionItems.filter(
    (item, index) => !exceptionBooleans[index]
  );

  return { filteredExceptions, unprocessableValueListExceptions };
};

export const removeExpiredExceptions = <
  T extends ExceptionListItemSchema | CreateExceptionListItemSchema
>(
  lists: T[],
  startedAt: Date
): T[] =>
  lists.filter((listItem) => {
    if (listItem.expire_time && new Date(listItem.expire_time) < startedAt) {
      return false;
    }
    return true;
  });

export const buildExceptionFilter = async <
  T extends ExceptionListItemSchema | CreateExceptionListItemSchema
>({
  lists,
  excludeExceptions,
  chunkSize,
  alias = null,
  listClient,
  startedAt,
}: {
  lists: T[];
  excludeExceptions: boolean;
  chunkSize: number;
  alias: string | null;
  listClient: ListClient;
  startedAt: Date;
}): Promise<{ filter: Filter | undefined; unprocessedExceptions: T[] }> => {
  const filteredLists = removeExpiredExceptions<T>(lists, startedAt);

  // Remove exception items with large value lists. These are evaluated
  // elsewhere for the moment being.
  const [exceptionsWithoutValueLists, valueListExceptions] = partition(
    filteredLists,
    (item): item is T => !hasLargeValueList(item.entries)
  );

  // Exceptions that contain large value list exceptions and will be processed later on in rule execution
  const unprocessedExceptions: T[] = [];

  const { filteredExceptions: exceptionsWithValueLists, unprocessableValueListExceptions } =
    await filterOutUnprocessableValueLists<T>(valueListExceptions, listClient);
  unprocessedExceptions.push(...unprocessableValueListExceptions);

  if (exceptionsWithoutValueLists.length === 0 && exceptionsWithValueLists.length === 0) {
    agent.setCustomContext({
      [SECURITY_NUM_LARGE_LIST_EXCEPTIONS]: unprocessedExceptions.length,
      [SECURITY_NUM_REGULAR_EXCEPTIONS]: 0,
      [SECURITY_NUM_SMALL_LIST_EXCEPTIONS]: 0,
    });
    return { filter: undefined, unprocessedExceptions };
  }
  const { orClauses, unprocessableExceptionItems } = await createOrClauses<T>({
    chunkSize,
    exceptionsWithValueLists,
    exceptionsWithoutValueLists,
    listClient,
  });

  agent.setCustomContext({
    [SECURITY_NUM_LARGE_LIST_EXCEPTIONS]:
      unprocessableValueListExceptions.length + unprocessableExceptionItems.length,
    [SECURITY_NUM_REGULAR_EXCEPTIONS]: exceptionsWithoutValueLists.length,
    [SECURITY_NUM_SMALL_LIST_EXCEPTIONS]:
      exceptionsWithValueLists.length - unprocessableExceptionItems.length,
  });

  const exceptionFilter: Filter = {
    meta: {
      alias,
      disabled: false,
      negate: excludeExceptions,
    },
    query: {
      bool: {
        should: orClauses,
      },
    },
  };
  unprocessedExceptions.concat(unprocessableExceptionItems);
  return { filter: exceptionFilter, unprocessedExceptions };
};

export const buildExclusionClause = (booleanFilter: BooleanFilter): BooleanFilter => {
  return {
    bool: {
      must_not: booleanFilter,
    },
  };
};

export const buildMatchClause = (entry: EntryMatch): BooleanFilter => {
  const { field, operator, value } = entry;
  const matchClause = {
    bool: {
      minimum_should_match: 1,
      should: [
        {
          match_phrase: {
            [field]: value,
          },
        },
      ],
    },
  };

  if (operator === 'excluded') {
    return buildExclusionClause(matchClause);
  } else {
    return matchClause;
  }
};

export const getBaseMatchAnyClause = (entry: EntryMatchAny): BooleanFilter => {
  const { field, value } = entry;

  if (value.length === 1) {
    return {
      bool: {
        minimum_should_match: 1,
        should: [
          {
            match_phrase: {
              [field]: value[0],
            },
          },
        ],
      },
    };
  }

  return {
    bool: {
      minimum_should_match: 1,
      should: value.map((val) => {
        return {
          bool: {
            minimum_should_match: 1,
            should: [
              {
                match_phrase: {
                  [field]: val,
                },
              },
            ],
          },
        };
      }),
    },
  };
};

export const buildMatchAnyClause = (entry: EntryMatchAny): BooleanFilter => {
  const { operator } = entry;
  const matchAnyClause = getBaseMatchAnyClause(entry);

  if (operator === 'excluded') {
    return buildExclusionClause(matchAnyClause);
  } else {
    return matchAnyClause;
  }
};

export const buildMatchWildcardClause = (entry: EntryMatchWildcard): BooleanFilter => {
  const { field, operator, value } = entry;
  const wildcardClause = {
    bool: {
      filter: {
        wildcard: {
          [field]: value,
        },
      },
    },
  };

  if (operator === 'excluded') {
    return buildExclusionClause(wildcardClause);
  } else {
    return wildcardClause;
  }
};

export const buildExistsClause = (entry: EntryExists): BooleanFilter => {
  const { field, operator } = entry;
  const existsClause = {
    bool: {
      minimum_should_match: 1,
      should: [
        {
          exists: {
            field,
          },
        },
      ],
    },
  };

  if (operator === 'excluded') {
    return buildExclusionClause(existsClause);
  } else {
    return existsClause;
  }
};

const isBooleanFilter = (clause?: object): clause is BooleanFilter => {
  if (!clause) {
    return false;
  }
  const keys = Object.keys(clause);
  return keys.includes('bool') != null;
};

export const buildIpRangeClauses = (
  ranges: string[],
  field: string
): estypes.QueryDslQueryContainer[] =>
  ranges.map((range) => {
    const [gte, lte] = range.split('-');
    return {
      range: {
        [field]: {
          gte,
          lte,
        },
      },
    };
  });

const buildSmallListBoolFilter = (
  clauses: estypes.QueryDslQueryContainer[],
  operator: string
): BooleanFilter => ({
  bool: {
    [operator === 'excluded' ? 'must_not' : 'should']: clauses,
    minimum_should_match: 1,
  },
});

const parseNumericRangeClause = (value: string, field: string): estypes.QueryDslQueryContainer => {
  // Numeric range list values use dash-separated notation: "{gte}-{lte}".
  // The regex handles negative numbers (e.g. "-50--20").
  const match = value.match(/^(-?[\d.eE+]+)-(-?[\d.eE+]+)$/);
  const [gte, lte] = match ? [match[1], match[2]] : value.split('-');
  return { range: { [field]: { gte, lte } } };
};

const parseDateRangeClause = (value: string, field: string): estypes.QueryDslQueryContainer => {
  // Date range list values use comma-separated ISO notation: "{gte},{lte}".
  const commaIdx = value.indexOf(',');
  const gte = value.slice(0, commaIdx);
  const lte = value.slice(commaIdx + 1);
  return { range: { [field]: { gte, lte } } };
};

export const buildListClause = async (
  entry: EntryList,
  listClient: ListClient
): Promise<BooleanFilter | undefined> => {
  const {
    field,
    operator,
    list: { type },
  } = entry;

  const list = await listClient.findAllListItems({
    filter: '',
    listId: entry.list.id,
  });
  if (list == null) {
    throw new TypeError(`Cannot find list: "${entry.list.id}"`);
  }
  const listValues = list.data.map((listItem) => listItem.value);

  if (type === 'ip_range') {
    const [dashNotationRange, slashNotationRange] = partition(listValues, (value) => {
      return value.includes('-');
    });
    if (dashNotationRange.length > MAXIMUM_SMALL_IP_RANGE_VALUE_LIST_DASH_SIZE) {
      return undefined;
    }
    if (slashNotationRange.length > MAXIMUM_SMALL_IP_RANGE_VALUE_LIST_DASH_SIZE) {
      return undefined;
    }
    const rangeClauses = buildIpRangeClauses(dashNotationRange, field);
    if (slashNotationRange.length > 0) {
      // `terms` queries against an `ip` field do not support CIDR notation,
      // but `term` queries do. Emit one `term` clause per CIDR value.
      slashNotationRange.forEach((cidr) => {
        rangeClauses.push({
          term: {
            [field]: cidr,
          },
        });
      });
    }
    return {
      bool: {
        [operator === 'excluded' ? 'must_not' : 'should']: rangeClauses,
        minimum_should_match: 1,
      },
    };
  }

  if (['integer_range', 'float_range', 'long_range', 'double_range'].includes(type)) {
    if (listValues.length > MAXIMUM_SMALL_IP_RANGE_VALUE_LIST_DASH_SIZE) {
      return undefined;
    }
    return buildSmallListBoolFilter(
      listValues.map((v) => parseNumericRangeClause(v, field)),
      operator
    );
  }

  if (type === 'date_range') {
    if (listValues.length > MAXIMUM_SMALL_IP_RANGE_VALUE_LIST_DASH_SIZE) {
      return undefined;
    }
    return buildSmallListBoolFilter(
      listValues.map((v) => parseDateRangeClause(v, field)),
      operator
    );
  }

  if (type === 'geo_point') {
    if (listValues.length > MAXIMUM_SMALL_IP_RANGE_VALUE_LIST_DASH_SIZE) {
      return undefined;
    }
    // geo_point list values are stored as "lat,lon" strings. ES does not support
    // terms queries on geo_point fields; emit a geo_distance clause per point.
    return buildSmallListBoolFilter(
      listValues.map((value) => ({ geo_distance: { distance: '1m', [field]: value } })),
      operator
    );
  }

  if (type === 'geo_shape') {
    if (listValues.length > MAXIMUM_SMALL_IP_RANGE_VALUE_LIST_DASH_SIZE) {
      return undefined;
    }
    // geo_shape list values are stored as WKT strings.
    return buildSmallListBoolFilter(
      listValues.map((value) => ({
        geo_shape: { [field]: { relation: 'intersects' as const, shape: value } },
      })),
      operator
    );
  }

  if (type === 'shape') {
    if (listValues.length > MAXIMUM_SMALL_IP_RANGE_VALUE_LIST_DASH_SIZE) {
      return undefined;
    }
    // Cartesian shape list values are stored as WKT strings.
    return buildSmallListBoolFilter(
      listValues.map((value) => ({
        shape: { [field]: { relation: 'intersects' as const, shape: value } },
      })),
      operator
    );
  }

  return {
    bool: {
      [operator === 'excluded' ? 'must_not' : 'filter']: {
        terms: {
          [field]: listValues,
        },
      },
    },
  };
};

export const getBaseNestedClause = async (
  entries: ExceptionEntry[],
  parentField: string,
  listClient: ListClient
): Promise<BooleanFilter | undefined> => {
  if (entries.length === 1) {
    const [singleNestedEntry] = entries;
    const innerClause = await createInnerAndClauses({
      entry: singleNestedEntry,
      listClient,
      parent: parentField,
    });
    return isBooleanFilter(innerClause) ? innerClause : { bool: {} };
  }

  const filter: Array<BooleanFilter | NestedFilter> = [];
  let isUnprocessable = false;
  await Promise.all(
    entries.map(async (nestedEntry) => {
      const clauses = await createInnerAndClauses({
        entry: nestedEntry,
        listClient,
        parent: parentField,
      });
      if (!clauses) {
        isUnprocessable = true;
        return;
      }
      filter.push(clauses);
    })
  );

  if (isUnprocessable) {
    return undefined;
  }
  return {
    bool: {
      filter,
    },
  };
};

export const buildNestedClause = async (
  entry: EntryNested,
  listClient: ListClient
): Promise<NestedFilter | undefined> => {
  const { field, entries } = entry;

  const baseNestedClause = await getBaseNestedClause(entries, field, listClient);

  if (!baseNestedClause) {
    return undefined;
  }

  return {
    nested: {
      path: field,
      query: baseNestedClause,
      score_mode: 'none',
    },
  };
};

export const createInnerAndClauses = async ({
  entry,
  parent,
  listClient,
}: {
  entry: ExceptionEntry;
  parent?: string;
  listClient: ListClient;
}): Promise<BooleanFilter | NestedFilter | undefined> => {
  const field = parent != null ? `${parent}.${entry.field}` : entry.field;
  if (entriesExists.is(entry)) {
    return buildExistsClause({ ...entry, field });
  } else if (entriesMatch.is(entry)) {
    return buildMatchClause({ ...entry, field });
  } else if (entriesMatchAny.is(entry)) {
    return buildMatchAnyClause({ ...entry, field });
  } else if (entriesMatchWildcard.is(entry)) {
    return buildMatchWildcardClause({ ...entry, field });
  } else if (entriesList.is(entry)) {
    return buildListClause({ ...entry, field }, listClient);
  } else if (entriesNested.is(entry)) {
    return buildNestedClause(entry, listClient);
  } else {
    throw new TypeError(`Unexpected exception entry: ${entry}`);
  }
};
