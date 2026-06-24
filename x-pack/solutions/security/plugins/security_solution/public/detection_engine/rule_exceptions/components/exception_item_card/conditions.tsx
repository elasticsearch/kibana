/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo, useCallback } from 'react';
import {
  EuiExpression,
  EuiToken,
  EuiFlexGroup,
  EuiFlexItem,
  EuiBadge,
  EuiPanel,
  useEuiTheme,
} from '@elastic/eui';
import { css, cx } from '@emotion/css';
import styled from '@emotion/styled';
import type {
  EntryExists,
  EntryList,
  EntryMatch,
  EntryMatchAny,
  EntryMatchWildcard,
  EntryNested,
  ExceptionListItemSchema,
  NonEmptyNestedEntriesArray,
} from '@kbn/securitysolution-io-ts-list-types';
import { ListOperatorTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import { ShowValueListModal } from '../../../../value_list/components/show_value_list_modal';

import * as i18n from './translations';
import { ValueWithSpaceWarning } from '../value_with_space_warning';

const OS_LABELS = Object.freeze({
  linux: i18n.OS_LINUX,
  mac: i18n.OS_MAC,
  macos: i18n.OS_MAC,
  windows: i18n.OS_WINDOWS,
});

const EntryValueWrap = styled.span`
  white-space: pre-wrap;
`;

const OPERATOR_TYPE_LABELS_INCLUDED = Object.freeze({
  [ListOperatorTypeEnum.NESTED]: i18n.CONDITION_OPERATOR_TYPE_NESTED,
  [ListOperatorTypeEnum.MATCH_ANY]: i18n.CONDITION_OPERATOR_TYPE_MATCH_ANY,
  [ListOperatorTypeEnum.MATCH]: i18n.CONDITION_OPERATOR_TYPE_MATCH,
  [ListOperatorTypeEnum.WILDCARD]: i18n.CONDITION_OPERATOR_TYPE_WILDCARD_MATCHES,
  [ListOperatorTypeEnum.EXISTS]: i18n.CONDITION_OPERATOR_TYPE_EXISTS,
  [ListOperatorTypeEnum.LIST]: i18n.CONDITION_OPERATOR_TYPE_LIST,
});

const OPERATOR_TYPE_LABELS_EXCLUDED = Object.freeze({
  [ListOperatorTypeEnum.MATCH_ANY]: i18n.CONDITION_OPERATOR_TYPE_NOT_MATCH_ANY,
  [ListOperatorTypeEnum.MATCH]: i18n.CONDITION_OPERATOR_TYPE_NOT_MATCH,
  [ListOperatorTypeEnum.WILDCARD]: i18n.CONDITION_OPERATOR_TYPE_WILDCARD_DOES_NOT_MATCH,
  [ListOperatorTypeEnum.EXISTS]: i18n.CONDITION_OPERATOR_TYPE_DOES_NOT_EXIST,
  [ListOperatorTypeEnum.LIST]: i18n.CONDITION_OPERATOR_TYPE_NOT_IN_LIST,
});

const EuiFlexGroupNested = styled(EuiFlexGroup)`
  margin-left: ${({ theme }) => theme.euiTheme.size.xl};
`;

const EuiFlexItemNested = styled(EuiFlexItem)`
  margin-bottom: 6px !important;
  margin-top: 6px !important;
`;

const StyledCondition = styled('span')`
  margin-right: 6px;
`;

export interface CriteriaConditionsProps {
  entries: ExceptionListItemSchema['entries'];
  dataTestSubj: string;
  os?: ExceptionListItemSchema['os_types'];
}

export const ExceptionItemCardConditions = memo<CriteriaConditionsProps>(
  ({ os, entries, dataTestSubj }) => {
    const { euiTheme } = useEuiTheme();
    const borderStyles = css`
      border: ${euiTheme.border.thin};
    `;
    const panelStyles = cx('eui-xScroll', borderStyles);

    const osLabel = useMemo(() => {
      if (os != null && os.length > 0) {
        return os
          .map((osValue) => OS_LABELS[osValue as keyof typeof OS_LABELS] ?? osValue)
          .join(', ');
      }

      return null;
    }, [os]);

    const getEntryValue = (type: string, value: string | string[] | undefined) => {
      if (type === 'match_any' && Array.isArray(value)) {
        return value.map((currentValue) => (
          <EuiBadge color="hollow">
            <EntryValueWrap>{currentValue}</EntryValueWrap>
          </EuiBadge>
        ));
      } else if (type === 'list' && value) {
        return (
          <ShowValueListModal shouldShowContentIfModalNotAvailable listId={value.toString()}>
            {value}
          </ShowValueListModal>
        );
      }
      // @ts-expect-error upgrade typescript v5.9.3
      return <EntryValueWrap>{value}</EntryValueWrap> ?? '';
    };

    const getEntryOperator = (type: string, operator: string) => {
      if (type === 'nested') return '';
      return operator === 'included'
        ? OPERATOR_TYPE_LABELS_INCLUDED[type as keyof typeof OPERATOR_TYPE_LABELS_INCLUDED] ?? type
        : OPERATOR_TYPE_LABELS_EXCLUDED[type as keyof typeof OPERATOR_TYPE_LABELS_EXCLUDED] ?? type;
    };

    const getNestedEntriesContent = useCallback(
      (type: string, nestedEntries: NonEmptyNestedEntriesArray) => {
        if (type === 'nested' && nestedEntries.length) {
          return nestedEntries.map((entry) => {
            const { field: nestedField, type: nestedType, operator: nestedOperator } = entry;
            const nestedValue = 'value' in entry ? entry.value : '';
            return (
              <EuiFlexGroupNested
                data-test-subj={`${dataTestSubj}-nestedCondition`}
                key={nestedField + nestedType + nestedValue}
                direction="row"
                alignItems="center"
                gutterSize="m"
                responsive={false}
              >
                <EuiFlexItemNested grow={false}>
                  <EuiToken iconType="tokenNested" size="s" />
                </EuiFlexItemNested>
                <EuiFlexItemNested grow={false}>
                  <EuiExpression description={''} value={nestedField} color="subdued" />
                </EuiFlexItemNested>
                <EuiFlexItemNested grow={false}>
                  <EuiExpression
                    description={getEntryOperator(nestedType, nestedOperator)}
                    value={getEntryValue(nestedType, nestedValue)}
                  />
                </EuiFlexItemNested>
                <ValueWithSpaceWarning value={nestedValue} />
              </EuiFlexGroupNested>
            );
          });
        }
      },
      [dataTestSubj]
    );

    const getValue = useCallback(
      (
        entry:
          | EntryExists
          | EntryList
          | EntryMatch
          | EntryMatchAny
          | EntryMatchWildcard
          | EntryNested
      ) => {
        if (entry.type === 'list') {
          return entry.list.id;
        } else {
          return 'value' in entry ? entry.value : '';
        }
      },
      []
    );

    return (
      <EuiPanel
        className={panelStyles}
        color="subdued"
        hasBorder={true}
        hasShadow={false}
        data-test-subj={dataTestSubj}
      >
        {osLabel != null && (
          <div data-test-subj={`${dataTestSubj}-os`}>
            <strong>
              <EuiExpression description={''} value={i18n.CONDITION_OS} />
              <EuiExpression description={i18n.CONDITION_OPERATOR_TYPE_MATCH} value={osLabel} />
            </strong>
          </div>
        )}
        {entries.map((entry, index) => {
          const { field, type } = entry;
          const value = getValue(entry);

          const nestedEntries = 'entries' in entry ? entry.entries : [];
          const operator = 'operator' in entry ? entry.operator : '';
          return (
            <div data-test-subj={`${dataTestSubj}-condition`} key={field + type + value + index}>
              <div className="eui-xScroll">
                <EuiExpression
                  description={
                    index === 0 ? '' : <StyledCondition>{i18n.CONDITION_AND}</StyledCondition>
                  }
                  value={field}
                  color={index === 0 ? 'primary' : 'subdued'}
                />
                <EuiExpression
                  description={getEntryOperator(type, operator)}
                  value={getEntryValue(type, value)}
                />
                <ValueWithSpaceWarning value={value} />
              </div>
              {nestedEntries != null && getNestedEntriesContent(type, nestedEntries)}
            </div>
          );
        })}
      </EuiPanel>
    );
  }
);
ExceptionItemCardConditions.displayName = 'ExceptionItemCardConditions';
