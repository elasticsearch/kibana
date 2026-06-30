/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
  EuiLoadingSpinner,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useQuery } from '@kbn/react-query';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import type { ExceptionListReference } from '@kbn/alerting-v2-schemas';
import { useKibana } from '../../common/lib/kibana';

const OPERATOR_LABEL_INCLUDED: Record<string, string> = {
  match: 'is',
  match_any: 'is one of',
  exists: 'exists',
  wildcard: 'matches',
  nested: 'has nested',
};

const OPERATOR_LABEL_EXCLUDED: Record<string, string> = {
  match: 'is not',
  match_any: 'is not one of',
  exists: 'does not exist',
  wildcard: 'does not match',
  nested: 'has nested',
};

const getOperatorLabel = (entry: { type: string; operator?: string }): string => {
  const labels = entry.operator === 'excluded' ? OPERATOR_LABEL_EXCLUDED : OPERATOR_LABEL_INCLUDED;
  return labels[entry.type] ?? entry.type;
};

const OPERATOR_ICON: Record<string, string> = {
  match: 'tokenString',
  match_any: 'tokenArray',
  exists: 'tokenBoolean',
  wildcard: 'tokenEvent',
  nested: 'nested',
};

interface RuleExceptionPreviewProps {
  exceptions: ExceptionListReference[];
  onExceptionFilterChange: (filter: unknown | null) => void;
}

export const RuleExceptionPreview: React.FC<RuleExceptionPreviewProps> = ({
  exceptions,
  onExceptionFilterChange,
}) => {
  const { http } = useKibana().services;
  const { euiTheme } = useEuiTheme();
  const [enabledItemIds, setEnabledItemIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const exceptionListIds = useMemo(() => exceptions.map((e) => e.list_id), [exceptions]);

  const { data: exceptionItems, isLoading } = useQuery(
    ['ruleExceptionPreview', ...exceptionListIds],
    async () => {
      if (exceptionListIds.length === 0) return [];

      const results: ExceptionListItemSchema[] = [];
      for (const listId of exceptionListIds) {
        const ns = exceptions.find((e) => e.list_id === listId)?.namespace_type ?? 'single';
        const response = await http.get<{ data: ExceptionListItemSchema[] }>(
          '/api/exception_lists/items/_find',
          { query: { list_id: listId, namespace_type: ns, page: 1, per_page: 50 } }
        );
        results.push(...response.data);
      }
      return results;
    },
    { enabled: exceptions.length > 0, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (exceptionItems && exceptionItems.length > 0 && !initialized) {
      setEnabledItemIds(new Set(exceptionItems.map((item) => item.id)));
      setInitialized(true);
    }
  }, [exceptionItems, initialized]);

  const allEnabled =
    exceptionItems != null &&
    exceptionItems.length > 0 &&
    exceptionItems.every((item) => enabledItemIds.has(item.id));

  const toggleItem = useCallback((itemId: string) => {
    setEnabledItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allEnabled) {
      setEnabledItemIds(new Set());
    } else {
      setEnabledItemIds(new Set((exceptionItems ?? []).map((item) => item.id)));
    }
  }, [allEnabled, exceptionItems]);

  const buildFilterForEnabledItems = useCallback(() => {
    if (!exceptionItems?.length || enabledItemIds.size === 0) return null;

    const activeItems = exceptionItems.filter((item) => enabledItemIds.has(item.id));
    if (activeItems.length === 0) return null;

    const shouldClauses = activeItems
      .map((item) => {
        const clauses = item.entries
          .filter((entry) => 'value' in entry || 'field' in entry)
          .map((entry) => {
            const isExcluded = 'operator' in entry && entry.operator === 'excluded';
            let clause = null;

            if (entry.type === 'match' && 'value' in entry) {
              clause = { match: { [entry.field]: entry.value } };
            } else if (entry.type === 'match_any' && 'value' in entry) {
              clause = { terms: { [entry.field]: entry.value } };
            } else if (entry.type === 'exists') {
              clause = { exists: { field: entry.field } };
            } else if (entry.type === 'wildcard' && 'value' in entry) {
              clause = { wildcard: { [entry.field]: entry.value } };
            }

            if (!clause) return null;
            return isExcluded ? { bool: { must_not: [clause] } } : clause;
          })
          .filter(Boolean);

        if (clauses.length === 0) return null;
        return { bool: { filter: clauses } };
      })
      .filter(Boolean);

    if (shouldClauses.length === 0) return null;
    return {
      bool: { must_not: [{ bool: { should: shouldClauses, minimum_should_match: 1 } }] },
    };
  }, [exceptionItems, enabledItemIds]);

  useEffect(() => {
    onExceptionFilterChange(buildFilterForEnabledItems());
  }, [buildFilterForEnabledItems, onExceptionFilterChange]);

  if (exceptions.length === 0) {
    return null;
  }

  const activeCount = enabledItemIds.size;
  const totalCount = exceptionItems?.length ?? 0;

  const formatEntryValue = (entry: ExceptionListItemSchema['entries'][number]): string => {
    if ('value' in entry) {
      const val = entry.value;
      if (Array.isArray(val)) return val.join(', ');
      return String(val);
    }
    return '';
  };

  const itemCardCss = (isActive: boolean) => css`
    transition: opacity 150ms ease-in-out, border-color 150ms ease-in-out;
    opacity: ${isActive ? 1 : 0.45};
    border-left: 3px solid ${isActive ? euiTheme.colors.danger : euiTheme.colors.lightShade};
  `;

  const conditionRowCss = css`
    padding: 2px 0;
  `;

  const valueBadgeCss = css`
    font-family: ${euiTheme.font.familyCode};
    font-size: ${euiTheme.size.m};
  `;

  return (
    <EuiPanel paddingSize="m" hasBorder>
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="minusInCircle" color="danger" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xxs">
            <h4>Exception filters</h4>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Number of active exceptions applied to the preview">
            <EuiBadge color={activeCount > 0 ? 'danger' : 'hollow'}>
              {activeCount}/{totalCount}
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
        {isLoading && (
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="s" />
          </EuiFlexItem>
        )}
        <EuiFlexItem />
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="xs"
            iconType={allEnabled ? 'eyeClosed' : 'eye'}
            onClick={toggleAll}
            disabled={!exceptionItems?.length}
          >
            {allEnabled ? 'Disable all' : 'Enable all'}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>

      {exceptionItems && exceptionItems.length > 0 && (
        <>
          <EuiSpacer size="s" />
          {exceptionItems.map((item) => {
            const isActive = enabledItemIds.has(item.id);
            return (
              <React.Fragment key={item.id}>
                <EuiSpacer size="xs" />
                <EuiPanel paddingSize="s" hasShadow={false} css={itemCardCss(isActive)}>
                  <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiSwitch
                        label=""
                        showLabel={false}
                        checked={isActive}
                        onChange={() => toggleItem(item.id)}
                        compressed
                        data-test-subj={`exceptionToggle-${item.id}`}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size="xs">
                        <strong>{item.name || `Exception ${item.id.slice(0, 8)}`}</strong>
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>

                  {item.entries.length > 0 && (
                    <>
                      <EuiSpacer size="xs" />
                      {item.entries.map((entry, entryIdx) => (
                        <EuiFlexGroup
                          key={`${item.id}-${entryIdx}`}
                          gutterSize="xs"
                          alignItems="center"
                          responsive={false}
                          wrap
                          css={conditionRowCss}
                        >
                          <EuiFlexItem
                            grow={false}
                            css={css`
                              min-width: 30px;
                              text-align: right;
                            `}
                          >
                            <EuiText size="xs" color="subdued">
                              <em>{entryIdx > 0 ? 'AND' : 'IF'}</em>
                            </EuiText>
                          </EuiFlexItem>

                          <EuiFlexItem grow={false}>
                            <EuiBadge color="hollow" iconType={OPERATOR_ICON[entry.type]}>
                              {entry.field}
                            </EuiBadge>
                          </EuiFlexItem>

                          <EuiFlexItem grow={false}>
                            <EuiText size="xs" color="accent">
                              <strong>{getOperatorLabel(entry)}</strong>
                            </EuiText>
                          </EuiFlexItem>

                          {entry.type !== 'exists' && (
                            <EuiFlexItem grow={false}>
                              <EuiBadge color="default" css={valueBadgeCss}>
                                {formatEntryValue(entry)}
                              </EuiBadge>
                            </EuiFlexItem>
                          )}
                        </EuiFlexGroup>
                      ))}
                    </>
                  )}
                </EuiPanel>
              </React.Fragment>
            );
          })}
        </>
      )}

      {exceptionItems?.length === 0 && !isLoading && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued" textAlign="center">
            No exception items configured.
          </EuiText>
        </>
      )}
    </EuiPanel>
  );
};
