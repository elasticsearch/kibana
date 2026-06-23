/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiLink } from '@elastic/eui';
import { CaseStatuses } from '@kbn/cases-components';

import type { CaseUI, CaseUICustomField } from '../../../../../../../common/ui/types';
import { FormattedRelativePreferenceDate } from '../../../../../formatted_date';
import { getExtendedFieldDisplayLabels } from '../../../../../all_cases/utils/extended_fields_column_utils';
import { ExtendedFieldsListItemContent } from './extended_fields_content';
import type { ListItemFieldContent } from './types';
import * as i18n from '../../../translations';

const DESCRIPTION_MAX_LENGTH = 100;

const getCustomFieldDisplayValue = (customField: CaseUICustomField): string => {
  const { value } = customField;
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
};

const getTagsFieldContent = (theCase: CaseUI): ListItemFieldContent | null => {
  if (theCase.tags == null || theCase.tags.length === 0) {
    return null;
  }
  return {
    label: i18n.TAGS,
    content: theCase.tags.join(', '),
    testSubj: 'cases-list-item-field-tags',
  };
};

const getExternalIncidentFieldContent = (theCase: CaseUI): ListItemFieldContent => {
  if (theCase.externalService == null) {
    return {
      label: i18n.EXTERNAL_INCIDENT,
      content: i18n.NOT_PUSHED,
      testSubj: 'cases-list-item-field-external-not-pushed',
    };
  }
  const { externalTitle, externalUrl } = theCase.externalService;
  const incidentContent =
    externalUrl != null && externalUrl !== '' ? (
      <EuiLink
        href={externalUrl}
        target="_blank"
        data-test-subj="cases-list-item-field-external-link"
      >
        {externalTitle ?? externalUrl}
      </EuiLink>
    ) : (
      externalTitle ?? theCase.externalService.externalId ?? i18n.NOT_PUSHED
    );
  return {
    label: i18n.EXTERNAL_INCIDENT,
    content: incidentContent,
    testSubj: 'cases-list-item-field-external',
  };
};

const getCustomFieldContent = (field: string, theCase: CaseUI): ListItemFieldContent | null => {
  const customField = theCase.customFields.find(
    (element: CaseUICustomField) => element.key === field && element.value != null
  );
  if (customField == null) {
    return null;
  }
  const displayValue = getCustomFieldDisplayValue(customField);
  if (displayValue === '') {
    return null;
  }
  return {
    label: field,
    content: displayValue,
    testSubj: `cases-list-item-field-${field}`,
  };
};

const listItemFieldContentGetters: Record<
  string,
  (theCase: CaseUI) => ListItemFieldContent | null
> = {
  tags: getTagsFieldContent,
  category: (theCase) =>
    theCase.category == null
      ? null
      : {
          label: i18n.CATEGORY,
          content: theCase.category,
          testSubj: 'cases-list-item-field-category',
        },
  totalComment: (theCase) => ({
    label: i18n.COMMENTS,
    content: i18n.LIST_FIELD_COMMENTS(theCase.totalComment),
    testSubj: 'cases-list-item-field-comments',
  }),
  totalAlerts: (theCase) => ({
    label: i18n.ALERTS,
    content: i18n.LIST_FIELD_ALERTS(theCase.totalAlerts ?? 0),
    testSubj: 'cases-list-item-field-alerts',
  }),
  totalEvents: (theCase) => ({
    label: i18n.EVENTS,
    content: i18n.LIST_FIELD_EVENTS(theCase.totalEvents ?? 0),
    testSubj: 'cases-list-item-field-events',
  }),
  createdAt: (theCase) => ({
    label: i18n.LIST_FIELD_CREATED,
    content: <FormattedRelativePreferenceDate value={theCase.createdAt} stripMs />,
    testSubj: 'cases-list-item-field-created-at',
  }),
  closedAt: (theCase) => {
    if (theCase.status !== CaseStatuses.closed || theCase.closedAt == null) {
      return null;
    }
    return {
      label: i18n.LIST_FIELD_CLOSED,
      content: <FormattedRelativePreferenceDate value={theCase.closedAt} stripMs={false} />,
      testSubj: 'cases-list-item-field-closed-at',
    };
  },
  connectorName: (theCase) => {
    const connectorName = theCase.externalService?.connectorName;
    if (connectorName == null) {
      return null;
    }
    return {
      label: i18n.CONNECTORS,
      content: connectorName,
      testSubj: 'cases-list-item-field-connector',
    };
  },
  externalIncident: getExternalIncidentFieldContent,
  description: (theCase) => {
    if (theCase.description == null || theCase.description === '') {
      return null;
    }
    const truncatedDescription =
      theCase.description.length > DESCRIPTION_MAX_LENGTH
        ? `${theCase.description.slice(0, DESCRIPTION_MAX_LENGTH)}…`
        : theCase.description;
    return {
      label: i18n.DESCRIPTION,
      content: truncatedDescription,
      testSubj: 'cases-list-item-field-description',
    };
  },
  extendedFields: (theCase) => {
    const labels = getExtendedFieldDisplayLabels(
      theCase.extendedFields,
      theCase.extendedFieldsLabels
    );
    if (labels.length === 0) {
      return null;
    }
    return {
      label: i18n.EXTENDED_FIELDS,
      content: (
        <ExtendedFieldsListItemContent
          extendedFields={theCase.extendedFields}
          extendedFieldsLabels={theCase.extendedFieldsLabels}
        />
      ),
      testSubj: 'cases-list-item-field-extended-fields',
    };
  },
};

export const getListItemFieldContent = (
  field: string,
  theCase: CaseUI
): ListItemFieldContent | null => {
  const getter = listItemFieldContentGetters[field];
  if (getter != null) {
    return getter(theCase);
  }
  return getCustomFieldContent(field, theCase);
};
