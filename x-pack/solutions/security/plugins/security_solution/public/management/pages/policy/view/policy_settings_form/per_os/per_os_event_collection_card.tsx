/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useId, useMemo } from 'react';
import {
  EuiBetaBadge,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormFieldset,
  EuiIconTip,
  EuiPanel,
  EuiSwitch,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import { cloneDeep } from 'lodash';
import { OS_TITLES } from '../../../../../common/translations';
import { useIsExperimentalFeatureEnabled } from '../../../../../../common/hooks/use_experimental_features';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import type {
  EventFormOption,
  EventFormSelection,
  ProtectionField,
} from '../components/event_collection_card';
import type { PerOsSupplementalEventFormOption } from './event_collection_options';
import {
  SUPPLEMENTAL_GROUP_LABEL,
  LINUX_EVENT_OPTIONS,
  LINUX_SUPPLEMENTAL_EVENT_OPTIONS,
  MAC_EVENT_OPTIONS,
  WINDOWS_EVENT_OPTIONS,
} from './event_collection_options';
import type { PolicyFormComponentCommonProps } from '../types';
import { osRowPanelCss } from './os_control_layout';
import { OsRow } from './os_row';
import { POLICY_SETTING_SECTION_DESCRIPTIONS } from './policy_setting_section_descriptions';
import { PerOsSettingCard } from './per_os_setting_card';

type EventFieldChangeHandler<OS extends OperatingSystem> = (
  field: ProtectionField<OS>,
  checked: boolean
) => void;

export type PerOsEventCollectionCardProps = PolicyFormComponentCommonProps;

export const PerOsEventCollectionCard = memo<PerOsEventCollectionCardProps>(
  ({ policy, onChange, mode, 'data-test-subj': dataTestSubj }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const isLinuxDnsEnabled = useIsExperimentalFeatureEnabled('linuxDnsEvents');
    const linuxOptions = useMemo<ReadonlyArray<EventFormOption<OperatingSystem.LINUX>>>(() => {
      if (isLinuxDnsEnabled) {
        return LINUX_EVENT_OPTIONS;
      }

      return LINUX_EVENT_OPTIONS.filter(({ protectionField }) => protectionField !== 'dns');
    }, [isLinuxDnsEnabled]);
    const selections = {
      [OperatingSystem.WINDOWS]: policy.windows.events,
      [OperatingSystem.MAC]: policy.mac.events,
      [OperatingSystem.LINUX]: policy.linux.events,
    };
    const selected =
      hasSelectedEvent(selections[OperatingSystem.WINDOWS], WINDOWS_EVENT_OPTIONS) ||
      hasSelectedEvent(selections[OperatingSystem.MAC], MAC_EVENT_OPTIONS) ||
      hasSelectedEvent(selections[OperatingSystem.LINUX], linuxOptions);

    const handleWindowsEventChange = useCallback<EventFieldChangeHandler<OperatingSystem.WINDOWS>>(
      (field, checked) => {
        const updatedPolicy = cloneDeep(policy);
        updatedPolicy.windows.events[field] = checked;
        onChange({ isValid: true, updatedPolicy });
      },
      [onChange, policy]
    );

    const handleMacEventChange = useCallback<EventFieldChangeHandler<OperatingSystem.MAC>>(
      (field, checked) => {
        const updatedPolicy = cloneDeep(policy);
        updatedPolicy.mac.events[field] = checked;
        onChange({ isValid: true, updatedPolicy });
      },
      [onChange, policy]
    );

    const handleLinuxEventChange = useCallback<EventFieldChangeHandler<OperatingSystem.LINUX>>(
      (field, checked) => {
        const updatedPolicy = cloneDeep(policy);
        updatedPolicy.linux.events[field] = checked;

        if (updatedPolicy.linux.events.session_data === false) {
          updatedPolicy.linux.events.tty_io = false;
        }

        onChange({ isValid: true, updatedPolicy });
      },
      [onChange, policy]
    );

    return (
      <PerOsSettingCard
        title={i18n.translate('xpack.securitySolution.endpoint.policy.details.eventCollection', {
          defaultMessage: 'Event collection',
        })}
        description={POLICY_SETTING_SECTION_DESCRIPTIONS.eventCollection}
        mode={mode}
        selected={selected}
        dataTestSubj={getTestId()}
      >
        <PerOsEventCollectionRow<OperatingSystem.WINDOWS>
          os={OperatingSystem.WINDOWS}
          selection={selections[OperatingSystem.WINDOWS]}
          options={WINDOWS_EVENT_OPTIONS}
          onFieldChange={handleWindowsEventChange}
          mode={mode}
          isLast={false}
          data-test-subj={getTestId('windows')}
        />
        <PerOsEventCollectionRow<OperatingSystem.MAC>
          os={OperatingSystem.MAC}
          selection={selections[OperatingSystem.MAC]}
          options={MAC_EVENT_OPTIONS}
          onFieldChange={handleMacEventChange}
          mode={mode}
          data-test-subj={getTestId('mac')}
          isLast={false}
        />
        <PerOsEventCollectionRow<OperatingSystem.LINUX>
          os={OperatingSystem.LINUX}
          selection={selections[OperatingSystem.LINUX]}
          options={linuxOptions}
          supplementalOptions={LINUX_SUPPLEMENTAL_EVENT_OPTIONS}
          isSupplementalOptionDisabled={isLinuxSupplementalOptionDisabled}
          onFieldChange={handleLinuxEventChange}
          mode={mode}
          isLast={true}
          data-test-subj={getTestId('linux')}
        />
      </PerOsSettingCard>
    );
  }
);
PerOsEventCollectionCard.displayName = 'PerOsEventCollectionCard';

interface PerOsEventCollectionRowProps<OS extends OperatingSystem> {
  os: OS;
  selection: EventFormSelection<OS>;
  options: ReadonlyArray<EventFormOption<OS>>;
  supplementalOptions?: ReadonlyArray<PerOsSupplementalEventFormOption<OS>>;
  isSupplementalOptionDisabled?: (
    field: ProtectionField<OS>,
    selection: EventFormSelection<OS>
  ) => boolean;
  onFieldChange: EventFieldChangeHandler<OS>;
  mode: 'edit' | 'view';
  isLast: boolean;
  'data-test-subj'?: string;
}

const PerOsEventCollectionRow = <OS extends OperatingSystem>({
  os,
  selection,
  options,
  supplementalOptions,
  isSupplementalOptionDisabled,
  onFieldChange,
  mode,
  isLast,
  'data-test-subj': dataTestSubj,
}: PerOsEventCollectionRowProps<OS>) => {
  const getTestId = useTestIdGenerator(dataTestSubj);
  const inputIdPrefix = useId();
  const isEditMode = mode === 'edit';

  return (
    <OsRow
      os={os}
      primaryControl={
        <EuiFormFieldset legend={{ children: OS_TITLES[os], display: 'hidden' }}>
          {/* Horizontal, wrapping: EuiCheckbox is block-level, so a bare container stacks them. */}
          <EuiFlexGroup
            gutterSize="l"
            alignItems="center"
            wrap={true}
            data-test-subj={getTestId('options')}
          >
            {options.map(({ name, protectionField }) => (
              <EuiFlexItem grow={false} key={String(protectionField)}>
                <EuiCheckbox
                  id={`${inputIdPrefix}-${String(protectionField)}`}
                  label={name}
                  checked={Boolean(selection[protectionField])}
                  onChange={(event) => onFieldChange(protectionField, event.target.checked)}
                  disabled={!isEditMode}
                  data-test-subj={getTestId(String(protectionField))}
                />
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFormFieldset>
      }
      isLast={isLast}
      data-test-subj={getTestId()}
    >
      {supplementalOptions && supplementalOptions.length > 0 && (
        <EuiFormFieldset legend={{ children: SUPPLEMENTAL_GROUP_LABEL, display: 'hidden' }}>
          {supplementalOptions && supplementalOptions.length > 0 && (
            <>
              {/* Subdued panel with one horizontal row of supplemental controls, per the mock. */}
              <EuiPanel
                color="subdued"
                hasShadow={false}
                paddingSize="s"
                css={osRowPanelCss}
                data-test-subj={getTestId('supplementalPanel')}
              >
                <EuiFlexGroup gutterSize="l" alignItems="center" wrap={true}>
                  {supplementalOptions.map(
                    ({ name, protectionField, tooltipText, beta, renderAs }) => {
                      const field = String(protectionField);
                      const isDisabled =
                        !isEditMode ||
                        Boolean(isSupplementalOptionDisabled?.(protectionField, selection));

                      return (
                        <EuiFlexItem
                          grow={false}
                          key={field}
                          data-test-subj={getTestId(`${field}Container`)}
                        >
                          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                            <EuiFlexItem grow={false}>
                              {renderAs === 'switch' ? (
                                <EuiSwitch
                                  label={name}
                                  checked={Boolean(selection[protectionField])}
                                  onChange={(event) =>
                                    onFieldChange(protectionField, event.target.checked)
                                  }
                                  disabled={isDisabled}
                                  data-test-subj={getTestId(field)}
                                />
                              ) : (
                                <EuiCheckbox
                                  id={`${inputIdPrefix}-${field}`}
                                  label={name}
                                  checked={Boolean(selection[protectionField])}
                                  onChange={(event) =>
                                    onFieldChange(protectionField, event.target.checked)
                                  }
                                  disabled={isDisabled}
                                  data-test-subj={getTestId(field)}
                                />
                              )}
                            </EuiFlexItem>

                            {tooltipText && (
                              <EuiFlexItem grow={false}>
                                <EuiIconTip
                                  position="right"
                                  content={tooltipText}
                                  anchorProps={{
                                    'data-test-subj': getTestId(`${field}TooltipIcon`),
                                  }}
                                />
                              </EuiFlexItem>
                            )}

                            {beta && (
                              <EuiFlexItem grow={false}>
                                <EuiBetaBadge
                                  label="beta"
                                  size="s"
                                  data-test-subj={getTestId(`${field}Badge`)}
                                />
                              </EuiFlexItem>
                            )}
                          </EuiFlexGroup>
                        </EuiFlexItem>
                      );
                    }
                  )}
                </EuiFlexGroup>
              </EuiPanel>
            </>
          )}
        </EuiFormFieldset>
      )}
    </OsRow>
  );
};

const hasSelectedEvent = <OS extends OperatingSystem>(
  selection: EventFormSelection<OS>,
  options: ReadonlyArray<EventFormOption<OS>>
): boolean => options.some(({ protectionField }) => Boolean(selection[protectionField]));

const isLinuxSupplementalOptionDisabled = (
  field: ProtectionField<OperatingSystem.LINUX>,
  selection: EventFormSelection<OperatingSystem.LINUX>
): boolean => {
  if (field === 'session_data') {
    return !selection.process;
  }

  if (field === 'tty_io') {
    return !selection.session_data;
  }

  return false;
};
