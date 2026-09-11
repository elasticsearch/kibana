/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { applicationServiceMock, httpServiceMock } from '@kbn/core/public/mocks';
import { useKibana } from '@kbn/reporting-public';
import { mockScheduledReports } from '../../../common/test/fixtures';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import type { ScheduledReportFormProps } from './scheduled_report_form';
import { ScheduledReportForm } from './scheduled_report_form';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { getReportingHealth } from '../apis/get_reporting_health';
import { useGetUserProfileQuery } from '../hooks/use_get_user_profile_query';
import { useUiSetting } from '@kbn/kibana-react-plugin/public';
import userEvent from '@testing-library/user-event';
import moment from 'moment';
import * as i18n from '../translations';
import { transformScheduledReport } from '../utils';

jest.mock('@kbn/kibana-react-plugin/public');
jest.mock('@kbn/reporting-public', () => ({
  useKibana: jest.fn(),
  ReportingAPIClient: jest.fn(),
}));

jest.mock('../hooks/use_get_user_profile_query');
jest.mock('../apis/get_reporting_health');

const mockValidateEmailAddresses = jest.fn().mockReturnValue([]);
const mockReportingHealth = jest.mocked(getReportingHealth);
const mockGetUserProfileQuery = jest.mocked(useGetUserProfileQuery);
const mockedUseUiSetting = jest.mocked(useUiSetting);

describe('ScheduledReportForm', () => {
  const onSubmitForm = jest.fn();
  const onClose = jest.fn();
  const application = applicationServiceMock.createStartContract();
  const http = httpServiceMock.createSetupContract();
  const mockKibanaServices = {
    application: {
      capabilities: { ...application.capabilities, manageReporting: { show: true } },
    },
    http,
    userProfile: userProfileServiceMock.createStart(),
    actions: {
      validateEmailAddresses: mockValidateEmailAddresses,
    },
  };
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
      },
    },
  });

  const defaultProps: Pick<
    ScheduledReportFormProps,
    'scheduledReport' | 'availableReportTypes' | 'onClose' | 'onSubmitForm'
  > = {
    scheduledReport: transformScheduledReport(mockScheduledReports[0]),
    availableReportTypes: [],
    onClose,
    onSubmitForm,
  };

  const renderWithProviders = (childComponent: React.ReactElement) => {
    return render(
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>{childComponent}</QueryClientProvider>
      </IntlProvider>
    );
  };
  let user: ReturnType<typeof userEvent.setup>;
  const today = new Date('2025-11-10T12:00:00.000Z');

  const mockUiSettings = (settings: Record<string, string>) => {
    mockedUseUiSetting.mockImplementation((key) => settings[key as string]);
  };

  beforeAll(() => {
    moment.tz.setDefault('UTC');
    window.scrollTo = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    mockUiSettings({
      'dateFormat:tz': 'UTC',
      dateFormat: 'MMM D, YYYY @ HH:mm:ss.SSS zz',
    });
    (useKibana as jest.Mock).mockReturnValue({
      services: mockKibanaServices,
    });
    mockReportingHealth.mockResolvedValue({
      isSufficientlySecure: true,
      hasPermanentEncryptionKey: true,
      areNotificationsEnabled: true,
    });
    mockGetUserProfileQuery.mockReturnValue({
      data: {
        user: {
          email: 'test@example.com',
          username: 'testuser',
          full_name: 'Test User',
        },
        uid: '123',
      },
      isLoading: false,
    } as any);
    jest.spyOn(Date, 'now').mockReturnValue(today.getTime());
  });

  afterEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    moment.tz.setDefault('Browser');
  });

  it('renders correctly', async () => {
    renderWithProviders(<ScheduledReportForm {...defaultProps} />);

    expect(await screen.findByTestId('scheduleExportForm')).toBeInTheDocument();
    expect(screen.getByText(i18n.SCHEDULED_REPORT_FORM_DETAILS_SECTION_TITLE)).toBeInTheDocument();
    expect(screen.getByTestId('scheduleExportSubmitButton')).toBeInTheDocument();
  });

  it('displays the start date using the dateFormat ui setting without seconds or timezone', async () => {
    renderWithProviders(
      <ScheduledReportForm
        {...defaultProps}
        scheduledReport={{
          ...defaultProps.scheduledReport,
          startDate: '2025-11-10T12:00:00.000Z',
        }}
      />
    );

    expect(await screen.findByTestId('startDatePicker-input')).toHaveValue('Nov 10, 2025 @ 12:00');
  });

  it('appends a default time format when the dateFormat ui setting is date-only', async () => {
    mockUiSettings({
      'dateFormat:tz': 'UTC',
      dateFormat: 'MMM D, YYYY',
    });

    renderWithProviders(
      <ScheduledReportForm
        {...defaultProps}
        scheduledReport={{
          ...defaultProps.scheduledReport,
          startDate: '2025-11-10T12:00:00.000Z',
        }}
      />
    );

    expect(await screen.findByTestId('startDatePicker-input')).toHaveValue('Nov 10, 2025 @ 12:00');
  });

  it('does not shift the displayed or submitted start date by the dateFormat:tz timezone', async () => {
    moment.tz.setDefault('America/New_York');
    user = userEvent.setup({ delay: null });
    mockUiSettings({
      'dateFormat:tz': 'America/New_York',
      dateFormat: 'MMM D, YYYY @ HH:mm',
    });

    renderWithProviders(
      <ScheduledReportForm
        {...defaultProps}
        availableReportTypes={[{ label: 'PDF', id: 'printablePdfV2' }]}
        scheduledReport={{
          ...defaultProps.scheduledReport,
          startDate: '2025-11-10T12:00:00.000Z',
        }}
      />
    );

    expect(await screen.findByTestId('startDatePicker-input')).toHaveValue('Nov 10, 2025 @ 07:00');

    await user.click(await screen.findByTestId('scheduleExportSubmitButton'));

    await waitFor(() => {
      expect(onSubmitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: 'UTC', // Kibana timezone setting is America/New_York, but the date picker defined for the scheduled report is UTC
          startDate: '2025-11-10T12:00:00.000Z',
        }),
        true
      );
    });
    moment.tz.setDefault('UTC');
  });

  it('calls onSubmit correctly', async () => {
    user = userEvent.setup({ delay: null });
    renderWithProviders(
      <ScheduledReportForm
        {...defaultProps}
        availableReportTypes={[{ label: 'PDF', id: 'printablePdfV2' }]}
      />
    );

    const submitButton = await screen.findByTestId('scheduleExportSubmitButton');

    await user.click(submitButton);

    await waitFor(() => {
      expect(onSubmitForm).toHaveBeenCalledWith(
        {
          recurringSchedule: {
            frequency: 2,
          },
          reportTypeId: 'printablePdfV2',
          sendByEmail: false,
          startDate: '2025-11-10T12:00:00.000Z',
          timezone: 'UTC',
          title: 'Scheduled report 1',
        },
        true
      );
    });
  });

  describe('when user is not reporting manager', () => {
    it('should disable the email to field, autofill it with user email and hide cc and bcc fields', async () => {
      user = userEvent.setup({ delay: null });
      (useKibana as jest.Mock).mockReturnValue({
        services: {
          ...mockKibanaServices,
          application: {
            capabilities: { ...application.capabilities, manageReporting: { show: false } },
          },
        },
      });

      renderWithProviders(<ScheduledReportForm {...defaultProps} />);

      const toggle = await screen.findByText('Send by email');
      await user.click(toggle);

      const emailField = await screen.findByTestId('emailRecipientsCombobox');
      const emailInput = within(emailField).getByTestId('comboBoxSearchInput');
      expect(emailInput).toBeDisabled();
      expect(emailField).toHaveTextContent('test@example.com');
      expect(screen.queryByTestId('showCcBccButton')).not.toBeInTheDocument();
      expect(screen.queryByTestId('emailCcRecipientsCombobox')).not.toBeInTheDocument();
      expect(screen.queryByTestId('emailBccRecipientsCombobox')).not.toBeInTheDocument();
      expect(screen.getByText('Sensitive information')).toBeInTheDocument();
    });
  });

  it('shows cc and bcc fields if they have a value', async () => {
    user = userEvent.setup({ delay: null });
    renderWithProviders(
      <ScheduledReportForm
        {...defaultProps}
        editMode
        scheduledReport={{
          ...defaultProps.scheduledReport,
          sendByEmail: true,
          emailRecipients: ['to@email.com'],
          emailCcRecipients: ['cc@email.com'],
          emailBccRecipients: ['bccemail.com'],
        }}
      />
    );

    // Wait for email fields to be rendered
    await screen.findByTestId('emailRecipientsCombobox');
    expect(screen.getByTestId('emailCcRecipientsCombobox')).toBeInTheDocument();
    expect(screen.getByTestId('emailBccRecipientsCombobox')).toBeInTheDocument();
  });

  it("hides cc and bcc fields if they don't have a value", async () => {
    user = userEvent.setup({ delay: null });
    renderWithProviders(
      <ScheduledReportForm
        {...defaultProps}
        editMode
        scheduledReport={{
          ...defaultProps.scheduledReport,
          sendByEmail: true,
          emailRecipients: ['to@email.com'],
        }}
      />
    );

    // Wait for email fields to be rendered
    await screen.findByTestId('emailRecipientsCombobox');
    expect(screen.queryByTestId('emailCcRecipientsCombobox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('emailBccRecipientsCombobox')).not.toBeInTheDocument();
  });

  describe('when in edit mode', () => {
    it('disables report type', async () => {
      renderWithProviders(<ScheduledReportForm {...defaultProps} editMode />);

      expect(await screen.findByTestId('reportTypeIdSelect')).toBeDisabled();
    });

    it('calls onSubmit correctly', async () => {
      user = userEvent.setup({ delay: null });
      renderWithProviders(
        <ScheduledReportForm
          {...defaultProps}
          editMode
          availableReportTypes={[{ label: 'PDF', id: 'printablePdfV2' }]}
        />
      );

      const titleInput = await screen.findByTestId('reportTitleInput');
      await user.clear(titleInput);
      await user.paste('Updated scheduled report title');

      const submitButton = await screen.findByTestId('scheduleExportSubmitButton');

      await user.click(submitButton);

      await waitFor(() => {
        expect(onSubmitForm).toHaveBeenCalledWith(
          {
            recurringSchedule: {
              frequency: 2,
            },
            reportTypeId: 'printablePdfV2',
            sendByEmail: false,
            startDate: '2025-11-10T12:00:00.000Z',
            timezone: 'UTC',
            title: 'Updated scheduled report title',
          },
          true
        );
      });
    });
  });

  describe('when in readonly mode', () => {
    it('disables title', async () => {
      renderWithProviders(<ScheduledReportForm {...defaultProps} readOnly />);

      expect(await screen.findByTestId('reportTitleInput')).toHaveAttribute('readonly');
    });

    it('disables report type', async () => {
      renderWithProviders(<ScheduledReportForm {...defaultProps} readOnly />);

      expect(await screen.findByTestId('reportTypeIdSelect')).toBeDisabled();
    });

    it('disables date picker', async () => {
      renderWithProviders(<ScheduledReportForm {...defaultProps} readOnly />);

      expect(await screen.findByTestId('startDatePicker-input')).toHaveAttribute('readonly');
    });

    it('disables schedule', async () => {
      renderWithProviders(<ScheduledReportForm {...defaultProps} readOnly />);

      expect(await screen.findByTestId('recurringScheduleRepeatSelect')).toBeDisabled();
    });

    it('disables all email fields', async () => {
      renderWithProviders(
        <ScheduledReportForm
          {...defaultProps}
          readOnly
          scheduledReport={{
            ...defaultProps.scheduledReport,
            sendByEmail: true,
            emailRecipients: ['to@email.com'],
            emailCcRecipients: ['cc@email.com'],
            emailBccRecipients: ['bccemail.com'],
          }}
        />
      );

      expect(await screen.findByTestId('sendByEmailToggle')).toBeDisabled();
      expect(screen.getByTestId('emailRecipientsCombobox')).toHaveAttribute('readonly');
      expect(screen.getByTestId('emailCcRecipientsCombobox')).toHaveAttribute('readonly');
      expect(screen.getByTestId('emailBccRecipientsCombobox')).toHaveAttribute('readonly');
      expect(screen.getByTestId('emailSubjectInput')).toHaveAttribute('disabled');
      expect(screen.getByTestId('emailMessageTextArea')).toHaveAttribute('disabled');
    });

    it('disables submit button', async () => {
      renderWithProviders(<ScheduledReportForm {...defaultProps} readOnly />);

      expect(await screen.findByTestId('scheduleExportSubmitButton')).toBeDisabled();
    });
  });

  describe('validation', () => {
    it('shows validation error when title is empty', async () => {
      user = userEvent.setup({ delay: null });
      renderWithProviders(<ScheduledReportForm {...defaultProps} />);

      const titleInput = await screen.findByTestId('reportTitleInput');
      await user.clear(titleInput);

      const submitButton = await screen.findByTestId('scheduleExportSubmitButton');
      await user.click(submitButton);

      expect(onSubmitForm).not.toHaveBeenCalled();

      expect(await screen.findByText('Report file name is required')).toBeInTheDocument();
    });

    it('does not throw error for previous start date when it is not updated in edit mode', async () => {
      user = userEvent.setup();
      renderWithProviders(
        <ScheduledReportForm
          {...defaultProps}
          editMode
          availableReportTypes={[{ id: 'printablePdfV2', label: 'PDF' }]}
        />
      );

      const submitButton = await screen.findByTestId('scheduleExportSubmitButton');
      await user.click(submitButton);

      expect(onSubmitForm).toHaveBeenCalled();
    });
  });
});
