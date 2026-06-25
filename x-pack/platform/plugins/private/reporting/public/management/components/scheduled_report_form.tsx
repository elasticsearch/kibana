/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Moment } from 'moment';
import moment from 'moment';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFormLabel,
  EuiLink,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import { useKibana } from '@kbn/reporting-public';
import { REPORTING_MANAGEMENT_SCHEDULES } from '@kbn/reporting-common';
import type { FormSchema } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import {
  FIELD_TYPES,
  Form,
  getUseField,
  useForm,
  useFormData,
} from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { RecurringScheduleFormFields } from '@kbn/response-ops-recurring-schedule-form/components/recurring_schedule_form_fields';
import { Field } from '@kbn/es-ui-shared-plugin/static/forms/components';
import { Frequency } from '@kbn/rrule';
import { fieldValidators } from '@kbn/es-ui-shared-plugin/static/forms/helpers';
import { TIMEZONE_OPTIONS as UI_TIMEZONE_OPTIONS } from '@kbn/core-ui-settings-common';
import {
  convertStringToMoment,
  convertMomentToString,
} from '@kbn/response-ops-recurring-schedule-form/converters/moment';
import {
  AddMessageVariablesOptional,
  templateActionVariable,
} from '@kbn/triggers-actions-ui-plugin/public';
import type { ActionVariable } from '@kbn/alerting-types';
import { useGetUserProfileQuery } from '../hooks/use_get_user_profile_query';
import { ResponsiveFormGroup } from './responsive_form_group';
import { getScheduledReportFormSchema } from '../schemas/scheduled_report_form_schema';
import { useDefaultTimezone } from '../hooks/use_default_timezone';
import { useGetReportingHealthQuery } from '../hooks/use_get_reporting_health_query';
import type { ReportTypeData, ScheduledReport } from '../../types';
import * as i18n from '../translations';
import { SCHEDULED_REPORT_FORM_ID } from '../constants';
import { getStartDateValidator } from '../validators/start_date_validator';
import { scheduledReportMessageVariables } from '../schemas/scheduled_report_message_variables';

const { emptyField } = fieldValidators;

const FormField = getUseField({
  component: Field,
});

const TIMEZONE_OPTIONS = UI_TIMEZONE_OPTIONS.map((tz) => ({
  inputDisplay: tz,
  value: tz,
})) ?? [{ text: 'UTC', value: 'UTC' }];

export type FormData = Pick<
  ScheduledReport,
  | 'title'
  | 'reportTypeId'
  | 'startDate'
  | 'timezone'
  | 'recurring'
  | 'recurringSchedule'
  | 'sendByEmail'
  | 'emailRecipients'
  | 'emailCcRecipients'
  | 'emailBccRecipients'
  | 'emailSubject'
  | 'emailMessage'
  | 'optimizedForPrinting'
>;

export interface ScheduledReportFormProps {
  scheduledReport: Partial<ScheduledReport>;
  availableReportTypes?: ReportTypeData[];
  onClose: () => void;
  onSubmitForm?: (params: FormData) => Promise<void>;
  isSubmitLoading?: boolean;
  editMode?: boolean;
  readOnly?: boolean;
}

const CcBccFields = ({ readOnly }: { readOnly?: boolean }) => (
  <>
    <FormField
      path="emailCcRecipients"
      componentProps={{
        fullWidth: true,
        euiFieldProps: {
          compressed: true,
          fullWidth: true,
          readOnly,
          'data-test-subj': 'emailCcRecipientsCombobox',
        },
      }}
    />
    <FormField
      path="emailBccRecipients"
      componentProps={{
        fullWidth: true,
        euiFieldProps: {
          compressed: true,
          fullWidth: true,
          readOnly,
          'data-test-subj': 'emailBccRecipientsCombobox',
        },
      }}
    />
  </>
);

export const ScheduledReportForm = ({
  onSubmitForm,
  isSubmitLoading,
  scheduledReport,
  availableReportTypes,
  onClose,
  editMode,
  readOnly,
}: ScheduledReportFormProps) => {
  const {
    application: { capabilities },
    http,
    actions: { validateEmailAddresses },
    userProfile: userProfileService,
  } = useKibana().services;
  const { data: userProfile, isLoading: isUserProfileLoading } = useGetUserProfileQuery({
    userProfileService,
  });
  const {
    data: reportingHealth,
    isLoading: isReportingHealthLoading,
    isError: isReportingHealthError,
  } = useGetReportingHealthQuery({ http });

  const hasManageReportingPrivilege = useMemo(() => {
    if (!capabilities) {
      return false;
    }
    return capabilities.manageReporting.show === true;
  }, [capabilities]);
  const reportingPageLink = useMemo(
    () => (
      <EuiLink href={http.basePath.prepend(REPORTING_MANAGEMENT_SCHEDULES)}>
        {i18n.REPORTING_PAGE_LINK_TEXT}
      </EuiLink>
    ),
    [http.basePath]
  );
  const { defaultTimezone } = useDefaultTimezone();
  const hasCcBcc =
    Boolean(scheduledReport.emailCcRecipients?.length) ||
    Boolean(scheduledReport.emailBccRecipients?.length);
  const [showCcBccFields, setShowCcBccFields] = useState(hasCcBcc);
  const schema = useMemo(
    () =>
      getScheduledReportFormSchema(
        validateEmailAddresses,
        availableReportTypes
      ) as FormSchema<FormData>,
    [availableReportTypes, validateEmailAddresses]
  );
  const { form } = useForm<FormData>({
    defaultValue: scheduledReport,
    options: { stripEmptyFields: true },
    schema,
    onSubmit: onSubmitForm,
  });
  const [{ reportTypeId, startDate, timezone, sendByEmail, emailSubject, emailMessage }] =
    useFormData<FormData>({
      form,
      watch: [
        'reportTypeId',
        'startDate',
        'timezone',
        'sendByEmail',
        'emailSubject',
        'emailMessage',
      ],
    });
  const now = useMemo(() => moment().set({ second: 0, millisecond: 0 }), []);
  const defaultStartDateValue = useMemo(() => now.toISOString(), [now]);

  const emailSubjectFieldRef = useRef<HTMLInputElement | null>(null);
  const emailMessageFieldRef = useRef<HTMLTextAreaElement | null>(null);

  const onSelectMessageVariable = useCallback(
    (field: 'emailSubject' | 'emailMessage', variable: ActionVariable) => {
      const fieldRefs = {
        emailSubject: emailSubjectFieldRef,
        emailMessage: emailMessageFieldRef,
      };

      const fieldValues = {
        emailSubject,
        emailMessage,
      };

      const fieldElement = fieldRefs[field].current;
      if (!fieldElement) {
        return;
      }

      const templatedVariable = templateActionVariable(variable);
      const currentValue = fieldValues[field] ?? '';
      const selectionStart = fieldElement.selectionStart ?? 0;
      const selectionEnd = fieldElement.selectionEnd ?? 0;

      const textBeforeSelection = currentValue.substring(0, selectionStart);
      const textAfterSelection = currentValue.substring(selectionEnd);
      const newValue = `${textBeforeSelection}${templatedVariable}${textAfterSelection}`;

      form.setFieldValue(field, newValue);

      // Restore focus after React updates the DOM
      requestAnimationFrame(() => {
        const newCaretPosition = selectionStart + templatedVariable.length;
        fieldElement.selectionStart = newCaretPosition;
        fieldElement.selectionEnd = newCaretPosition;
        fieldElement.focus();
      });
    },
    [emailMessage, emailSubject, form]
  );

  // Autofill the user's email if they have one and are not a reporting manager
  useEffect(() => {
    if (
      !hasManageReportingPrivilege &&
      !isUserProfileLoading &&
      userProfile?.user.email &&
      // Even though auto-updating the recipients when editing an existing schedule would be useful
      // for non-managers that changed their profile email, it could also be disruptive
      // see https://github.com/elastic/kibana/issues/228050#issuecomment-3563309593
      !editMode &&
      !readOnly
    ) {
      form.setFieldValue('emailRecipients', [userProfile.user.email]);
      form.validate();
    }
  }, [
    form,
    editMode,
    readOnly,
    hasManageReportingPrivilege,
    isUserProfileLoading,
    userProfile?.user.email,
  ]);

  const isEmailActive = Boolean(sendByEmail);

  const onSubmit = async () => {
    try {
      if (await form.validate()) {
        await form.submit();
        onClose();
      }
    } catch (e) {
      // Keep the flyout open in case of schedule error
    }
  };

  const isLoadingDependencies = isReportingHealthLoading || isUserProfileLoading;
  const hasUnmetPrerequisites =
    !reportingHealth?.isSufficientlySecure || !reportingHealth?.hasPermanentEncryptionKey;

  return (
    <>
      <EuiFlyoutHeader hasBorder={true}>
        <EuiTitle size="s">
          <h2>{i18n.SCHEDULED_REPORT_FLYOUT_TITLE}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {isLoadingDependencies ? (
          <EuiLoadingSpinner size="l" />
        ) : isReportingHealthError ? (
          <EuiCallOut
            announceOnMount
            title={i18n.CANNOT_LOAD_REPORTING_HEALTH_TITLE}
            iconType="error"
            color="danger"
          >
            <p>{i18n.CANNOT_LOAD_REPORTING_HEALTH_MESSAGE}</p>
          </EuiCallOut>
        ) : hasUnmetPrerequisites ? (
          <EuiCallOut
            announceOnMount
            title={i18n.UNMET_REPORTING_PREREQUISITES_TITLE}
            iconType="error"
            color="danger"
          >
            <p>{i18n.UNMET_REPORTING_PREREQUISITES_MESSAGE}</p>
          </EuiCallOut>
        ) : (
          <Form form={form} id={SCHEDULED_REPORT_FORM_ID} data-test-subj="scheduleExportForm">
            <ResponsiveFormGroup
              title={<h3>{i18n.SCHEDULED_REPORT_FORM_DETAILS_SECTION_TITLE}</h3>}
            >
              <FormField
                path="title"
                componentProps={{
                  fullWidth: true,
                  euiFieldProps: {
                    compressed: true,
                    fullWidth: true,
                    append: i18n.SCHEDULED_REPORT_FORM_FILE_NAME_SUFFIX,
                    readOnly,
                    'data-test-subj': 'reportTitleInput',
                  },
                }}
              />
              <FormField
                path="reportTypeId"
                componentProps={{
                  fullWidth: true,
                  euiFieldProps: {
                    compressed: true,
                    fullWidth: true,
                    options:
                      availableReportTypes?.map((f) => ({ inputDisplay: f.label, value: f.id })) ??
                      [],
                    readOnly: editMode || readOnly,
                    'data-test-subj': 'reportTypeIdSelect',
                  },
                }}
              />
              {reportTypeId === 'printablePdfV2' && (
                <FormField
                  path="optimizedForPrinting"
                  config={{
                    type: FIELD_TYPES.TOGGLE,
                    label: i18n.SCHEDULED_REPORT_FORM_OPTIMIZED_FOR_PRINTING_LABEL,
                  }}
                  componentProps={{
                    helpText: i18n.SCHEDULED_REPORT_FORM_OPTIMIZED_FOR_PRINTING_DESCRIPTION,
                    euiFieldProps: {
                      compressed: true,
                      readOnly: editMode || readOnly,
                    },
                  }}
                />
              )}
            </ResponsiveFormGroup>
            <ResponsiveFormGroup
              title={<h3>{i18n.SCHEDULED_REPORT_FORM_SCHEDULE_SECTION_TITLE}</h3>}
            >
              <FormField<string, FormData, Moment>
                path="startDate"
                config={{
                  type: FIELD_TYPES.DATE_PICKER,
                  label: i18n.SCHEDULED_REPORT_FORM_START_DATE_LABEL,
                  defaultValue: defaultStartDateValue,
                  serializer: convertMomentToString,
                  deserializer: convertStringToMoment,
                  validations: [
                    {
                      validator: emptyField(i18n.SCHEDULED_REPORT_FORM_START_DATE_REQUIRED_MESSAGE),
                    },
                    {
                      validator: getStartDateValidator(now, timezone ?? defaultTimezone, startDate),
                    },
                  ],
                }}
                componentProps={{
                  fullWidth: true,
                  euiFieldProps: {
                    compressed: true,
                    fullWidth: true,
                    showTimeSelect: true,
                    readOnly,
                    'data-test-subj': 'startDatePicker',
                  },
                }}
              />
              <FormField
                path="timezone"
                config={{
                  type: FIELD_TYPES.SUPER_SELECT,
                  defaultValue: defaultTimezone,
                  validations: [
                    {
                      validator: emptyField(i18n.SCHEDULED_REPORT_FORM_START_DATE_REQUIRED_MESSAGE),
                    },
                  ],
                }}
                componentProps={{
                  id: 'timezone',
                  fullWidth: true,
                  euiFieldProps: {
                    compressed: true,
                    fullWidth: true,
                    options: TIMEZONE_OPTIONS,
                    readOnly,
                    'data-test-subj': 'timezoneCombobox',
                    prepend: (
                      <EuiFormLabel htmlFor="timezone">
                        {i18n.SCHEDULED_REPORT_FORM_TIMEZONE_LABEL}
                      </EuiFormLabel>
                    ),
                    'aria-label': `${i18n.SCHEDULED_REPORT_FORM_TIMEZONE_LABEL} ${timezone}`,
                  },
                }}
              />
              <EuiSpacer size="m" />
              <RecurringScheduleFormFields
                startDate={startDate}
                timezone={timezone ? [timezone] : [defaultTimezone]}
                hideTimezone
                supportsEndOptions={false}
                minFrequency={Frequency.MONTHLY}
                showTimeInSummary
                compressed
                readOnly={readOnly}
                initialRecurringSchedule={scheduledReport.recurringSchedule}
              />
            </ResponsiveFormGroup>
            <ResponsiveFormGroup
              title={<h3>{i18n.SCHEDULED_REPORT_FORM_EXPORTS_SECTION_TITLE}</h3>}
              description={
                !editMode && (
                  <p>
                    {i18n.SCHEDULED_REPORT_FORM_EXPORTS_SECTION_DESCRIPTION} {reportingPageLink}.
                  </p>
                )
              }
            >
              <FormField
                path="sendByEmail"
                componentProps={{
                  helpText:
                    !hasManageReportingPrivilege && !userProfile?.user.email
                      ? i18n.SCHEDULED_REPORT_FORM_NO_USER_EMAIL_HINT
                      : undefined,
                  euiFieldProps: {
                    compressed: true,
                    'data-test-subj': 'sendByEmailToggle',
                    disabled:
                      readOnly ||
                      !reportingHealth.areNotificationsEnabled ||
                      (!hasManageReportingPrivilege && !userProfile?.user.email),
                  },
                }}
              />
              {reportingHealth.areNotificationsEnabled ? (
                isEmailActive && (
                  <>
                    <EuiSpacer size="m" />
                    <FormField
                      path="emailRecipients"
                      componentProps={{
                        fullWidth: true,
                        helpText: hasManageReportingPrivilege
                          ? i18n.SCHEDULED_REPORT_FORM_EMAIL_RECIPIENTS_HINT
                          : i18n.SCHEDULED_REPORT_FORM_EMAIL_SELF_HINT,
                        labelAppend: hasManageReportingPrivilege && (
                          <EuiButtonEmpty
                            size="xs"
                            data-test-subj="showCcBccButton"
                            onClick={() => {
                              setShowCcBccFields((old) => !old);
                            }}
                          >
                            {i18n.SCHEDULED_REPORT_FORM_EMAIL_SHOW_CC_BCC_LABEL}
                          </EuiButtonEmpty>
                        ),
                        euiFieldProps: {
                          compressed: true,
                          fullWidth: true,
                          isDisabled: !hasManageReportingPrivilege,
                          'data-test-subj': 'emailRecipientsCombobox',
                          readOnly,
                        },
                      }}
                    />
                    {hasManageReportingPrivilege && showCcBccFields && (
                      <CcBccFields readOnly={readOnly} />
                    )}

                    <FormField
                      path="emailSubject"
                      componentProps={{
                        labelAppend: (
                          <AddMessageVariablesOptional
                            isOptionalField
                            messageVariables={scheduledReportMessageVariables}
                            onSelectEventHandler={(variable) =>
                              onSelectMessageVariable('emailSubject', variable)
                            }
                            paramsProperty="emailSubject"
                          />
                        ),
                        euiFieldProps: {
                          inputRef: emailSubjectFieldRef,
                          compressed: true,
                          fullWidth: true,
                          disabled: readOnly,
                          'data-test-subj': 'emailSubjectInput',
                        },
                      }}
                    />

                    <FormField
                      path="emailMessage"
                      componentProps={{
                        labelAppend: (
                          <AddMessageVariablesOptional
                            isOptionalField
                            messageVariables={scheduledReportMessageVariables}
                            onSelectEventHandler={(variable) =>
                              onSelectMessageVariable('emailMessage', variable)
                            }
                            paramsProperty="emailMessage"
                          />
                        ),
                        helpText: i18n.SCHEDULED_REPORT_FORM_EMAIL_MESSAGE_HINT,
                        euiFieldProps: {
                          inputRef: emailMessageFieldRef,
                          compressed: true,
                          fullWidth: true,
                          disabled: readOnly,
                          'data-test-subj': 'emailMessageTextArea',
                          rows: 4,
                        },
                      }}
                    />

                    <EuiSpacer size="m" />

                    <EuiCallOut
                      announceOnMount
                      title={i18n.SCHEDULED_REPORT_FORM_EMAIL_SENSITIVE_INFO_TITLE}
                      iconType="info"
                      size="s"
                    >
                      <p>{i18n.SCHEDULED_REPORT_FORM_EMAIL_SENSITIVE_INFO_MESSAGE}</p>
                    </EuiCallOut>
                  </>
                )
              ) : (
                <>
                  <EuiSpacer size="m" />
                  <EuiCallOut
                    announceOnMount
                    title={i18n.SCHEDULED_REPORT_FORM_MISSING_EMAIL_CONNECTOR_TITLE}
                    iconType="info"
                    size="s"
                    color="warning"
                  >
                    <p>{i18n.SCHEDULED_REPORT_FORM_MISSING_EMAIL_CONNECTOR_MESSAGE}</p>
                  </EuiCallOut>
                </>
              )}
            </ResponsiveFormGroup>
          </Form>
        )}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              data-test-subj="scheduleExportCancelButton"
              onClick={onClose}
              flush="left"
              aria-label={i18n.SCHEDULED_REPORT_FLYOUT_CANCEL_BUTTON_LABEL}
            >
              {i18n.SCHEDULED_REPORT_FLYOUT_CANCEL_BUTTON_LABEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              type="submit"
              form={SCHEDULED_REPORT_FORM_ID}
              data-test-subj="scheduleExportSubmitButton"
              isDisabled={isReportingHealthLoading || isUserProfileLoading || readOnly}
              onClick={onSubmit}
              isLoading={isSubmitLoading}
              fill
            >
              {i18n.SCHEDULED_REPORT_FLYOUT_SUBMIT_BUTTON_LABEL}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </>
  );
};
