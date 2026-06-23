/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { IngestStreamLifecycleDSL, PhaseName } from '@kbn/streams-schema';
import {
  EuiButton,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiText,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { FormProvider, useForm, useFormState, useWatch } from 'react-hook-form';

import { FrozenEnterpriseRequiredCallout } from '@kbn/data-lifecycle-phases';
import type { EditDlmPhasesFlyoutProps } from './types';
import type { EditDataPhasesFlyoutChangeMeta } from '../shared';
import { DlmSearchableSnapshotInfoSection } from './sections/dlm_searchable_snapshot_info_section';
import { AfterField, getDlmPhasesFlyoutFormSchema, type DlmPhasesFlyoutFormInternal } from './form';

import { DEFAULT_NEW_PHASE_MIN_AGE, TIME_UNIT_OPTIONS } from '../edit_ilm_phases_flyout/constants';
import { PhaseTabsRow } from '../shared';
import { useDataPhasesFlyoutStyles } from '../shared';
import { useIlmPhasesColorAndDescription } from '../../hooks/use_ilm_phases_color_and_description';
import {
  formatDuration,
  getAfterFieldHelpText,
  getDoubledDurationFromPrevious,
  parseIntervalWithDefaultUnit,
  type PreservedTimeUnit,
  zodResolver,
} from '../shared';
import { FlyoutShell, syncSelectedPhase, useDebouncedOnChangeEmit } from '../shared';
import { IlmPhaseSelect } from '../ilm_phase_select/ilm_phase_select';

const HOT_DISABLED_TOOLTIP = i18n.translate(
  'xpack.streams.editDlmPhasesFlyout.hotPhaseDisabledTooltip',
  {
    defaultMessage:
      'The hot phase is required and fully managed in data stream lifecycles. No manual configuration is needed.',
  }
);

const buildInitialValues = (
  initialDsl: IngestStreamLifecycleDSL['dsl']
): DlmPhasesFlyoutFormInternal => {
  const frozenParsed = parseIntervalWithDefaultUnit(initialDsl.frozen_after);
  const deleteParsed = parseIntervalWithDefaultUnit(initialDsl.data_retention);

  return {
    frozen: {
      enabled: Boolean(initialDsl.frozen_after),
      afterValue: frozenParsed.value,
      afterUnit: frozenParsed.unit,
    },
    delete: {
      enabled: Boolean(initialDsl.data_retention),
      afterValue: deleteParsed.value,
      afterUnit: deleteParsed.unit,
    },
  };
};

const formatDslOutput = (values: DlmPhasesFlyoutFormInternal): IngestStreamLifecycleDSL['dsl'] => {
  const dsl: IngestStreamLifecycleDSL['dsl'] = {};

  if (values.frozen.enabled) {
    const frozenAfter = formatDuration(values.frozen.afterValue, values.frozen.afterUnit, {
      integerOnly: true,
      minInclusive: 0,
    });
    if (frozenAfter) dsl.frozen_after = frozenAfter;
  }

  if (values.delete.enabled) {
    const dataRetention = formatDuration(values.delete.afterValue, values.delete.afterUnit, {
      integerOnly: true,
      minInclusive: 0,
    });
    if (dataRetention) dsl.data_retention = dataRetention;
  }

  return dsl;
};

export const EditDlmPhasesFlyout = ({
  initialDsl,
  selectedPhase,
  setSelectedPhase,
  onChange,
  onSave,
  onClose,
  onChangeDebounceMs = 250,
  isSaving,
  isMissingEnterpriseLicense,
  onUpgradeEnterprise,
  onMissingDefaultRepository,
  onRefreshDefaultRepository,
  isRefreshingDefaultRepository,
  manageRepositoriesHref,
  defaultRepositoryName,
  'data-test-subj': dataTestSubjProp,
}: EditDlmPhasesFlyoutProps) => {
  const { euiTheme } = useEuiTheme();
  const flyoutTitleId = useGeneratedHtmlId({ prefix: 'streamsEditDlmPhasesFlyoutTitle' });
  const formId = useGeneratedHtmlId({ prefix: 'streamsEditDlmPhasesFlyoutForm' });
  const dataTestSubj = dataTestSubjProp ?? 'streamsEditIlmPhasesFlyout';
  const { sectionStyles, phaseDescriptionNoBottomPaddingStyles } = useDataPhasesFlyoutStyles();
  const { ilmPhases } = useIlmPhasesColorAndDescription();
  const enterpriseCalloutCss = useMemo(
    () => css`
      padding: ${euiTheme.size.m} ${euiTheme.size.l};
    `,
    [euiTheme.size.l, euiTheme.size.m]
  );

  const schema = useMemo(() => getDlmPhasesFlyoutFormSchema(), []);
  const methods = useForm<DlmPhasesFlyoutFormInternal>({
    defaultValues: buildInitialValues(initialDsl),
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    shouldUnregister: false,
  });

  const { errors, isSubmitting } = useFormState({ control: methods.control });

  const [frozenEnabled, deleteEnabled] = useWatch({
    control: methods.control,
    name: ['frozen.enabled', 'delete.enabled'],
  });
  const emitSignal = useWatch({
    control: methods.control,
    name: [
      'frozen.enabled',
      'frozen.afterValue',
      'frozen.afterUnit',
      'delete.enabled',
      'delete.afterValue',
      'delete.afterUnit',
    ],
  });

  const hasAdditionalPhases = Boolean(frozenEnabled) || Boolean(deleteEnabled);

  const frozenAddBlockedReason =
    isMissingEnterpriseLicense === true
      ? ('enterpriseRequired' as const)
      : defaultRepositoryName
      ? undefined
      : ('defaultRepositoryRequired' as const);

  const triggerFrozenBlockedAction = useCallback(
    (reason: 'enterpriseRequired' | 'defaultRepositoryRequired') => {
      if (reason === 'enterpriseRequired') {
        onUpgradeEnterprise?.();
        return;
      }
      onMissingDefaultRepository?.();
    },
    [onMissingDefaultRepository, onUpgradeEnterprise]
  );

  const buildInvalidPhases = useCallback(() => {
    const invalid: PhaseName[] = [];
    if (frozenEnabled && errors.frozen?.afterValue) invalid.push('frozen');
    if (deleteEnabled && errors.delete?.afterValue) invalid.push('delete');
    return invalid;
  }, [deleteEnabled, errors.delete?.afterValue, errors.frozen?.afterValue, frozenEnabled]);

  const buildMeta = useCallback<() => EditDataPhasesFlyoutChangeMeta>(
    () => ({ invalidPhases: buildInvalidPhases() }),
    [buildInvalidPhases]
  );

  useDebouncedOnChangeEmit<IngestStreamLifecycleDSL['dsl'], EditDataPhasesFlyoutChangeMeta>({
    getOutput: () => formatDslOutput(methods.getValues()),
    initialOutput: formatDslOutput(buildInitialValues(initialDsl)),
    onChange,
    buildMeta,
    onChangeDebounceMs,
    emitSignal,
  });

  const enabledPhases = useMemo(() => {
    const phases: PhaseName[] = ['hot'];
    if (frozenEnabled) phases.push('frozen');
    if (deleteEnabled) phases.push('delete');
    return phases;
  }, [deleteEnabled, frozenEnabled]);

  const enablePhaseWithDefaults = useCallback(
    (phase: 'frozen' | 'delete') => {
      methods.setValue(`${phase}.enabled`, true);

      const valuePath = `${phase}.afterValue` as const;
      const unitPath = `${phase}.afterUnit` as const;

      if (String(methods.getValues(valuePath) ?? '').trim() === '') {
        if (phase === 'delete') {
          // Default to 2x the closest enabled previous phase's value.
          // For DLM, the only previous phase that can provide a value is `frozen`.
          if (frozenEnabled) {
            const previousValue = String(methods.getValues('frozen.afterValue') ?? '').trim();
            const previousUnit = String(
              methods.getValues('frozen.afterUnit') ?? 'd'
            ) as PreservedTimeUnit;
            const previousNum = Number(previousValue);

            if (previousValue !== '' && Number.isFinite(previousNum) && previousNum >= 0) {
              const { value, unit } = getDoubledDurationFromPrevious({
                previousValue,
                previousUnit,
                previousValueFallback: previousNum,
                previousValueMinInclusive: 0,
              });
              methods.setValue(valuePath, value);
              methods.setValue(unitPath, unit);
            } else {
              methods.setValue(valuePath, DEFAULT_NEW_PHASE_MIN_AGE.value);
              methods.setValue(unitPath, DEFAULT_NEW_PHASE_MIN_AGE.unit);
            }
          } else {
            methods.setValue(valuePath, DEFAULT_NEW_PHASE_MIN_AGE.value);
            methods.setValue(unitPath, DEFAULT_NEW_PHASE_MIN_AGE.unit);
          }
        } else {
          methods.setValue(valuePath, DEFAULT_NEW_PHASE_MIN_AGE.value);
          methods.setValue(unitPath, DEFAULT_NEW_PHASE_MIN_AGE.unit);
        }
      }

      setTimeout(() => void methods.trigger([valuePath]), 0);
    },
    [frozenEnabled, methods]
  );

  const selectPhase = useCallback(
    (phase: PhaseName | undefined) => {
      if (!phase) {
        setSelectedPhase(undefined);
        return;
      }
      if (phase === 'hot') return;
      if (phase === 'frozen' || phase === 'delete') {
        if (phase === 'frozen' && !frozenEnabled && frozenAddBlockedReason) {
          triggerFrozenBlockedAction(frozenAddBlockedReason);
          return;
        }
        enablePhaseWithDefaults(phase);
        setSelectedPhase(phase);
      }
    },
    [
      enablePhaseWithDefaults,
      frozenAddBlockedReason,
      frozenEnabled,
      setSelectedPhase,
      triggerFrozenBlockedAction,
    ]
  );

  const ensurePhaseEnabledWithDefaults = useCallback(
    (phase: PhaseName): boolean => {
      if (phase === 'hot') return false;

      if (phase === 'frozen') {
        if (frozenAddBlockedReason) return false;
        if (!frozenEnabled) {
          enablePhaseWithDefaults('frozen');
        }
        return true;
      }

      if (phase === 'delete') {
        if (!deleteEnabled) {
          enablePhaseWithDefaults('delete');
        }
        return true;
      }

      return false;
    },
    [deleteEnabled, enablePhaseWithDefaults, frozenAddBlockedReason, frozenEnabled]
  );

  useEffect(() => {
    if (!selectedPhase) return;

    if (selectedPhase === 'hot') {
      if (frozenEnabled) setSelectedPhase('frozen');
      else if (deleteEnabled) setSelectedPhase('delete');
      else setSelectedPhase(undefined);
      return;
    }

    const result = syncSelectedPhase({
      selectedPhase,
      enabledPhases,
      ensurePhaseEnabledWithDefaults,
      getFallbackPhase: () => {
        if (frozenEnabled) return 'frozen';
        if (deleteEnabled) return 'delete';
        return undefined;
      },
    });
    if (result.action === 'set') {
      setSelectedPhase(result.phase);
    }
  }, [
    deleteEnabled,
    enabledPhases,
    ensurePhaseEnabledWithDefaults,
    frozenEnabled,
    selectedPhase,
    setSelectedPhase,
  ]);

  const tabHasErrors = useCallback(
    (phaseName: PhaseName) => {
      if (phaseName === 'frozen') return Boolean(errors.frozen?.afterValue);
      if (phaseName === 'delete') return Boolean(errors.delete?.afterValue);
      return false;
    },
    [errors.delete?.afterValue, errors.frozen?.afterValue]
  );

  const hasFrozenEnterpriseWarning = Boolean(isMissingEnterpriseLicense) && Boolean(frozenEnabled);
  const showFrozenEnterpriseCallout = hasFrozenEnterpriseWarning && selectedPhase === 'frozen';
  const hasFrozenDefaultRepositoryWarning = Boolean(frozenEnabled) && !defaultRepositoryName;
  const hasFrozenWarning = hasFrozenEnterpriseWarning || hasFrozenDefaultRepositoryWarning;
  const warningPhases = hasFrozenWarning ? (['frozen'] as PhaseName[]) : [];

  const title = i18n.translate('xpack.streams.editDlmPhasesFlyout.title', {
    defaultMessage: 'Edit data phases',
  });

  const disableAddPhaseButton = Boolean(frozenEnabled) && Boolean(deleteEnabled);
  const tabsRow = (
    <PhaseTabsRow
      enabledPhases={enabledPhases}
      searchableSnapshotRepositories={[]}
      canCreateRepository={true}
      excludedPhases={['hot', 'warm', 'cold']}
      disabledPhaseTooltips={{ hot: HOT_DISABLED_TOOLTIP }}
      selectedPhase={selectedPhase}
      setSelectedPhase={selectPhase}
      tabHasErrors={tabHasErrors}
      warningPhases={warningPhases}
      disabledPhases={['hot']}
      disableAddPhaseButton={disableAddPhaseButton}
      showEnterpriseLicenseRequiredBadge={frozenAddBlockedReason === 'enterpriseRequired'}
      showDefaultRepositoryRequiredBadge={frozenAddBlockedReason === 'defaultRepositoryRequired'}
      dataTestSubj={dataTestSubj}
    />
  );

  const hasFormErrors = Object.keys(errors).length > 0;

  const renderFrozenPanel = () => {
    if (!frozenEnabled) return null;
    const isHidden = selectedPhase !== 'frozen';
    const isFrozenAfterDisabled = showFrozenEnterpriseCallout || hasFrozenDefaultRepositoryWarning;
    return (
      <div hidden={isHidden} data-test-subj={`${dataTestSubj}Panel-frozen`}>
        <EuiText size="s" color="subdued" css={phaseDescriptionNoBottomPaddingStyles}>
          {ilmPhases.frozen.description}
        </EuiText>

        <div css={sectionStyles}>
          <EuiFlexGroup direction="column" gutterSize="m" responsive={false}>
            <EuiFlexItem grow={false}>
              <AfterField
                phase="frozen"
                label={i18n.translate('xpack.streams.editDlmPhasesFlyout.frozen.moveAfterLabel', {
                  defaultMessage: 'Move after',
                })}
                dataTestSubj={dataTestSubj}
                isDisabled={isFrozenAfterDisabled}
                isInvalid={Boolean(errors.frozen?.afterValue)}
                error={
                  errors.frozen?.afterValue?.message
                    ? String(errors.frozen.afterValue.message)
                    : undefined
                }
                timeUnitOptions={TIME_UNIT_OPTIONS}
                validatePathsOnCommit={['frozen.afterValue', 'delete.afterValue']}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>

        <EuiHorizontalRule margin="none" />
        <div css={sectionStyles}>
          <DlmSearchableSnapshotInfoSection
            dataTestSubj={dataTestSubj}
            manageRepositoriesHref={manageRepositoriesHref}
            defaultRepositoryName={defaultRepositoryName}
            onCreateDefaultRepository={onMissingDefaultRepository}
            onRefresh={onRefreshDefaultRepository}
            isRefreshing={isRefreshingDefaultRepository}
          />
        </div>

        <EuiHorizontalRule margin="none" />
        <div css={sectionStyles}>
          <EuiButton
            color="danger"
            size="s"
            data-test-subj={`${dataTestSubj}RemoveFrozenPhaseButton`}
            onClick={() => {
              methods.setValue('frozen.enabled', false);
              void methods.trigger();
              const remaining = enabledPhases.filter((p) => p !== 'frozen');
              const remainingNonHot = remaining.filter((p) => p !== 'hot');
              if (remainingNonHot.length > 0) setSelectedPhase(remainingNonHot[0]);
              else setSelectedPhase(undefined);
            }}
          >
            {i18n.translate('xpack.streams.editDlmPhasesFlyout.removePhase', {
              defaultMessage: 'Remove {phase} phase',
              values: { phase: 'frozen' },
            })}
          </EuiButton>
        </div>
      </div>
    );
  };

  const renderDeletePanel = () => {
    if (!deleteEnabled) return null;
    const isHidden = selectedPhase !== 'delete';
    const previousPhase: PhaseName = frozenEnabled ? 'frozen' : 'hot';
    const previousPhaseAfter = frozenEnabled
      ? formatDuration(
          methods.getValues('frozen.afterValue'),
          methods.getValues('frozen.afterUnit')
        )
      : undefined;
    const deleteAfterHelpText = getAfterFieldHelpText({
      previousPhase,
      previousPhaseAfter,
    });

    return (
      <div hidden={isHidden} data-test-subj={`${dataTestSubj}Panel-delete`}>
        <EuiText size="s" color="subdued" css={phaseDescriptionNoBottomPaddingStyles}>
          {ilmPhases.delete.description}
        </EuiText>

        <div css={sectionStyles}>
          <EuiFlexGroup direction="column" gutterSize="m" responsive={false}>
            <EuiFlexItem grow={false}>
              <AfterField
                phase="delete"
                label={i18n.translate('xpack.streams.editDlmPhasesFlyout.delete.deleteAfterLabel', {
                  defaultMessage: 'Delete after',
                })}
                dataTestSubj={dataTestSubj}
                isDisabled={false}
                isInvalid={Boolean(errors.delete?.afterValue)}
                error={
                  errors.delete?.afterValue?.message
                    ? String(errors.delete.afterValue.message)
                    : undefined
                }
                helpText={deleteAfterHelpText}
                timeUnitOptions={TIME_UNIT_OPTIONS}
                validatePathsOnCommit={['frozen.afterValue', 'delete.afterValue']}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>

        <EuiHorizontalRule margin="none" />
        <div css={sectionStyles}>
          <EuiButton
            color="danger"
            size="s"
            data-test-subj={`${dataTestSubj}RemoveDeletePhaseButton`}
            onClick={() => {
              methods.setValue('delete.enabled', false);
              void methods.trigger();
              const remaining = enabledPhases.filter((p) => p !== 'delete');
              const remainingNonHot = remaining.filter((p) => p !== 'hot');
              if (remainingNonHot.length > 0) setSelectedPhase(remainingNonHot[0]);
              else setSelectedPhase(undefined);
            }}
          >
            {i18n.translate('xpack.streams.editDlmPhasesFlyout.removePhase', {
              defaultMessage: 'Remove {phase} phase',
              values: { phase: 'delete' },
            })}
          </EuiButton>
        </div>
      </div>
    );
  };

  return (
    <FlyoutShell
      dataTestSubj={dataTestSubj}
      flyoutTitleId={flyoutTitleId}
      formId={formId}
      onClose={onClose}
      title={title}
      tabsRow={tabsRow}
      isSubmitting={isSubmitting}
      isSaving={isSaving}
      isSaveDisabledDueToInvalid={hasFormErrors}
    >
      <FormProvider {...methods}>
        <form
          id={formId}
          onSubmit={methods.handleSubmit((values) => onSave(formatDslOutput(values)))}
          noValidate
        >
          {showFrozenEnterpriseCallout && (
            <FrozenEnterpriseRequiredCallout
              onUpgradeEnterprise={onUpgradeEnterprise}
              calloutTestSubj={`${dataTestSubj}FrozenEnterpriseRequiredCallout`}
              upgradeButtonTestSubj={`${dataTestSubj}UpgradeEnterpriseButton`}
              calloutCss={enterpriseCalloutCss}
            />
          )}

          {!hasAdditionalPhases ? (
            <EuiFlexGroup
              justifyContent="center"
              alignItems="center"
              style={{ minHeight: 400, height: '100%' }}
            >
              <EuiFlexItem grow={false}>
                <EuiEmptyPrompt
                  title={
                    <EuiText size="s">
                      <h3>
                        {i18n.translate('xpack.streams.editDlmPhasesFlyout.emptyState.title', {
                          defaultMessage: 'No additional data phases configured',
                        })}
                      </h3>
                    </EuiText>
                  }
                  body={
                    <EuiText size="s">
                      <p>
                        {i18n.translate('xpack.streams.editDlmPhasesFlyout.emptyState.body', {
                          defaultMessage:
                            'You have no data phases beyond the required hot phase. Add a new data phase or apply to use the hot phase by itself.',
                        })}
                      </p>
                    </EuiText>
                  }
                  actions={[
                    <IlmPhaseSelect
                      key="addPhase"
                      selectedPhases={enabledPhases}
                      excludedPhases={['hot', 'warm', 'cold']}
                      onSelect={(phase) => selectPhase(phase)}
                      showEnterpriseLicenseRequiredBadge={
                        frozenAddBlockedReason === 'enterpriseRequired'
                      }
                      showDefaultRepositoryRequiredBadge={
                        frozenAddBlockedReason === 'defaultRepositoryRequired'
                      }
                      renderButton={(buttonProps) => (
                        <EuiButton
                          {...buttonProps}
                          size="s"
                          iconType="arrowDown"
                          iconSide="right"
                          data-test-subj={`${dataTestSubj}DlmEmptyStateAddButton`}
                        >
                          {i18n.translate('xpack.streams.editDlmPhasesFlyout.addPhaseButtonLabel', {
                            defaultMessage: 'Add data phase',
                          })}
                        </EuiButton>
                      )}
                    />,
                  ]}
                  data-test-subj={`${dataTestSubj}DlmEmptyState`}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : (
            <>
              {renderFrozenPanel()}
              {renderDeletePanel()}
            </>
          )}
        </form>
      </FormProvider>
    </FlyoutShell>
  );
};
