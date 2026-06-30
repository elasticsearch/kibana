/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiAccordion,
  EuiBasicTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { docLinks } from '../../../common/doc_links';
import type { PlaygroundForm, PlaygroundFormFields, QuerySourceFields } from '../../types';

const isQueryFieldSelected = (
  queryFields: PlaygroundForm[PlaygroundFormFields.queryFields],
  index: string,
  field: string
): boolean => {
  return Boolean(queryFields[index]?.includes(field));
};

export interface QueryFieldsPanelProps {
  customizedQuery: boolean;
  index: string;
  indexFields: QuerySourceFields;
  updateFields: (index: string, fieldName: string, checked: boolean) => void;
  queryFields: PlaygroundForm[PlaygroundFormFields.queryFields];
}

export const QueryFieldsPanel = ({
  customizedQuery,
  index,
  indexFields,
  updateFields,
  queryFields,
}: QueryFieldsPanelProps) => {
  const queryTableFields = useMemo(
    () =>
      [
        ...indexFields.semantic_fields,
        ...indexFields.elser_query_fields,
        ...indexFields.dense_vector_query_fields,
        ...indexFields.bm25_query_fields,
      ].map((field) => ({
        name: typeof field === 'string' ? field : field.field,
        checked: isQueryFieldSelected(
          queryFields,
          index,
          typeof field === 'string' ? field : field.field
        ),
      })),
    [index, indexFields, queryFields]
  );
  return (
    <EuiPanel
      grow={false}
      hasShadow={false}
      hasBorder
      data-test-subj={`${index}-query-fields-panel`}
    >
      <EuiAccordion
        id={index}
        buttonContent={
          <EuiText>
            <h5>{index}</h5>
          </EuiText>
        }
        buttonProps={{
          css: { overflow: 'hidden' },
        }}
        initialIsOpen
        data-test-subj={`${index}-fieldsAccordion`}
      >
        <EuiSpacer size="s" />
        <EuiBasicTable
          tableCaption={i18n.translate('xpack.searchPlayground.viewQuery.flyout.table.caption', {
            defaultMessage: 'Query Model table',
          })}
          items={queryTableFields}
          rowHeader="name"
          columns={[
            {
              field: 'name',
              name: i18n.translate(
                'xpack.searchPlayground.viewQuery.flyout.table.column.field.name',
                { defaultMessage: 'Field' }
              ),
              'data-test-subj': 'fieldName',
            },
            {
              field: 'checked',
              name: i18n.translate(
                'xpack.searchPlayground.viewQuery.flyout.table.column.enabled.name',
                { defaultMessage: 'Enabled' }
              ),
              align: 'right',
              render: (checked, field) => {
                if (customizedQuery) {
                  return (
                    <EuiToolTip
                      content={i18n.translate(
                        'xpack.searchPlayground.viewQuery.sidePanel.fieldSelection.customized.warning.tooltip',
                        {
                          defaultMessage:
                            'Field selection is not supported with a user-customized query',
                        }
                      )}
                    >
                      <EuiSwitch
                        showLabel={false}
                        label={field.name}
                        disabled
                        checked={false}
                        onChange={() => {}}
                        compressed
                        data-test-subj={`field-${field.name}-${checked}`}
                      />
                    </EuiToolTip>
                  );
                }
                return (
                  <EuiSwitch
                    showLabel={false}
                    label={field.name}
                    checked={checked}
                    onChange={(e) => updateFields(index, field.name, e.target.checked)}
                    compressed
                    data-test-subj={`field-${field.name}-${checked}`}
                  />
                );
              },
            },
          ]}
        />

        {indexFields.skipped_fields > 0 && (
          <>
            <EuiSpacer size="m" />
            <EuiFlexGroup>
              <EuiFlexItem>
                <EuiText size="s" color="subdued" data-test-subj={`${index}-skippedFields`}>
                  <EuiIcon type="eyeSlash" aria-hidden={true} />
                  {` `}
                  <FormattedMessage
                    id="xpack.searchPlayground.viewQuery.flyout.hiddenFields"
                    defaultMessage="{skippedFields} fields are hidden."
                    values={{ skippedFields: indexFields.skipped_fields }}
                  />
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiLink
                  href={docLinks.hiddenFields}
                  target="_blank"
                  data-test-subj="hidden-fields-documentation-link"
                >
                  <FormattedMessage
                    id="xpack.searchPlayground.viewQuery.flyout.learnMoreLink"
                    defaultMessage="Learn more."
                  />
                </EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        )}
      </EuiAccordion>
    </EuiPanel>
  );
};
