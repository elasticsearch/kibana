/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import { useMemo } from 'react';
import { find, isEmpty } from 'lodash/fp';
import { ALERT_RULE_TYPE } from '@kbn/rule-data-utils';
import { getEventCategoriesFromData } from '../utils/get_event_categories';
import { useAlertResponseActionsSupport } from '../../../../common/hooks/endpoint/use_alert_response_actions_support';
import { isResponseActionsAlertAgentIdField } from '../../../../common/lib/endpoint';
import { getHighlightedFieldsToDisplay } from '../../../../common/components/event_details/get_alert_summary_rows';
import { EVENT_SOURCE_FIELD_NAME } from '../../../../timelines/components/timeline/body/renderers/constants';
import { getTimelineEventsDetailsFromRecord } from '../utils/get_timeline_events_details_from_record';

export interface UseHighlightedFieldsParams {
  /**
   * Document record to extract highlighted fields from
   */
  hit: DataTableRecord;
  /**
   * An array of fields user has selected to highlight, defined on rule
   */
  investigationFields: string[];
  /**
   * Optional prop to specify the type of highlighted fields to display
   * Custom: fields defined on the rule
   * Default: fields defined by elastic
   * All: both custom and default fields
   */
  type?: 'default' | 'custom' | 'all';
}

export interface UseHighlightedFieldsResult {
  [fieldName: string]: {
    /**
     * If the field has a custom override
     */
    overrideField?: { field: string; values: string[] };
    /**
     * Values for the field
     */
    values: string[];
  };
}

/**
 * Returns the highlighted fields to display in the right panel under the Investigation section.
 */
export const useHighlightedFields = ({
  hit,
  investigationFields,
  type,
}: UseHighlightedFieldsParams): UseHighlightedFieldsResult => {
  // Build TimelineEventsDetailsItem[] from DataTableRecord for internal use.
  // We do this to avoid increasing scope as useAlertResponseActionsSupport is used in many places
  const dataFormattedForFieldBrowser = useMemo(
    () => getTimelineEventsDetailsFromRecord(hit),
    [hit]
  );

  // TODO eventually convert useAlertResponseActionsSupport to support hit
  const responseActionsSupport = useAlertResponseActionsSupport(dataFormattedForFieldBrowser);
  const eventCategories = getEventCategoriesFromData(hit);

  const eventCodeField = find(
    { category: 'event', field: 'event.code' },
    dataFormattedForFieldBrowser
  );

  const eventCode = Array.isArray(eventCodeField?.originalValue)
    ? eventCodeField?.originalValue?.[0]
    : eventCodeField?.originalValue;

  const eventRuleTypeField = find(
    { category: 'kibana', field: ALERT_RULE_TYPE },
    dataFormattedForFieldBrowser
  );

  const eventRuleType = Array.isArray(eventRuleTypeField?.originalValue)
    ? eventRuleTypeField?.originalValue?.[0]
    : eventRuleTypeField?.originalValue;

  const tableFields = getHighlightedFieldsToDisplay({
    eventCategories,
    eventCode,
    eventRuleType,
    ruleCustomHighlightedFields: investigationFields,
    type,
  });

  return tableFields.reduce<UseHighlightedFieldsResult>((acc, field) => {
    const item = dataFormattedForFieldBrowser.find(
      (data) => data.field === field.id || (field.legacyId && data.field === field.legacyId)
    );
    if (!item) {
      return acc;
    }

    // if there aren't any values we can skip this highlighted field
    let fieldValues = item.values;
    if (!fieldValues || isEmpty(fieldValues)) {
      return acc;
    }

    // if we found the data by its legacy id we swap the ids to display the correct one
    if (item.field === field.legacyId) {
      field.id = field.legacyId;
    }

    // If the field is one used by a supported Response Actions agentType,
    // but the alert field is not the one that the agentType on the alert host uses,
    // then exit and return accumulator
    if (
      isResponseActionsAlertAgentIdField(field.id) &&
      responseActionsSupport.details.agentIdField !== field.id
    ) {
      return acc;
    }

    /**
     * Source event use-case.
     * In this case we only want to show ancestors of level "0".
     * We can obtain those by using the `kibana.alert.ancestors.depth` field
     */
    if (item.field === EVENT_SOURCE_FIELD_NAME) {
      /**
       * Threshold rules create a fake document to represent the aggregation
       * bucket and use that ID as an ancestor. This leads to a bug when users
       * try to click on the ID from the highlighted fields and get back a 500
       * from the server, because that ID doesn't really exists in the database.
       *
       * For this reason, if the rule type is "threshold", we just don't show the
       * ancestor in the highlights table.
       *
       * @see https://github.com/elastic/kibana/issues/238019
       */
      const ruleType = dataFormattedForFieldBrowser.find(
        (_item) => _item.field === 'kibana.alert.rule.type'
      )?.values?.[0];

      if (ruleType === 'threshold') {
        return acc;
      }

      const depts = dataFormattedForFieldBrowser.find(
        (_item) => _item.field === `kibana.alert.ancestors.depth`
      );
      fieldValues = fieldValues.filter((_, idx) => (depts?.values?.[idx] ?? '0') === '0');
    }
    return {
      ...acc,
      [field.id]: {
        ...(field.overrideField && {
          overrideField: {
            field: field.overrideField,
            values:
              find({ field: field.overrideField }, dataFormattedForFieldBrowser)?.values ?? [],
          },
        }),
        values: fieldValues,
      },
    };
  }, {});
};
