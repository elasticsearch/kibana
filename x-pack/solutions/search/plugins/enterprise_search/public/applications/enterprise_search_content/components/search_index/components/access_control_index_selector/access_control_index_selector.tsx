/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormPrepend,
  EuiIcon,
  EuiSuperSelect,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

export interface AccessControlSelectorOption {
  description: string;
  error?: boolean;
  title: string;
  value: 'content-index' | 'access-control-index';
}

interface IndexSelectorProps {
  fullWidth?: boolean;
  indexSelectorOptions?: AccessControlSelectorOption[];
  onChange(value: AccessControlSelectorOption['value']): void;
  valueOfSelected?: AccessControlSelectorOption['value'];
}

export const DEFAULT_INDEX_SELECTOR_OPTIONS: AccessControlSelectorOption[] = [
  {
    description: i18n.translate(
      'xpack.enterpriseSearch.content.searchIndex.documents.selector.contentIndex.description',
      {
        defaultMessage: 'Browse documents ingested by content syncs',
      }
    ),
    title: i18n.translate(
      'xpack.enterpriseSearch.content.searchIndex.documents.selector.contentIndex.title',
      {
        defaultMessage: 'Content index',
      }
    ),
    value: 'content-index',
  },
  {
    description: i18n.translate(
      'xpack.enterpriseSearch.content.searchIndex.documents.selector.accessControl.description',
      {
        defaultMessage: 'Browse access control lists ingested by access control syncs',
      }
    ),
    title: i18n.translate(
      'xpack.enterpriseSearch.content.searchIndex.documents.selector.accessControl.title',
      {
        defaultMessage: 'Access control index',
      }
    ),
    value: 'access-control-index',
  },
];

export const AccessControlIndexSelector: React.FC<IndexSelectorProps> = ({
  indexSelectorOptions = DEFAULT_INDEX_SELECTOR_OPTIONS,
  onChange,
  valueOfSelected,
  fullWidth,
}) => {
  return (
    <EuiSuperSelect
      aria-label={i18n.translate(
        'xpack.enterpriseSearch.content.searchIndex.documents.selector.indexType.ariaLabel',
        { defaultMessage: 'Index' }
      )}
      fullWidth={fullWidth}
      valueOfSelected={valueOfSelected}
      onChange={onChange}
      prepend={
        indexSelectorOptions.some((option) => option.error) ? (
          <EuiFormPrepend iconLeft={'warning'} />
        ) : undefined
      }
      options={indexSelectorOptions.map((option) => {
        return {
          dropdownDisplay: (
            <EuiFlexGroup direction="row" alignItems="center" gutterSize="m">
              {option.error ? (
                <EuiFlexItem grow={false} align>
                  <EuiIcon
                    type={'warning'}
                    aria-label={i18n.translate(
                      'xpack.enterpriseSearch.content.index.accessControl.selector.optionWarning',
                      { defaultMessage: 'Warning' }
                    )}
                  />{' '}
                </EuiFlexItem>
              ) : null}
              <EuiFlexGroup direction="column" gutterSize="none">
                <EuiFlexItem>
                  <EuiTitle size="xs">
                    <h4>{option.title}</h4>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="xs">
                    <p>{option.description}</p>
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexGroup>
          ),
          inputDisplay: option.title,
          value: option.value,
        };
      })}
    />
  );
};
