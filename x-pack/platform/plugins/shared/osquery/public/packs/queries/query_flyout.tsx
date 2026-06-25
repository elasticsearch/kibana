/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlyout,
  EuiTitle,
  EuiSpacer,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiFlyoutFooter,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiButton,
  EuiText,
} from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { FormProvider } from 'react-hook-form';

import { DEFAULT_PLATFORM, QUERY_TIMEOUT } from '../../../common/constants';
import { ExperimentalFeaturesService } from '../../common/experimental_features_service';
import {
  QueryIdField,
  IntervalField,
  VersionField,
  ResultsTypeField,
  TimeoutField,
} from '../../form';
import { ScheduleSection } from '../../components/schedule_section';
import { ToggleableRow } from '../../components/schedule_section/toggleable_row';
import { validateScheduleFormData } from '../../components/schedule_section/validation';
import {
  QUERY_OVERRIDE_SCHEDULE_TOGGLE_DESCRIPTION,
  QUERY_OVERRIDE_SCHEDULE_TOGGLE_LABEL,
  QUERY_USING_PACK_SCHEDULE_LABEL,
  SCHEDULE_ERRORS_TOAST_TITLE,
  TIMEOUT_RRULE_INHERIT_HELP,
} from '../../components/schedule_section/translations';
import { CodeEditorField } from '../../saved_queries/form/code_editor_field';
import { PlatformCheckBoxGroupField } from './platform_checkbox_group_field';
import { ALL_OSQUERY_VERSIONS_OPTIONS } from './constants';
import type {
  UsePackQueryFormProps,
  PackQueryFormData,
  PackSOQueryFormData,
} from './use_pack_query_form';
import { usePackQueryForm } from './use_pack_query_form';
import { deserializeSchedule } from '../form/schedule_serializer';
import { SavedQueriesDropdown } from '../../saved_queries/saved_queries_dropdown';
import { ECSMappingEditorField } from './lazy_ecs_mapping_editor_field';
import { useKibana } from '../../common/lib/kibana';
import { overflowCss } from '../utils';

interface QueryFlyoutProps {
  uniqueQueryIds: string[];
  defaultValue?: UsePackQueryFormProps['defaultValue'] | undefined;
  onSave: (payload: PackSOQueryFormData) => void;
  onClose: () => void;
  packSchedule?: UsePackQueryFormProps['packSchedule'];
}

const QueryFlyoutComponent: React.FC<QueryFlyoutProps> = ({
  uniqueQueryIds,
  defaultValue,
  onSave,
  onClose,
  packSchedule,
}) => {
  const {
    application: {
      capabilities: { osquery: permissions },
    },
    notifications: { toasts },
  } = useKibana().services;
  const [isEditMode] = useState(!!defaultValue);
  const isRruleSchedulingEnabled = ExperimentalFeaturesService.get().rruleScheduling;
  const { serializer, idSet, ...hooksForm } = usePackQueryForm({
    uniqueQueryIds,
    defaultValue,
    packSchedule,
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    resetField,
    watch,
    setValue,
  } = hooksForm;

  const overridePackSchedule = watch('override_pack_schedule');
  const schedule = watch('schedule');

  const originalStartDate = useMemo(() => {
    if (!isRruleSchedulingEnabled) {
      return undefined;
    }

    const hasOverride = !!defaultValue?.schedule_type;

    return deserializeSchedule(
      hasOverride
        ? {
            schedule_type: defaultValue?.schedule_type,
            rrule_schedule: defaultValue?.rrule_schedule,
          }
        : {
            schedule_type: packSchedule?.schedule_type,
            interval: packSchedule?.interval,
            rrule_schedule: packSchedule?.rrule_schedule,
          }
    ).startDate;
  }, [isRruleSchedulingEnabled, defaultValue, packSchedule]);

  // Single source of truth for the override schedule. Only an
  // active override has a schedule to validate — an inherited query defers to
  // the pack. Empty when the flag is off (schedule is undefined).
  const scheduleErrors = useMemo(
    () =>
      isRruleSchedulingEnabled && overridePackSchedule && schedule
        ? validateScheduleFormData(schedule, { originalStartDate })
        : [],
    [isRruleSchedulingEnabled, overridePackSchedule, schedule, originalStartDate]
  );

  const incomingPackMode = packSchedule?.schedule_type;
  const seededPackModeRef = useRef(incomingPackMode);
  useEffect(() => {
    if (!isRruleSchedulingEnabled || overridePackSchedule) {
      seededPackModeRef.current = incomingPackMode;

      return;
    }

    if (seededPackModeRef.current === incomingPackMode) {
      return;
    }

    seededPackModeRef.current = incomingPackMode;
    setValue(
      'schedule',
      deserializeSchedule({
        schedule_type: packSchedule?.schedule_type,
        interval: packSchedule?.interval,
        rrule_schedule: packSchedule?.rrule_schedule,
      }),
      { shouldDirty: false }
    );
  }, [
    isRruleSchedulingEnabled,
    overridePackSchedule,
    incomingPackMode,
    packSchedule?.schedule_type,
    packSchedule?.interval,
    packSchedule?.rrule_schedule,
    setValue,
  ]);

  // The serializer strips `timeout` from the wire for any rrule-mode query
  // (beats reads `rrule_schedule.timeout`), so the control must be disabled for
  // ALL rrule queries — inherited and override alike — never just inherited.
  // Derive from the resolved mode rather than the override flag.
  const resolvedScheduleType = overridePackSchedule
    ? schedule?.scheduleType
    : packSchedule?.schedule_type;
  const isTimeoutDisabledForRrule = isRruleSchedulingEnabled && resolvedScheduleType === 'rrule';
  const timeoutFieldProps = useMemo(
    () =>
      isTimeoutDisabledForRrule
        ? { isDisabled: true, title: TIMEOUT_RRULE_INHERIT_HELP }
        : undefined,
    [isTimeoutDisabledForRrule]
  );

  const handleToggleOverride = useCallback(
    (next: boolean) => {
      setValue('override_pack_schedule', next, { shouldDirty: true });
    },
    [setValue]
  );

  const handleScheduleChange = useCallback(
    (next: NonNullable<PackQueryFormData['schedule']>) => {
      setValue('schedule', next, { shouldDirty: true });
    },
    [setValue]
  );
  const onSubmit = useCallback(
    async (payload: PackQueryFormData) => {
      // Final guard: the controlled schedule object doesn't register
      // with RHF, so re-validate here and abort on error.
      if (payload.override_pack_schedule && payload.schedule) {
        const errors = validateScheduleFormData(payload.schedule, { originalStartDate });
        if (errors.length > 0) {
          return;
        }
      }

      const serializedData: PackSOQueryFormData = serializer(payload);
      await onSave(serializedData);
      onClose();
    },
    [serializer, onSave, onClose, originalStartDate]
  );

  const handleSaveClick = useCallback(() => {
    // When the override schedule is invalid,
    // surface the cause as a danger toast and do NOT save. The inline field
    // errors stay visible (ScheduleSection `showErrors`) for in-place context.
    if (scheduleErrors.length > 0) {
      toasts.addDanger({
        title: SCHEDULE_ERRORS_TOAST_TITLE,
        text: scheduleErrors.join('\n'),
      });

      return;
    }

    return handleSubmit(onSubmit)();
  }, [scheduleErrors, toasts, handleSubmit, onSubmit]);

  const handleSetQueryValue = useCallback(
    (savedQuery: any) => {
      if (savedQuery) {
        resetField('id', { defaultValue: savedQuery.id });
        resetField('query', { defaultValue: savedQuery.query });
        resetField('platform', {
          defaultValue: savedQuery.platform ? savedQuery.platform : DEFAULT_PLATFORM,
        });
        resetField('version', { defaultValue: savedQuery.version ? [savedQuery.version] : [] });
        resetField('interval', { defaultValue: savedQuery.interval ? savedQuery.interval : 3600 });
        resetField('timeout', {
          defaultValue: savedQuery.timeout ? savedQuery.timeout : QUERY_TIMEOUT.DEFAULT,
        });
        resetField('snapshot', { defaultValue: savedQuery.snapshot ?? true });
        resetField('removed', { defaultValue: savedQuery.removed });
        resetField('ecs_mapping', { defaultValue: savedQuery.ecs_mapping ?? {} });
      }
    },
    [resetField]
  );

  return (
    <EuiFlyout
      size="m"
      onClose={onClose}
      aria-labelledby="flyoutTitle"
      ownFocus={true}
      outsideClickCloses={false}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="s">
          <h2 id="flyoutTitle">
            {isEditMode ? (
              <FormattedMessage
                id="xpack.osquery.queryFlyoutForm.editFormTitle"
                defaultMessage="Edit query"
              />
            ) : (
              <FormattedMessage
                id="xpack.osquery.queryFlyoutForm.addFormTitle"
                defaultMessage="Attach next query"
              />
            )}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <FormProvider {...hooksForm}>
          {!isEditMode && permissions.readSavedQueries ? (
            <>
              <SavedQueriesDropdown onChange={handleSetQueryValue} />
              <EuiSpacer />
            </>
          ) : null}
          <QueryIdField idSet={idSet} />
          <EuiSpacer />
          <CodeEditorField />
          <EuiSpacer />
          {isRruleSchedulingEnabled ? (
            <>
              <EuiFlexGroup>
                <EuiFlexItem>
                  <ToggleableRow
                    title={QUERY_OVERRIDE_SCHEDULE_TOGGLE_LABEL}
                    description={QUERY_OVERRIDE_SCHEDULE_TOGGLE_DESCRIPTION}
                    enabled={!!overridePackSchedule}
                    onToggle={handleToggleOverride}
                    dataTestSubj="osquery-query-override-pack-schedule"
                  >
                    {schedule ? (
                      <ScheduleSection
                        value={schedule}
                        onChange={handleScheduleChange}
                        lockedScheduleType={packSchedule?.schedule_type}
                        title={null}
                        showErrors={scheduleErrors.length > 0}
                        disabled={!overridePackSchedule}
                      />
                    ) : null}
                  </ToggleableRow>
                  {!overridePackSchedule && packSchedule?.schedule_type ? (
                    <EuiText size="xs" color="subdued" data-test-subj="osquery-using-pack-schedule">
                      {QUERY_USING_PACK_SCHEDULE_LABEL}
                    </EuiText>
                  ) : null}
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer />
            </>
          ) : null}
          <EuiFlexGroup>
            <EuiFlexItem>
              {!isRruleSchedulingEnabled ? (
                <>
                  <IntervalField
                    // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
                    euiFieldProps={{ append: 's' }}
                  />
                  <EuiSpacer />
                </>
              ) : null}
              <VersionField
                // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
                euiFieldProps={{
                  noSuggestions: false,
                  singleSelection: { asPlainText: true },
                  placeholder: i18n.translate('xpack.osquery.queriesTable.osqueryVersionAllLabel', {
                    defaultMessage: 'ALL',
                  }),
                  options: ALL_OSQUERY_VERSIONS_OPTIONS,
                  onCreateOption: undefined,
                }}
              />
              <EuiSpacer />
              <ResultsTypeField />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFlexGroup direction={'column'} justifyContent={'spaceBetween'}>
                <EuiFlexItem>
                  <PlatformCheckBoxGroupField />
                </EuiFlexItem>
                <EuiFlexItem grow={0}>
                  <TimeoutField euiFieldProps={timeoutFieldProps} />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer />
          <EuiFlexGroup>
            <EuiFlexItem css={overflowCss}>
              <ECSMappingEditorField />
            </EuiFlexItem>
          </EuiFlexGroup>
        </FormProvider>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              data-test-subj="query-flyout-cancel-button"
              iconType="cross"
              onClick={onClose}
              flush="left"
            >
              <FormattedMessage
                id="xpack.osquery.queryFlyoutForm.cancelButtonLabel"
                defaultMessage="Cancel"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="query-flyout-save-button"
              isLoading={isSubmitting}
              onClick={handleSaveClick}
              fill
            >
              <FormattedMessage
                id="xpack.osquery.queryFlyoutForm.saveButtonLabel"
                defaultMessage="Save"
              />
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

export const QueryFlyout = React.memo(QueryFlyoutComponent);
