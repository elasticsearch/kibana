/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EuiFieldTextProps } from '@elastic/eui';
import {
  EuiAccordion,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiCallOut,
  EuiFieldSearch,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIconTip,
  EuiPanel,
  EuiSpacer,
  EuiText,
  useEuiBackgroundColorCSS,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { cloneDeep } from 'lodash';
import { getEmptyValue } from '../../../../../../common/components/empty_value';
import { useLicense } from '../../../../../../common/hooks/use_license';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import type { PolicyFormComponentCommonProps } from '../types';
import type { AdvancedSettingCategory } from '../../../models/advanced_policy_schema';
import { AdvancedPolicySchema } from '../../../models/advanced_policy_schema';
import { getCategory } from '../../../models/get_advanced_setting_category';

function setValue(obj: Record<string, unknown>, value: string, path: string[]) {
  let newPolicyConfig = obj;

  // First set the value.
  for (let i = 0; i < path.length - 1; i++) {
    if (!newPolicyConfig[path[i]]) {
      newPolicyConfig[path[i]] = {} as Record<string, unknown>;
    }
    newPolicyConfig = newPolicyConfig[path[i]] as Record<string, unknown>;
  }
  newPolicyConfig[path[path.length - 1]] = value;

  // Then, if the user is deleting the value, we need to ensure we clean up the config.
  // We delete any sections that are empty, whether that be an empty string, empty object, or undefined.
  if (value === '' || value === undefined) {
    newPolicyConfig = obj;
    for (let k = path.length; k >= 0; k--) {
      const nextPath = path.slice(0, k);
      for (let i = 0; i < nextPath.length - 1; i++) {
        // Traverse and find the next section
        newPolicyConfig = newPolicyConfig[nextPath[i]] as Record<string, unknown>;
      }
      if (
        newPolicyConfig[nextPath[nextPath.length - 1]] === undefined ||
        newPolicyConfig[nextPath[nextPath.length - 1]] === '' ||
        Object.keys(newPolicyConfig[nextPath[nextPath.length - 1]] as object).length === 0
      ) {
        // If we're looking at the `advanced` field, we leave it undefined as opposed to deleting it.
        // This is because the UI looks for this field to begin rendering.
        if (nextPath[nextPath.length - 1] === 'advanced') {
          newPolicyConfig[nextPath[nextPath.length - 1]] = undefined;
          // In all other cases, if field is empty, we'll delete it to clean up.
        } else {
          delete newPolicyConfig[nextPath[nextPath.length - 1]];
        }
        newPolicyConfig = obj;
      } else {
        break; // We are looking at a non-empty section, so we can terminate.
      }
    }
  }
}

function getValue(obj: Record<string, unknown>, path: string[]): string {
  let currentPolicyConfig = obj;

  for (let i = 0; i < path.length - 1; i++) {
    if (currentPolicyConfig[path[i]]) {
      currentPolicyConfig = currentPolicyConfig[path[i]] as Record<string, unknown>;
    } else {
      return '';
    }
  }
  return currentPolicyConfig[path[path.length - 1]] as string;
}

const calloutTitle = i18n.translate(
  'xpack.securitySolution.endpoint.policy.advanced.calloutTitle',
  {
    defaultMessage: 'Proceed with caution!',
  }
);

const warningMessage = i18n.translate(
  'xpack.securitySolution.endpoint.policy.advanced.warningMessage',
  {
    defaultMessage: `This section contains policy values that support advanced use cases. If not configured
    properly, these values can cause unpredictable behavior. Please consult documentation
    carefully or contact support before editing these values.`,
  }
);

const HIDE = i18n.translate('xpack.securitySolution.endpoint.policy.advanced.hide', {
  defaultMessage: 'Hide',
});
const SHOW = i18n.translate('xpack.securitySolution.endpoint.policy.advanced.show', {
  defaultMessage: 'Show',
});

const SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.endpoint.policy.advanced.searchPlaceholder',
  { defaultMessage: 'Search by setting name or description' }
);

const FILTER_ALL = i18n.translate('xpack.securitySolution.endpoint.policy.advanced.filterAll', {
  defaultMessage: 'All',
});

const OS_LINUX = i18n.translate('xpack.securitySolution.endpoint.policy.advanced.osLinux', {
  defaultMessage: 'Linux',
});
const OS_MAC = i18n.translate('xpack.securitySolution.endpoint.policy.advanced.osMac', {
  defaultMessage: 'macOS',
});
const OS_WINDOWS = i18n.translate('xpack.securitySolution.endpoint.policy.advanced.osWindows', {
  defaultMessage: 'Windows',
});

const CATEGORY_PERFORMANCE = i18n.translate(
  'xpack.securitySolution.endpoint.policy.advanced.categoryPerformance',
  { defaultMessage: 'Performance' }
);
const CATEGORY_PRODUCT_FEATURES = i18n.translate(
  'xpack.securitySolution.endpoint.policy.advanced.categoryProductFeatures',
  { defaultMessage: 'Product Features' }
);
const CATEGORY_LOGS = i18n.translate(
  'xpack.securitySolution.endpoint.policy.advanced.categoryLogs',
  { defaultMessage: 'Logs' }
);
const CATEGORY_CONFIGS = i18n.translate(
  'xpack.securitySolution.endpoint.policy.advanced.categoryConfigs',
  { defaultMessage: 'Configs' }
);
const CATEGORY_OTHERS = i18n.translate(
  'xpack.securitySolution.endpoint.policy.advanced.categoryOthers',
  { defaultMessage: 'Others' }
);

const EMPTY_STATE_MESSAGE = i18n.translate(
  'xpack.securitySolution.endpoint.policy.advanced.emptyStateMessage',
  { defaultMessage: 'No settings match your filters.' }
);

const CATEGORY_ORDER: AdvancedSettingCategory[] = [
  'performance',
  'product_features',
  'logs',
  'configs',
  'others',
];

const CATEGORY_LABELS: Record<AdvancedSettingCategory, string> = {
  performance: CATEGORY_PERFORMANCE,
  product_features: CATEGORY_PRODUCT_FEATURES,
  logs: CATEGORY_LOGS,
  configs: CATEGORY_CONFIGS,
  others: CATEGORY_OTHERS,
};

type OSFilterValue = 'all' | 'linux' | 'mac' | 'windows';

export type AdvancedSectionProps = PolicyFormComponentCommonProps;

export const AdvancedSection = memo<AdvancedSectionProps>(
  ({ policy, mode, onChange, 'data-test-subj': dataTestSubj }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const [showAdvancedPolicy, setShowAdvancedPolicy] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedOS, setSelectedOS] = useState<OSFilterValue>('all');
    const openCategoriesRef = useRef<Set<AdvancedSettingCategory>>(new Set());
    const [, setAccordionUpdateCounter] = useState(0);
    const isPlatinumPlus = useLicense().isPlatinumPlus();
    const euiBackgroundColorCSS = useEuiBackgroundColorCSS();

    const isEditMode = mode === 'edit';

    const handleAdvancedSettingsButtonClick = useCallback(() => {
      setShowAdvancedPolicy((prevState) => !prevState);
    }, []);

    const handleCategoryToggle = useCallback((category: AdvancedSettingCategory) => {
      const next = openCategoriesRef.current;
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      setAccordionUpdateCounter((c) => c + 1);
    }, []);

    const handleAdvancedSettingUpdate = useCallback<NonNullable<EuiFieldTextProps['onChange']>>(
      (event) => {
        const updatedPolicy = cloneDeep(policy);

        setValue(
          updatedPolicy as unknown as Record<string, unknown>,
          event.target.value,
          event.target.name.split('.')
        );

        onChange({ isValid: true, updatedPolicy });
      },
      [onChange, policy]
    );

    const filteredAndGroupedSettings = useMemo(() => {
      const query = searchQuery.trim().toLowerCase();

      const items = AdvancedPolicySchema.filter((entry) => {
        if (!isPlatinumPlus && entry.license === 'platinum') return false;
        if (selectedOS !== 'all') {
          const prefix =
            selectedOS === 'linux'
              ? 'linux.advanced.'
              : selectedOS === 'mac'
              ? 'mac.advanced.'
              : 'windows.advanced.';
          if (!entry.key.startsWith(prefix)) return false;
        }
        if (query) {
          const keyMatch = entry.key.toLowerCase().includes(query);
          const docMatch = entry.documentation.toLowerCase().includes(query);
          if (!keyMatch && !docMatch) return false;
        }
        return true;
      });

      const byCategory = new Map<AdvancedSettingCategory, typeof items>();
      for (const cat of CATEGORY_ORDER) {
        byCategory.set(cat, []);
      }
      for (const entry of items) {
        const cat = getCategory(entry.key);
        byCategory.get(cat)!.push(entry);
      }
      return byCategory;
    }, [policy, isPlatinumPlus, selectedOS, searchQuery]);

    const totalFilteredCount = useMemo(() => {
      let count = 0;
      filteredAndGroupedSettings.forEach((arr) => {
        count += arr.length;
      });
      return count;
    }, [filteredAndGroupedSettings]);

    const renderSettingRow = useCallback(
      (entry: (typeof AdvancedPolicySchema)[number]) => {
        const {
          key,
          documentation,
          first_supported_version: firstVersion,
          last_supported_version: lastVersion,
        } = entry;
        const configPath = key.split('.');
        const value = getValue(policy as unknown as Record<string, unknown>, configPath);
        return (
          <EuiFormRow
            key={key}
            fullWidth
            data-test-subj={getTestId(`${key}-container`)}
            label={
              <EuiFlexGroup responsive={false}>
                <EuiFlexItem grow={true} data-test-subj={getTestId(`${key}-label`)}>
                  {key}
                </EuiFlexItem>
                {documentation && (
                  <EuiFlexItem grow={false}>
                    <EuiIconTip
                      type="info"
                      content={documentation}
                      position="right"
                      anchorProps={{ 'data-test-subj': getTestId(`${key}-tooltipIcon`) }}
                    />
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            }
            labelAppend={
              <EuiText size="xs" data-test-subj={getTestId(`${key}-versionInfo`)}>
                {lastVersion ? `${firstVersion}-${lastVersion}` : `${firstVersion}+`}
              </EuiText>
            }
          >
            {isEditMode ? (
              <EuiFieldText
                data-test-subj={key}
                fullWidth
                name={key}
                value={value as string}
                onChange={handleAdvancedSettingUpdate}
              />
            ) : (
              <EuiText size="xs" data-test-subj={getTestId(`${key}-viewValue`)}>
                {value || getEmptyValue()}
              </EuiText>
            )}
          </EuiFormRow>
        );
      },
      [policy, isEditMode, getTestId, handleAdvancedSettingUpdate]
    );

    return (
      <div data-test-subj={getTestId()}>
        <EuiButtonEmpty
          data-test-subj={getTestId('showButton')}
          onClick={handleAdvancedSettingsButtonClick}
        >
          <FormattedMessage
            id="xpack.securitySolution.endpoint.policy.advanced.showHideButtonLabel"
            defaultMessage="{action} advanced settings"
            values={{ action: showAdvancedPolicy ? HIDE : SHOW }}
          />
        </EuiButtonEmpty>
        <EuiSpacer size="l" />

        {showAdvancedPolicy && (
          <div>
            {isEditMode && (
              <>
                <EuiCallOut
                  announceOnMount={false}
                  title={calloutTitle}
                  color="warning"
                  iconType="warning"
                  data-test-subj={getTestId('warning')}
                >
                  <p>{warningMessage}</p>
                </EuiCallOut>
                <EuiSpacer />
              </>
            )}

            <EuiText size="xs" color="subdued">
              <h4>
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.policy.advanced"
                  defaultMessage="Advanced settings"
                />
              </h4>
            </EuiText>

            <EuiSpacer size="s" />

            <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false} wrap={false}>
              <EuiFlexItem grow={true} style={{ minWidth: 0 }}>
                <EuiFieldSearch
                  fullWidth
                  placeholder={SEARCH_PLACEHOLDER}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-test-subj={getTestId('search')}
                  compressed
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonGroup
                  legend={i18n.translate(
                    'xpack.securitySolution.endpoint.policy.advanced.osFilterLegend',
                    { defaultMessage: 'Filter by operating system' }
                  )}
                  options={[
                    { id: 'all', label: FILTER_ALL },
                    { id: 'linux', label: OS_LINUX },
                    { id: 'mac', label: OS_MAC },
                    { id: 'windows', label: OS_WINDOWS },
                  ]}
                  idSelected={selectedOS}
                  onChange={(id) => setSelectedOS(id as OSFilterValue)}
                  buttonSize="compressed"
                  type="single"
                  data-test-subj={getTestId('osFilter')}
                />
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            {totalFilteredCount === 0 ? (
              <EuiPanel data-test-subj={getTestId('settings')} paddingSize="l">
                <EuiText size="s" color="subdued" data-test-subj={getTestId('emptyState')}>
                  {EMPTY_STATE_MESSAGE}
                </EuiText>
              </EuiPanel>
            ) : (
              <EuiFlexGroup
                gutterSize="m"
                direction="column"
                data-test-subj={getTestId('settings')}
              >
                {CATEGORY_ORDER.map((category) => {
                  const entries = filteredAndGroupedSettings.get(category)!;
                  if (entries.length === 0) return null;
                  return (
                    <EuiFlexItem key={category}>
                      <EuiPanel
                        hasBorder
                        paddingSize="none"
                        data-test-subj={getTestId(`category-${category}`)}
                      >
                        <EuiAccordion
                          id={`advanced-settings-category-${category}`}
                          className="advancedSettingsCategoryAccordion"
                          css={css`
                            &.euiAccordion-isOpen .euiAccordion__triggerWrapper {
                              border-bottom: 1px solid #d3dae6;
                            }
                          `}
                          buttonContent={
                            <span style={{ fontWeight: 600 }}>
                              {CATEGORY_LABELS[category]} ({entries.length})
                            </span>
                          }
                          buttonProps={{
                            style: {
                              padding: 12,
                              width: '100%',
                              textAlign: 'left',
                              display: 'flex',
                              alignItems: 'center',
                            },
                          }}
                          arrowProps={{
                            style: { marginLeft: 16 },
                          }}
                          forceState={openCategoriesRef.current.has(category) ? 'open' : 'closed'}
                          onToggle={() => handleCategoryToggle(category)}
                        >
                          <div css={euiBackgroundColorCSS.subdued} style={{ padding: 12 }}>
                            {entries.map((entry) => renderSettingRow(entry))}
                          </div>
                        </EuiAccordion>
                      </EuiPanel>
                    </EuiFlexItem>
                  );
                })}
              </EuiFlexGroup>
            )}
          </div>
        )}
      </div>
    );
  }
);
AdvancedSection.displayName = 'AdvancedSection';
