/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useId, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EuiFieldTextProps } from '@elastic/eui';
import {
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIconTip,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiButtonEmpty,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { cloneDeep } from 'lodash';
import { getEmptyValue } from '../../../../../../common/components/empty_value';
import { useLicense } from '../../../../../../common/hooks/use_license';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import type { PolicyFormComponentCommonProps } from '../types';
import { AdvancedPolicySchema } from '../../../models/advanced_policy_schema';

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

export interface AdvancedSectionProps extends PolicyFormComponentCommonProps {
  omitKeys?: readonly string[];
  /** When true, the show/hide control is full width with a chevron. Defaults to the legacy inline button. */
  fullWidthToggle?: boolean;
}

export const AdvancedSection = memo<AdvancedSectionProps>(
  ({ policy, mode, onChange, omitKeys, fullWidthToggle, 'data-test-subj': dataTestSubj }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const advancedSettingsId = useId();
    const [showAdvancedPolicy, setShowAdvancedPolicy] = useState<boolean>(false);
    const isPlatinumPlus = useLicense().isPlatinumPlus();

    const isEditMode = mode === 'edit';
    const visibleAdvancedPolicySchema = omitKeys?.length
      ? AdvancedPolicySchema.filter(({ key }) => !omitKeys.includes(key))
      : AdvancedPolicySchema;

    const handleAdvancedSettingsButtonClick = useCallback(() => {
      setShowAdvancedPolicy((prevState) => !prevState);
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

    return (
      <div data-test-subj={getTestId()}>
        <EuiButtonEmpty
          data-test-subj={getTestId('showButton')}
          onClick={handleAdvancedSettingsButtonClick}
          aria-expanded={showAdvancedPolicy}
          aria-controls={advancedSettingsId}
          {...(fullWidthToggle
            ? {
                iconType: showAdvancedPolicy ? ('arrowUp' as const) : ('arrowDown' as const),
                // EuiButtonEmpty exposes no fullWidth prop (only `flush`/`size`), so the
                // supported composition point is EUI's css prop. The chevron is what tests
                // assert on; no styling-free class is added purely as a selector.
                css: { width: '100%', justifyContent: 'center' },
              }
            : {})}
        >
          <FormattedMessage
            id="xpack.securitySolution.endpoint.policy.advanced.showHideButtonLabel"
            defaultMessage="{action} advanced settings"
            values={{ action: showAdvancedPolicy ? HIDE : SHOW }}
          />
        </EuiButtonEmpty>
        <EuiSpacer size="l" />

        {showAdvancedPolicy && (
          <div id={advancedSettingsId}>
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

            <EuiPanel data-test-subj={getTestId('settings')} paddingSize="s">
              {visibleAdvancedPolicySchema.map(
                (
                  {
                    key,
                    documentation,
                    first_supported_version: firstVersion,
                    last_supported_version: lastVersion,
                    license,
                  },
                  index
                ) => {
                  if (!isPlatinumPlus && license === 'platinum') {
                    return <React.Fragment key={key} />;
                  }

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
                }
              )}
            </EuiPanel>
          </div>
        )}
      </div>
    );
  }
);
AdvancedSection.displayName = 'AdvancedSection';
