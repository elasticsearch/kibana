/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useState, useCallback } from 'react';

import type { estypes } from '@elastic/elasticsearch';
import type { EuiSwitchEvent, EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiButton,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiSwitch,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import { MlAppHeader } from '../../../../components/ml_app_header';
import { usePermissionCheck } from '../../../../capabilities/check_capabilities';
import { useCreateAndNavigateToManagementMlLink } from '../../../../contexts/kibana/use_create_url';
import { DstEventGenerator } from './dst_event_generator';
import { EventsTable } from '../events_table';

const EditHeader: FC<{ calendarId: string; description: string }> = ({
  calendarId,
  description,
}) => {
  return (
    <>
      <div data-test-subj="mlCalendarTitle">
        <MlAppHeader
          title={i18n.translate('xpack.ml.calendarsEdit.calendarForm.calendarTitle', {
            defaultMessage: 'Calendar {calendarId}',
            values: { calendarId },
          })}
        />
      </div>
      {description ? (
        <>
          <EuiText data-test-subj={'mlCalendarDescriptionText'}>
            <p>{description}</p>
          </EuiText>
          <EuiSpacer size="l" />
        </>
      ) : null}
    </>
  );
};

interface Props {
  calendarId: string;
  description: string;
  eventsList: estypes.MlCalendarEvent[];
  groupIdOptions: EuiComboBoxOptionOption[];
  isEdit: boolean;
  isNewCalendarIdValid: boolean;
  jobIdOptions: EuiComboBoxOptionOption[];
  onCalendarIdChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreate: () => void;
  onCreateGroupOption: (searchValue: string, flattenedOptions: EuiComboBoxOptionOption[]) => void;
  onDescriptionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEdit: () => void;
  onEventDelete: (eventId: string) => void;
  onGroupSelection: (selectedOptions: any) => void;
  showImportModal: () => void;
  onJobSelection: (selectedOptions: any) => void;
  saving: boolean;
  loading: boolean;
  selectedGroupOptions: EuiComboBoxOptionOption[];
  selectedJobOptions: EuiComboBoxOptionOption[];
  showNewEventModal: () => void;
  isGlobalCalendar: boolean;
  onGlobalCalendarChange: (e: EuiSwitchEvent) => void;
  addEvents: (events: estypes.MlCalendarEvent[]) => void;
  clearEvents: () => void;
  isDst: boolean;
}

export const CalendarForm: FC<Props> = ({
  calendarId,
  description,
  eventsList,
  groupIdOptions,
  isEdit,
  isNewCalendarIdValid,
  jobIdOptions,
  onCalendarIdChange,
  onCreate,
  onCreateGroupOption,
  onDescriptionChange,
  onEdit,
  onEventDelete,
  onGroupSelection,
  showImportModal,
  onJobSelection,
  saving,
  loading,
  selectedGroupOptions,
  selectedJobOptions,
  showNewEventModal,
  isGlobalCalendar,
  onGlobalCalendarChange,
  addEvents,
  clearEvents,
  isDst,
}) => {
  const [canCreateCalendar] = usePermissionCheck(['canCreateCalendar']);
  const [timezone, setTimezone] = useState<string | undefined>(undefined);
  const msg = i18n.translate('xpack.ml.calendarsEdit.calendarForm.allowedCharactersDescription', {
    defaultMessage:
      'Use lowercase alphanumerics (a-z and 0-9), hyphens or underscores; ' +
      'must start and end with an alphanumeric character',
  });
  const helpText = isNewCalendarIdValid === true && !isEdit ? msg : undefined;
  const error = isNewCalendarIdValid === false && !isEdit ? [msg] : undefined;
  const saveButtonDisabled =
    canCreateCalendar === false ||
    saving ||
    !isNewCalendarIdValid ||
    calendarId === '' ||
    loading === true ||
    (isDst && eventsList.length === 0);
  const redirectToCalendarsManagementPage = useCreateAndNavigateToManagementMlLink(
    isDst ? ML_PAGES.CALENDARS_DST_MANAGE : ML_PAGES.CALENDARS_MANAGE,
    'ad_settings'
  );

  const addDstEvents = useCallback(
    (events: estypes.MlCalendarEvent[]) => {
      clearEvents();
      addEvents(events);
    },
    [addEvents, clearEvents]
  );

  return (
    <EuiForm data-test-subj={`mlCalendarForm${isEdit === true ? 'Edit' : 'New'}`}>
      {isEdit === true ? (
        <EditHeader calendarId={calendarId} description={description} />
      ) : (
        <>
          <MlAppHeader
            title={
              isDst
                ? i18n.translate('xpack.ml.calendarsEdit.calendarForm.createCalendarDstTitle', {
                    defaultMessage: 'Create new DST calendar',
                  })
                : i18n.translate('xpack.ml.calendarsEdit.calendarForm.createCalendarTitle', {
                    defaultMessage: 'Create new calendar',
                  })
            }
          />
          <EuiFormRow
            label={
              <FormattedMessage
                id="xpack.ml.calendarsEdit.calendarForm.calendarIdLabel"
                defaultMessage="Calendar ID"
              />
            }
            helpText={helpText}
            error={error}
            isInvalid={!isNewCalendarIdValid}
          >
            <EuiFieldText
              isInvalid={!isNewCalendarIdValid}
              name="calendarId"
              value={calendarId}
              onChange={onCalendarIdChange}
              disabled={saving === true || loading === true}
              data-test-subj="mlCalendarIdInput"
            />
          </EuiFormRow>

          {isDst === false ? (
            <EuiFormRow
              label={
                <FormattedMessage
                  id="xpack.ml.calendarsEdit.calendarForm.descriptionLabel"
                  defaultMessage="Description"
                />
              }
            >
              <EuiFieldText
                name="description"
                value={description}
                onChange={onDescriptionChange}
                disabled={saving === true || loading === true}
                data-test-subj="mlCalendarDescriptionInput"
              />
            </EuiFormRow>
          ) : null}

          <EuiSpacer size="m" />
        </>
      )}

      {isDst === false ? (
        <EuiSwitch
          name="switch"
          label={
            <FormattedMessage
              id="xpack.ml.calendarsEdit.calendarForm.allJobsLabel"
              defaultMessage="Apply calendar to all jobs"
            />
          }
          checked={isGlobalCalendar}
          onChange={onGlobalCalendarChange}
          disabled={saving === true || canCreateCalendar === false || loading === true}
          data-test-subj="mlCalendarApplyToAllJobsSwitch"
        />
      ) : null}

      {isGlobalCalendar === false ? (
        <>
          <EuiSpacer size="m" />

          <EuiFormRow
            label={
              <FormattedMessage
                id="xpack.ml.calendarsEdit.calendarForm.jobsLabel"
                defaultMessage="Jobs"
              />
            }
          >
            <EuiComboBox
              options={jobIdOptions}
              selectedOptions={selectedJobOptions}
              onChange={onJobSelection}
              isDisabled={saving === true || canCreateCalendar === false || loading === true}
              data-test-subj="mlCalendarJobSelection"
            />
          </EuiFormRow>

          <EuiFormRow
            label={
              <FormattedMessage
                id="xpack.ml.calendarsEdit.calendarForm.groupsLabel"
                defaultMessage="Groups"
              />
            }
          >
            <EuiComboBox
              onCreateOption={onCreateGroupOption}
              options={groupIdOptions}
              selectedOptions={selectedGroupOptions}
              onChange={onGroupSelection}
              isDisabled={saving === true || canCreateCalendar === false || loading === true}
              data-test-subj="mlCalendarJobGroupSelection"
            />
          </EuiFormRow>
        </>
      ) : null}

      <EuiSpacer size="xl" />

      <EuiFormRow
        label={
          isDst ? (
            <FormattedMessage
              id="xpack.ml.calendarsEdit.calendarForm.dstEventsLabel"
              defaultMessage="Time zone of data"
            />
          ) : (
            <FormattedMessage
              id="xpack.ml.calendarsEdit.calendarForm.eventsLabel"
              defaultMessage="Events"
            />
          )
        }
        fullWidth
      >
        <>
          {isDst ? (
            <DstEventGenerator
              addEvents={addDstEvents}
              setTimezone={setTimezone}
              isDisabled={saving === true || canCreateCalendar === false || loading === true}
            />
          ) : null}
          <EventsTable
            eventsList={eventsList}
            onDeleteClick={onEventDelete}
            showImportModal={showImportModal}
            showNewEventModal={showNewEventModal}
            loading={loading}
            saving={saving}
            showSearchBar={isDst === false}
            timezone={timezone}
            isDst={isDst}
          />
        </>
      </EuiFormRow>
      <EuiSpacer size="l" />
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiButton isDisabled={saving} onClick={redirectToCalendarsManagementPage}>
            <FormattedMessage
              id="xpack.ml.calendarsEdit.calendarForm.cancelButtonLabel"
              defaultMessage="Cancel"
            />
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            data-test-subj="mlSaveCalendarButton"
            fill
            onClick={isEdit ? onEdit : onCreate}
            isDisabled={saveButtonDisabled}
          >
            {saving ? (
              <FormattedMessage
                id="xpack.ml.calendarsEdit.calendarForm.savingButtonLabel"
                defaultMessage="Saving…"
              />
            ) : (
              <FormattedMessage
                id="xpack.ml.calendarsEdit.calendarForm.saveButtonLabel"
                defaultMessage="Save"
              />
            )}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiForm>
  );
};
