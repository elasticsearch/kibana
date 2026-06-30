/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import type { RecommendedQuery, RecommendedField } from '@kbn/esql-types';
import type { GetColumnsByTypeFn, ISuggestionItem } from '../../types';
import { METADATA_FIELDS } from '../metadata';
import { prettifyQueryTemplate, prettifyQuery } from './utils';
import { SuggestionCategory } from '../../../../language/autocomplete/utils/sorting/types';

export interface EditorExtensions {
  recommendedQueries: RecommendedQuery[];
  recommendedFields: RecommendedField[];
}

interface QueryTemplate {
  label: string;
  description: string;
  queryString: string;
  category?: SuggestionCategory;
}

// Order starts with the simple ones and goes to more complex ones

export const getRecommendedQueriesTemplates = ({
  fromCommand,
  timeField,
  categorizationField,
}: {
  fromCommand: string;
  timeField?: string;
  categorizationField?: string;
}): QueryTemplate[] => {
  // Recommend TBUCKET for @timestamp fields as it is smarter and has easier to understand syntax
  const bucketExpression =
    timeField === '@timestamp' ? 'TBUCKET(50)' : `BUCKET(${timeField}, 50, ?_tstart, ?_tend)`;

  const commentDescription =
    timeField !== '@timestamp'
      ? ' /* ?_tstart and ?_tend take the values of the time picker */'
      : '';

  const queries: QueryTemplate[] = [
    {
      label: i18n.translate('kbn-esql-language.recommendedQueries.searchExample.label', {
        defaultMessage: 'Search all fields',
      }),
      description: i18n.translate(
        'kbn-esql-language.recommendedQueries.searchExample.description',
        {
          defaultMessage: 'Use WHERE to filter/search data',
        }
      ),
      queryString: `${fromCommand}\n  | WHERE KQL("term") /* Search all fields using KQL – e.g. WHERE KQL("debug") */`,
      category: SuggestionCategory.RECOMMENDED_QUERY_WITH_PRIORITY,
    },
    {
      label: i18n.translate('kbn-esql-language.recommendedQueries.aggregateExample.label', {
        defaultMessage: 'Aggregate with STATS',
      }),
      description: i18n.translate(
        'kbn-esql-language.recommendedQueries.aggregateExample.description',
        {
          defaultMessage: 'Count aggregation',
        }
      ),
      queryString: `${fromCommand}  | STATS count = COUNT(*) /* you can group by a field using the BY operator */`,
    },
    ...(timeField
      ? [
          {
            label: i18n.translate('kbn-esql-language.recommendedQueries.sortByTime.label', {
              defaultMessage: 'Sort by time',
            }),
            description: i18n.translate(
              'kbn-esql-language.recommendedQueries.sortByTime.description',
              {
                defaultMessage: 'Sort by time',
              }
            ),
            queryString: `${fromCommand}| SORT ${timeField} /* Data is not sorted by default */`,
          },
          {
            label: i18n.translate('kbn-esql-language.recommendedQueries.dateIntervals.label', {
              defaultMessage: 'Create 5 minute time buckets with EVAL',
            }),
            description: i18n.translate(
              'kbn-esql-language.recommendedQueries.dateIntervals.description',
              {
                defaultMessage: 'Count aggregation over time',
              }
            ),
            queryString: `${fromCommand}| EVAL buckets = DATE_TRUNC(5 m, ${timeField}) | STATS count = COUNT(*) BY buckets /* try out different intervals */`,
          },
        ]
      : []),
    {
      label: i18n.translate('kbn-esql-language.recommendedQueries.caseExample.label', {
        defaultMessage: 'Create a conditional with CASE',
      }),
      description: i18n.translate('kbn-esql-language.recommendedQueries.caseExample.description', {
        defaultMessage: 'Conditional',
      }),
      queryString: `${fromCommand}| STATS count = COUNT(*)| EVAL newField = CASE(count < 100, "groupA", count > 100 and count < 500, "groupB", "Other")| KEEP newField`,
    },
    ...(timeField
      ? [
          {
            label: i18n.translate('kbn-esql-language.recommendedQueries.dateHistogram.label', {
              defaultMessage: 'Create a date histogram',
            }),
            description: i18n.translate(
              'kbn-esql-language.recommendedQueries.dateHistogram.description',
              {
                defaultMessage: 'Count aggregation over time',
              }
            ),
            queryString: `${fromCommand}| WHERE ${timeField} <=?_tend and ${timeField} >?_tstart| STATS count = COUNT(*) BY \`Over time\` = ${bucketExpression}${commentDescription}`,
          },
          {
            label: i18n.translate('kbn-esql-language.recommendedQueries.eventRate.label', {
              defaultMessage: 'Calculate the event rate',
            }),
            description: i18n.translate(
              'kbn-esql-language.recommendedQueries.eventRate.description',
              {
                defaultMessage: 'Event rate over time',
              }
            ),
            queryString: `${fromCommand}| STATS count = COUNT(*), min_timestamp = MIN(${timeField}) /* MIN(dateField) finds the earliest timestamp in the dataset. */ | EVAL event_rate = count / DATE_DIFF("seconds", min_timestamp, NOW()) /* Calculates the event rate by dividing the total count of events by the time difference (in seconds) between the earliest event and the current time. */ | KEEP event_rate`,
          },
          {
            label: i18n.translate('kbn-esql-language.recommendedQueries.categorize.label', {
              // TODO this item should be hidden if AIOps is disabled or we're not running with a platinum license
              // the capability aiops.enabled can be used to check both of these conditions
              defaultMessage: 'Detect change points',
            }),
            description: i18n.translate(
              'kbn-esql-language.recommendedQueries.categorize.description',
              {
                defaultMessage: 'Change point on count aggregation',
              }
            ),
            queryString: `${fromCommand} | WHERE ${timeField} <=?_tend and ${timeField} >?_tstart | STATS count = COUNT(*) BY buckets = ${bucketExpression} /* To use CHANGE_POINT BY, set grouping field(s) - e.g. BY host, buckets = ... */ | CHANGE_POINT count ON buckets /* Use the BY operator to group by the field - e.g. ON buckets BY host */ | WHERE type IS NOT NULL /* Filter to only include change points. */`,
          },
          {
            label: i18n.translate('kbn-esql-language.recommendedQueries.lastHour.label', {
              defaultMessage: 'Total count vs count last hour',
            }),
            description: i18n.translate(
              'kbn-esql-language.recommendedQueries.lastHour.description',
              {
                defaultMessage: 'A more complicated example',
              }
            ),
            queryString: `${fromCommand} | SORT ${timeField} | EVAL now = NOW() | EVAL key = CASE(${timeField} < (now - 1 hour) AND ${timeField} > (now - 2 hour), "Last hour", "Other") | STATS count = COUNT(*) BY key | EVAL count_last_hour = CASE(key == "Last hour", count), count_rest = CASE(key == "Other", count) | EVAL total_visits = TO_DOUBLE(COALESCE(count_last_hour, 0::LONG) + COALESCE(count_rest, 0::LONG)) | STATS count_last_hour = SUM(count_last_hour), total_visits  = SUM(total_visits)`,
          },
        ]
      : []),
    ...(categorizationField
      ? // TODO this item should be hidden if AIOps is disabled or we're not running with a platinum license
        // the capability aiops.enabled can be used to check both of these conditions
        [
          {
            label: i18n.translate('kbn-esql-language.recommendedQueries.patternAnalysis.label', {
              defaultMessage: 'Identify patterns',
            }),
            description: i18n.translate(
              'kbn-esql-language.recommendedQueries.patternAnalysis.description',
              {
                defaultMessage: 'Use the CATEGORIZE function to identify patterns in your logs',
              }
            ),
            queryString: timeField
              ? `${fromCommand} | WHERE ${timeField} <=?_tend and ${timeField} >?_tstart | SAMPLE .001 | STATS Count=COUNT(*)/.001, Sparkline=SPARKLINE(COUNT(*), ${timeField}, 40, ?_tstart, ?_tend) BY Pattern=CATEGORIZE(${categorizationField})| SORT Count DESC`
              : `${fromCommand} | SAMPLE .001 | STATS Count=COUNT(*)/.001, Sparkline=SPARKLINE(COUNT(*), ${timeField}, 40, ?_tstart, ?_tend) BY Pattern=CATEGORIZE(${categorizationField})| SORT Count DESC`,
          },
        ]
      : []),
    ...(fromCommand
      ? [
          {
            label: i18n.translate('kbn-esql-language.recommendedQueries.loadUnmappedFields.label', {
              defaultMessage: 'Load unmapped fields',
            }),
            description: i18n.translate(
              'kbn-esql-language.recommendedQueries.loadUnmappedFields.description',
              {
                defaultMessage:
                  'Allows querying unmapped fields, loading their values from the _source if present.',
              }
            ),
            queryString: `SET unmapped_fields = "LOAD"; ${fromCommand} `,
          },
        ]
      : []),
  ];

  // prettify the query string
  queries.forEach((query) => {
    // the formatted query needs to start with FROM for prettify to work correctly
    const formattedQuery = fromCommand
      ? prettifyQuery(query.queryString)
      : prettifyQueryTemplate(`FROM index ${query.queryString}`);

    query.queryString = formattedQuery;
  });
  return queries;
};

export async function getTimeAndCategorizationFields(
  getColumnsByType: GetColumnsByTypeFn
): Promise<{ timeField: string; categorizationField: string | undefined }> {
  const [dateFields, textFields] = await Promise.all([
    getColumnsByType(['date'], [], { openSuggestions: true }),
    // get text fields separately to avoid mixing them with date fields
    getColumnsByType(['text'], [], { openSuggestions: true }),
  ]);

  const timeField =
    dateFields.length > 0
      ? dateFields.find((field) => field.text === '@timestamp')?.text || dateFields[0].text
      : '';

  const categorizationField =
    textFields.length > 0
      ? getCategorizationField(textFields.map((field) => field.text))
      : undefined;

  return { timeField, categorizationField };
}

const buildRecommendedQueryCommand = (
  queryLabel: string,
  queryText?: string
): ISuggestionItem['command'] => ({
  id: 'esql.recommendedQuery.accept',
  title: 'Accept recommended query',
  arguments: [queryText ? { queryLabel, queryText } : { queryLabel }],
});

export const getRecommendedQueriesSuggestionsFromStaticTemplates = async (
  getFieldsByType: GetColumnsByTypeFn,
  fromCommand: string = ''
): Promise<ISuggestionItem[]> => {
  const { timeField, categorizationField } = await getTimeAndCategorizationFields(getFieldsByType);

  const recommendedQueries = getRecommendedQueriesTemplates({
    fromCommand,
    timeField,
    categorizationField,
  });

  const suggestions: ISuggestionItem[] = recommendedQueries.map((query) => {
    return {
      label: query.label,
      text: query.queryString,
      kind: 'Issue',
      detail: query.description,
      category: query.category ?? SuggestionCategory.RECOMMENDED_QUERY,
      command: buildRecommendedQueryCommand(query.label),
    };
  });

  return suggestions;
};

const buildExtensionSuggestion = (
  recommendedQuery: RecommendedQuery,
  text: string,
  command?: ISuggestionItem['command']
): ISuggestionItem => ({
  label: recommendedQuery.name,
  text,
  detail: recommendedQuery.name ?? '',
  ...(recommendedQuery.description
    ? { documentation: { value: recommendedQuery.description } }
    : {}),
  kind: 'Issue',
  category: SuggestionCategory.RECOMMENDED_QUERY_WITH_PRIORITY,
  ...(command ? { command } : {}),
});

/**
 * This function extracts the templates from the recommended queries extensions.
 * The templates are the recommended queries without the source command (FROM).
 * This is useful for showing the templates in the autocomplete suggestions when the users have already typed the FROM command.
 * @param recommendedQueriesExtensions, the recommended queries extensions to extract the templates from
 * @returns ISuggestionItem[], the templates extracted from the recommended queries extensions
 */
export const getRecommendedQueriesTemplatesFromExtensions = (
  recommendedQueriesExtensions: RecommendedQuery[]
): ISuggestionItem[] => {
  if (!recommendedQueriesExtensions || !recommendedQueriesExtensions.length) {
    return [];
  }

  return recommendedQueriesExtensions.map((recommendedQuery) => {
    if (recommendedQuery.isStandalone) {
      const queryText = prettifyQuery(recommendedQuery.query);
      return buildExtensionSuggestion(
        recommendedQuery,
        '',
        buildRecommendedQueryCommand(recommendedQuery.name, queryText)
      );
    }

    return buildExtensionSuggestion(
      recommendedQuery,
      prettifyQueryTemplate(recommendedQuery.query)
    );
  });
};

// Function returning suggestions from static templates and editor extensions
export const getRecommendedQueriesSuggestions = async (
  editorExtensions: EditorExtensions,
  // Optional function to get fields by type, if not provided only the extensions will be used
  getColumnsByType?: GetColumnsByTypeFn,
  prefix: string = ''
) => {
  const recommendedQueriesFromExtensions = getRecommendedQueriesTemplatesFromExtensions(
    editorExtensions.recommendedQueries
  );

  // If getColumnsByType is not provided, we cannot get the static templates
  // so we return only the extensions. For example in timeseries command the majority of
  // the static templates are not relevant as the count() aggregation is not supported there.
  if (!getColumnsByType) {
    return recommendedQueriesFromExtensions;
  }
  const recommendedQueriesFromTemplates = await getRecommendedQueriesSuggestionsFromStaticTemplates(
    getColumnsByType,
    prefix
  );

  return [...recommendedQueriesFromExtensions, ...recommendedQueriesFromTemplates];
};

/**
 * This function returns the categorization field from the list of fields.
 * It checks for the presence of 'message', 'error.message', or 'event.original' in that order.
 * If none of these fields are present, it returns the first field from the list,
 * Assumes text fields have been passed in the `fields` array.
 *
 * This function is a duplicate of the one in src/platform/packages/shared/kbn-aiops-utils.
 * It is included here to avoid build errors due to bazel
 *
 * TODO: Remove this function once the bazel issue is resolved.
 *
 * @param fields, the list of fields to check
 * @returns string | undefined, the categorization field if found, otherwise undefined
 */

export function getCategorizationField(fields: string[]): string | undefined {
  const fieldPriority = ['message', 'error.message', 'event.original'];
  const fieldSet = new Set(fields);
  for (const field of fieldPriority) {
    if (fieldSet.has(field)) {
      return field;
    }
  }

  // Filter out metadata fields
  const filteredFields = fields.filter((field) => !METADATA_FIELDS.includes(field));
  return filteredFields[0] ?? undefined;
}
