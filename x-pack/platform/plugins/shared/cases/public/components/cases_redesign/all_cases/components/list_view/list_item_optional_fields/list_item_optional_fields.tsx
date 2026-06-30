/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import { EuiFlexGroup, useEuiTheme } from '@elastic/eui';

import { getListItemFieldContent } from './field_content_getters';
import { ListItemFieldText } from './list_item_field_text';
import type { ListItemFieldContent, ListItemOptionalFieldsProps } from './types';

export const ListItemOptionalFields: React.FC<ListItemOptionalFieldsProps> = ({
  theCase,
  selectedFields,
}) => {
  const { euiTheme } = useEuiTheme();

  const styles = useMemo(
    () => ({
      container: css`
        position: relative;
        margin-top: ${euiTheme.size.s};
      `,
    }),
    [euiTheme]
  );

  const visibleFields = useMemo(
    () =>
      selectedFields.reduce<Array<ListItemFieldContent & { field: string }>>(
        (acc, { isChecked, field, name }) => {
          if (isChecked) {
            const fieldContent = getListItemFieldContent(field, theCase);
            if (fieldContent != null) {
              acc.push({ ...fieldContent, field, label: name ?? fieldContent.label });
            }
          }
          return acc;
        },
        []
      ),
    [selectedFields, theCase]
  );

  if (visibleFields.length === 0) {
    return null;
  }

  return (
    <EuiFlexGroup
      alignItems="center"
      gutterSize="s"
      wrap
      data-test-subj="cases-list-item-optional-fields"
      css={styles.container}
    >
      {visibleFields.map(({ field, label, content, testSubj }) => (
        <ListItemFieldText key={field} label={label} testSubj={testSubj}>
          {content}
        </ListItemFieldText>
      ))}
    </EuiFlexGroup>
  );
};

ListItemOptionalFields.displayName = 'ListItemOptionalFields';
