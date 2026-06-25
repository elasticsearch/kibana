/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiPanel,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { PhaseName } from '@kbn/streams-schema';
import { isEqual } from 'lodash';
import { FormProvider, useForm, useFormState, useWatch } from 'react-hook-form';
import type { EditDeletePhaseFlyoutProps, EditDeletePhaseFlyoutValue } from './types';
import { DeleteAfterField } from './delete_after_field';
import { editDeletePhaseFlyoutI18n } from './i18n';
import { useEditDeletePhaseFlyoutStyles } from './styles';
import {
  getEditDeletePhaseFlyoutFormSchema,
  mapDeletePhaseToFormValues,
  mapFormValuesToDeletePhase,
  serializeFormValuesToDeletePhase,
  type EditDeletePhaseFlyoutForm,
} from './form';
import { getMaximumRetentionMessage, parseInterval, zodResolver } from '../shared';

const isEditDeletePhaseFlyoutForm = (data: unknown): data is EditDeletePhaseFlyoutForm => {
  if (!data || typeof data !== 'object') return false;
  const maybe = data as Partial<EditDeletePhaseFlyoutForm>;
  return (
    typeof maybe.minAgeValue === 'string' &&
    typeof maybe.minAgeUnit === 'string' &&
    typeof maybe.isUsingDefaultRetention === 'boolean'
  );
};

export const EditDeletePhaseFlyout = ({
  initialValue,
  defaultRetentionPeriod,
  maximumRetentionPeriod,
  showRestoreDefaultButton = Boolean(defaultRetentionPeriod),
  allowRemoveDeletePhase = true,
  onChange,
  onChangeDebounceMs = 250,
  onSave,
  onClose,
  isSaving,
  'data-test-subj': dataTestSubjProp,
}: EditDeletePhaseFlyoutProps) => {
  const flyoutTitleId = useGeneratedHtmlId({ prefix: 'streamsEditDeletePhaseFlyoutTitle' });
  const formId = useGeneratedHtmlId({ prefix: 'streamsEditDeletePhaseFlyoutForm' });
  const dataTestSubj = dataTestSubjProp ?? 'streamsEditDeletePhaseFlyout';
  const { footerStyles, headerStyles, sectionStyles } = useEditDeletePhaseFlyoutStyles();

  const schema = useMemo(
    () => getEditDeletePhaseFlyoutFormSchema({ maximumRetentionPeriod }),
    [maximumRetentionPeriod]
  );
  const defaultValues = useMemo(
    () => mapDeletePhaseToFormValues({ defaultRetentionPeriod, initialValue }),
    [defaultRetentionPeriod, initialValue]
  );

  const methods = useForm<EditDeletePhaseFlyoutForm>({
    defaultValues,
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onBlur',
  });

  const formData = useWatch({ control: methods.control });

  const { errors, isSubmitting, isDirty } = useFormState({ control: methods.control });
  useEffect(() => {
    // Ensure invalid initial values (e.g. unparseable retention strings) surface immediately.
    void methods.trigger();
  }, [methods]);
  const initialMappedValue = useMemo(
    () => mapFormValuesToDeletePhase(defaultValues),
    [defaultValues]
  );

  const currentMappedValue = useMemo(
    () =>
      isEditDeletePhaseFlyoutForm(formData)
        ? mapFormValuesToDeletePhase(formData)
        : initialMappedValue,
    [formData, initialMappedValue]
  );
  const hasChanges = !isEqual(currentMappedValue, initialMappedValue);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const lastEmittedOutputRef = useRef<EditDeletePhaseFlyoutValue>(initialMappedValue);
  const lastEmittedMetaRef = useRef<{ invalidPhases: PhaseName[] }>({ invalidPhases: [] });
  const pendingOnChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOnChangeEmitScheduleIdRef = useRef(0);
  const hasEmittedInitialChangeRef = useRef(false);

  const scheduleOnChangeEmit = useCallback(
    (nextValue: EditDeletePhaseFlyoutValue, nextMeta: { invalidPhases: PhaseName[] }) => {
      pendingOnChangeEmitScheduleIdRef.current += 1;
      const scheduledId = pendingOnChangeEmitScheduleIdRef.current;

      if (pendingOnChangeTimeoutRef.current) {
        clearTimeout(pendingOnChangeTimeoutRef.current);
        pendingOnChangeTimeoutRef.current = null;
      }

      const emit = () => {
        if (
          !onChangeRef.current ||
          (isEqual(nextValue, lastEmittedOutputRef.current) &&
            isEqual(nextMeta, lastEmittedMetaRef.current)) ||
          pendingOnChangeEmitScheduleIdRef.current !== scheduledId
        ) {
          return;
        }

        lastEmittedOutputRef.current = nextValue;
        lastEmittedMetaRef.current = nextMeta;
        onChangeRef.current(nextValue, nextMeta);
      };

      if (onChangeDebounceMs === 0) {
        pendingOnChangeTimeoutRef.current = setTimeout(() => {
          pendingOnChangeTimeoutRef.current = null;
          emit();
        }, 0);
        return;
      }

      pendingOnChangeTimeoutRef.current = setTimeout(() => {
        pendingOnChangeTimeoutRef.current = null;
        emit();
      }, onChangeDebounceMs);
    },
    [onChangeDebounceMs]
  );

  useEffect(() => {
    return () => {
      if (pendingOnChangeTimeoutRef.current) {
        clearTimeout(pendingOnChangeTimeoutRef.current);
        pendingOnChangeTimeoutRef.current = null;
      }
      pendingOnChangeEmitScheduleIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!hasEmittedInitialChangeRef.current) {
      hasEmittedInitialChangeRef.current = true;
      lastEmittedOutputRef.current = currentMappedValue;
      lastEmittedMetaRef.current = { invalidPhases: [] };
      return;
    }

    // Avoid emitting due to initial `trigger()` validation; only emit once the user edits.
    if (!isDirty) return;

    // `mapFormValuesToDeletePhase` uses `{ deletePhaseEnabled: false }` as a sentinel for unmappable
    // drafts (e.g. negative numbers). Never emit that as a preview value; keep the last valid value
    // while emitting invalid meta so the timeline can reflect the error state.
    const isPreviewMappable = currentMappedValue.deletePhaseEnabled === true;
    const hasErrorsForTimeline = Object.keys(errors).length > 0 || !isPreviewMappable;

    const nextMeta: { invalidPhases: PhaseName[] } = hasErrorsForTimeline
      ? { invalidPhases: ['delete' satisfies PhaseName] }
      : { invalidPhases: [] };

    const nextValueToEmit = isPreviewMappable ? currentMappedValue : lastEmittedOutputRef.current;
    scheduleOnChangeEmit(nextValueToEmit, nextMeta);
  }, [currentMappedValue, errors, isDirty, scheduleOnChangeEmit]);

  const hasFormErrors = Object.keys(errors).length > 0;
  const isAddingDeletePhase = initialValue.deletePhaseEnabled === false;
  const isApplyDisabled = hasFormErrors || isSubmitting || (!isAddingDeletePhase && !hasChanges);
  const disabledApplyTooltip = isSubmitting
    ? editDeletePhaseFlyoutI18n.applySubmittingDisabledTooltip
    : hasFormErrors
    ? editDeletePhaseFlyoutI18n.applyDisabledTooltip
    : editDeletePhaseFlyoutI18n.applyUnchangedDisabledTooltip;
  const maximumRetentionHelpText = maximumRetentionPeriod
    ? getMaximumRetentionMessage(maximumRetentionPeriod)
    : undefined;

  const restoreDefault = useCallback(() => {
    const parsedDefault = parseInterval(defaultRetentionPeriod);
    if (!parsedDefault) return;

    methods.setValue('minAgeValue', parsedDefault.value, {
      shouldDirty: true,
      shouldValidate: true,
    });
    methods.setValue('minAgeUnit', parsedDefault.unit, { shouldDirty: true, shouldValidate: true });
    methods.setValue('isUsingDefaultRetention', true, { shouldDirty: true });
  }, [defaultRetentionPeriod, methods]);

  const removeDeletePhase = useCallback(() => {
    onSave({ deletePhaseEnabled: false });
  }, [onSave]);

  const restoreDefaultButton =
    showRestoreDefaultButton && defaultRetentionPeriod ? (
      <EuiButtonEmpty
        size="xs"
        flush="right"
        onClick={restoreDefault}
        data-test-subj={`${dataTestSubj}RestoreDefaultButton`}
      >
        {editDeletePhaseFlyoutI18n.restoreDefaultButtonLabel}
      </EuiButtonEmpty>
    ) : undefined;

  const applyButton = (
    <EuiButton
      fill
      type="submit"
      form={formId}
      isLoading={Boolean(isSaving) || isSubmitting}
      disabled={isApplyDisabled}
      data-test-subj={`${dataTestSubj}ApplyButton`}
    >
      {editDeletePhaseFlyoutI18n.applyButtonLabel}
    </EuiButton>
  );

  return (
    <EuiFlyout
      type="push"
      size="s"
      paddingSize="none"
      ownFocus={false}
      onClose={onClose}
      aria-labelledby={flyoutTitleId}
      data-test-subj={dataTestSubj}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup direction="column" gutterSize="s" responsive={false} css={headerStyles}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="s">
              <h2 id={flyoutTitleId}>{editDeletePhaseFlyoutI18n.title}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s" color="subdued">
              {editDeletePhaseFlyoutI18n.description}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <FormProvider {...methods}>
          <form
            id={formId}
            onSubmit={methods.handleSubmit((data) =>
              onSave(serializeFormValuesToDeletePhase(data))
            )}
            noValidate
          >
            <EuiPanel hasShadow={false} hasBorder={false} paddingSize="none" css={sectionStyles}>
              <DeleteAfterField
                dataTestSubj={dataTestSubj}
                labelAppend={restoreDefaultButton}
                helpText={maximumRetentionHelpText}
              />
            </EuiPanel>

            {allowRemoveDeletePhase && !maximumRetentionPeriod ? (
              <>
                <EuiHorizontalRule margin="none" />

                <EuiPanel
                  hasShadow={false}
                  hasBorder={false}
                  paddingSize="none"
                  css={sectionStyles}
                >
                  <EuiButton
                    color="danger"
                    size="s"
                    type="button"
                    data-test-subj={`${dataTestSubj}RemoveDeletePhaseButton`}
                    onClick={removeDeletePhase}
                    disabled={Boolean(isSaving) || isSubmitting}
                  >
                    {editDeletePhaseFlyoutI18n.removeDeletePhaseButtonLabel}
                  </EuiButton>
                </EuiPanel>
              </>
            ) : null}
          </form>
        </FormProvider>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup
          justifyContent="spaceBetween"
          alignItems="center"
          responsive={false}
          css={footerStyles}
        >
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              type="button"
              data-test-subj={`${dataTestSubj}CancelButton`}
              onClick={onClose}
              flush="left"
            >
              {editDeletePhaseFlyoutI18n.cancelButtonLabel}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {isApplyDisabled ? (
              <EuiToolTip content={disabledApplyTooltip}>{applyButton}</EuiToolTip>
            ) : (
              applyButton
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
