/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
} from '@elastic/eui';
import {
  SEVERITY_LEVELS,
  type SeverityLevel,
  type ThreatCategory,
} from '../../../../common/threat_intelligence/hub';
import { getThreatCategoryLabel } from '../../../../common/threat_intelligence/hub';
import { SEVERITY_HEX, type ReportFeedSort } from './constants';
import { getSeverityLabel } from './severity_labels';

export const ReportFeedFilterRow: React.FC<{
  severityCounts: Record<SeverityLevel, number>;
  categoryCounts: Map<ThreatCategory, number>;
  selectedSeverities: SeverityLevel[];
  selectedCategories: ThreatCategory[];
  onToggleSeverity: (severity: SeverityLevel) => void;
  onToggleCategory: (category: ThreatCategory) => void;
  onClear: () => void;
  sortBy: ReportFeedSort;
  onSortChange: (next: ReportFeedSort) => void;
  totalShown: number;
  totalAvailable: number;
}> = ({
  severityCounts,
  categoryCounts,
  selectedSeverities,
  selectedCategories,
  onToggleSeverity,
  onToggleCategory,
  onClear,
  sortBy,
  onSortChange,
  totalShown,
  totalAvailable,
}) => {
  const sortOptions = useMemo(
    () => [
      {
        id: 'relevance',
        label: i18n.translate(
          'xpack.securitySolution.threatIntelligence.reportFeed.sortRelevance',
          {
            defaultMessage: 'Relevance',
          }
        ),
      },
      {
        id: 'date',
        label: i18n.translate('xpack.securitySolution.threatIntelligence.reportFeed.sortDate', {
          defaultMessage: 'Date',
        }),
      },
      {
        id: 'severity',
        label: i18n.translate('xpack.securitySolution.threatIntelligence.reportFeed.sortSeverity', {
          defaultMessage: 'Severity',
        }),
      },
    ],
    []
  );

  const visibleCategories = useMemo(
    () =>
      Array.from(categoryCounts.entries())
        .filter(([, count]) => count > 0)
        .slice(0, 8),
    [categoryCounts]
  );

  const hasAnyFilter = selectedSeverities.length > 0 || selectedCategories.length > 0;

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="threatIntelReportFeedFilterRow">
      <EuiFlexGroup gutterSize="m" wrap alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="xs" wrap alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {i18n.translate(
                  'xpack.securitySolution.threatIntelligence.reportFeed.filterLabel',
                  {
                    defaultMessage: 'Filter:',
                  }
                )}
              </EuiText>
            </EuiFlexItem>
            {SEVERITY_LEVELS.slice()
              .reverse()
              .map((severity) => {
                const count = severityCounts[severity];
                if (count === 0) return null;
                const isSelected = selectedSeverities.includes(severity);
                return (
                  <EuiFlexItem key={`severity-chip-${severity}`} grow={false}>
                    <EuiBadge
                      color={isSelected ? SEVERITY_HEX[severity] : 'hollow'}
                      onClick={() => onToggleSeverity(severity)}
                      onClickAriaLabel={i18n.translate(
                        'xpack.securitySolution.threatIntelligence.reportFeed.severityChipAria',
                        {
                          defaultMessage: 'Toggle {severity} severity filter',
                          values: { severity },
                        }
                      )}
                      data-test-subj={`threatIntelSeverityChip-${severity}`}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          marginRight: 6,
                          background: SEVERITY_HEX[severity],
                        }}
                      />
                      {`${getSeverityLabel(severity)} (${count})`}
                    </EuiBadge>
                  </EuiFlexItem>
                );
              })}
            {visibleCategories.map(([category, count]) => {
              const isSelected = selectedCategories.includes(category);
              return (
                <EuiFlexItem key={`category-chip-${category}`} grow={false}>
                  <EuiBadge
                    color={isSelected ? 'primary' : 'hollow'}
                    onClick={() => onToggleCategory(category)}
                    onClickAriaLabel={i18n.translate(
                      'xpack.securitySolution.threatIntelligence.reportFeed.categoryChipAria',
                      {
                        defaultMessage: 'Toggle {category} category filter',
                        values: { category },
                      }
                    )}
                    data-test-subj={`threatIntelCategoryChip-${category}`}
                  >
                    {`${getThreatCategoryLabel(category)} (${count})`}
                  </EuiBadge>
                </EuiFlexItem>
              );
            })}
            {hasAnyFilter ? (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size="xs" iconType="cross" onClick={onClear}>
                  {i18n.translate(
                    'xpack.securitySolution.threatIntelligence.reportFeed.filterClear',
                    {
                      defaultMessage: 'Clear',
                    }
                  )}
                </EuiButtonEmpty>
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonGroup
                legend={i18n.translate(
                  'xpack.securitySolution.threatIntelligence.reportFeed.sortLegend',
                  {
                    defaultMessage: 'Sort reports by',
                  }
                )}
                options={sortOptions}
                idSelected={sortBy}
                onChange={(id) => onSortChange(id as ReportFeedSort)}
                buttonSize="compressed"
                data-test-subj="threatIntelReportFeedSort"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued" data-test-subj="threatIntelReportFeedCount">
                {i18n.translate('xpack.securitySolution.threatIntelligence.reportFeed.countLabel', {
                  defaultMessage: '{shown} of {total}',
                  values: { shown: totalShown, total: totalAvailable },
                })}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
