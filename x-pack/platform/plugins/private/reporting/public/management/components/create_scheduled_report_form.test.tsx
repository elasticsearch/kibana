/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  applicationServiceMock,
  coreMock,
  httpServiceMock,
  notificationServiceMock,
} from '@kbn/core/public/mocks';
import { ReportingAPIClient, useKibana } from '@kbn/reporting-public';
import { mockScheduledReports } from '../../../common/test/fixtures';

import { CreateScheduledReportForm } from './create_scheduled_report_form';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import userEvent from '@testing-library/user-event';
import { getReportingHealth } from '../apis/get_reporting_health';
import { useGetUserProfileQuery } from '../hooks/use_get_user_profile_query';
import { useUiSetting } from '@kbn/kibana-react-plugin/public';
import { scheduleReport } from '../apis/schedule_report';
import moment from 'moment';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import { transformScheduledReport } from '../utils';

jest.mock('@kbn/kibana-react-plugin/public');
jest.mock('@kbn/reporting-public', () => ({
  useKibana: jest.fn(),
  ReportingAPIClient: jest.fn().mockImplementation(() => ({
    getDecoratedJobParams: jest.fn().mockResolvedValue({
      browserTimezone: 'UTC',
      version: 'x.x.x',
      title: 'Scheduled report 2',
      objectType: 'dashboard',
    }),
  })),
}));

jest.mock('../hooks/use_get_user_profile_query');
jest.mock('../apis/get_reporting_health');
jest.mock('../apis/schedule_report');

const mockValidateEmailAddresses = jest.fn().mockReturnValue([]);
const mockReportingHealth = jest.mocked(getReportingHealth);
const mockGetUserProfileQuery = jest.mocked(useGetUserProfileQuery);
const mockedUseUiSetting = jest.mocked(useUiSetting);
const mockScheduleReport = jest.mocked(scheduleReport);

describe('createScheduledReportForm', () => {
  const onClose = jest.fn();
  const application = applicationServiceMock.createStartContract();
  const http = httpServiceMock.createSetupContract();
  const uiSettings = coreMock.createSetup().uiSettings;
  const apiClient = new ReportingAPIClient(http, uiSettings, 'x.x.x');
  const queryClient = new QueryClient();
  let user: ReturnType<typeof userEvent.setup>;
  const today = new Date('2025-11-10T12:00:00.000Z');

  const defaultSharingData = {
    title: 'canvas',
    locatorParams: {
      id: 'canvas-123',
      params: {
        id: '123',
      },
    },
  };

  const defaultProps = {
    apiClient,
    scheduledReport: transformScheduledReport(mockScheduledReports[1]),
    availableReportTypes: [],
    sharingData: defaultSharingData,
    objectType: 'dashboard',
    onClose,
  };

  const mockUiSettings = (settings: Record<string, string>) => {
    mockedUseUiSetting.mockImplementation((key) => settings[key as string]);
  };

  beforeAll(() => {
    moment.tz.setDefault('UTC');
    mockUiSettings({
      'dateFormat:tz': 'UTC',
      dateFormat: 'MMM D, YYYY @ HH:mm:ss.SSS',
    });
  });

  beforeEach(() => {
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        application: {
          capabilities: { ...application.capabilities, manageReporting: { show: true } },
        },
        http,
        notifications: notificationServiceMock.createStartContract(),
        userProfile: userProfileServiceMock.createStart(),
        actions: {
          validateEmailAddresses: mockValidateEmailAddresses,
        },
      },
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
    mockScheduleReport.mockResolvedValue({
      job: {
        id: mockScheduledReports[1].id,
      },
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
    render(
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <CreateScheduledReportForm {...defaultProps} />
        </QueryClientProvider>
      </IntlProvider>
    );

    expect(await screen.findByTestId('scheduleExportForm')).toBeInTheDocument();
    expect(await screen.findByTestId('scheduleExportSubmitButton')).toBeInTheDocument();
  });

  it('submits the form correctly', async () => {
    user = userEvent.setup({ delay: null });
    render(
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <CreateScheduledReportForm
            {...defaultProps}
            availableReportTypes={[{ label: 'PDF', id: 'printablePdfV2' }]}
          />
        </QueryClientProvider>
      </IntlProvider>
    );

    const submitButton = await screen.findByTestId('scheduleExportSubmitButton');

    await user.click(submitButton);
    await waitFor(() => {
      expect(mockScheduleReport).toHaveBeenCalledWith(
        expect.objectContaining({
          http,
          params: {
            reportTypeId: 'printablePdfV2',
            schedule: {
              rrule: {
                byhour: [12],
                byminute: [0],
                freq: 3,
                interval: 1,
                dtstart: '2025-11-10T12:00:00.000Z',
                tzid: 'UTC',
              },
            },
            jobParams: expect.any(String),
            notification: undefined,
          },
        })
      );
    });
  });

  it('submits the form passing email fields correctly', async () => {
    user = userEvent.setup({ delay: null });
    render(
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <CreateScheduledReportForm
            {...defaultProps}
            availableReportTypes={[{ label: 'PDF', id: 'printablePdfV2' }]}
            scheduledReport={{
              ...defaultProps.scheduledReport,
              sendByEmail: true,
              emailRecipients: ['to@example.com'],
              emailCcRecipients: ['cc@example.com'],
              emailBccRecipients: ['bcc@example.com'],
              emailSubject: 'subject',
              emailMessage: 'message',
            }}
          />
        </QueryClientProvider>
      </IntlProvider>
    );

    const submitButton = await screen.findByTestId('scheduleExportSubmitButton');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockScheduleReport).toHaveBeenCalledWith(
        expect.objectContaining({
          http,
          params: {
            reportTypeId: 'printablePdfV2',
            schedule: {
              rrule: {
                byhour: [12],
                byminute: [0],
                freq: 3,
                interval: 1,
                dtstart: '2025-11-10T12:00:00.000Z',
                tzid: 'UTC',
              },
            },
            jobParams: expect.any(String),
            notification: {
              email: {
                to: ['to@example.com'],
                cc: ['cc@example.com'],
                bcc: ['bcc@example.com'],
                subject: 'subject',
                message: 'message',
              },
            },
          },
        })
      );
    });
  });

  it('cancels the form correctly', async () => {
    user = userEvent.setup({ delay: null });
    render(
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <CreateScheduledReportForm {...defaultProps} />
        </QueryClientProvider>
      </IntlProvider>
    );

    const cancelButton = await screen.findByTestId('scheduleExportCancelButton');

    await user.click(cancelButton);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
