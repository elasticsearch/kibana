/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiProvider } from '@elastic/eui';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { of } from 'rxjs';
import { I18nProvider } from '@kbn/i18n-react';
import { WorkflowsAvailabilityWrapper } from './workflows_availability_wrapper';
import {
  workflowEventNames,
  WorkflowUIEventTypes,
} from '../../common/lib/telemetry/events/workflows';
import { createStartServicesMock } from '../../mocks';

const mockUseKibanaServices = createStartServicesMock();
jest.mock('../../hooks/use_kibana', () => ({
  useKibana: () => ({ services: mockUseKibanaServices }),
}));
jest.mock('../../hooks/use_workflow_breadcrumbs/use_workflow_breadcrumbs', () => ({
  useWorkflowsBreadcrumbs: jest.fn(),
}));

// Mock helper
const mockAvailabilityService = mockUseKibanaServices.workflowsManagement.availability;

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <I18nProvider>
      <EuiProvider colorMode="light">{ui}</EuiProvider>
    </I18nProvider>
  );

describe('WorkflowsAvailabilityWrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAvailabilityService.getAvailabilityStatus$.mockReturnValue(of({ isAvailable: true }));
  });

  it('should render children when workflows are available', () => {
    renderWithProviders(
      <WorkflowsAvailabilityWrapper>
        <div data-test-subj="childContent">{'Workflows content'}</div>
      </WorkflowsAvailabilityWrapper>
    );

    expect(screen.getByTestId('childContent')).toBeInTheDocument();
    expect(screen.queryByTestId('workflowsAccessDeniedEmptyState')).not.toBeInTheDocument();
  });

  describe('when unavailable due to license', () => {
    beforeEach(() => {
      mockAvailabilityService.getAvailabilityStatus$.mockReturnValue(
        of({ isAvailable: false, unavailabilityReason: 'license' })
      );
    });

    it('should render access denied with license upgrade title and description', () => {
      renderWithProviders(
        <WorkflowsAvailabilityWrapper>
          <div data-test-subj="childContent" />
        </WorkflowsAvailabilityWrapper>
      );

      expect(screen.queryByTestId('childContent')).not.toBeInTheDocument();
      expect(screen.getByTestId('workflowsAccessDeniedEmptyState')).toBeInTheDocument();
      expect(screen.getByText('Upgrade your license')).toBeInTheDocument();
      expect(
        screen.getByText('You need to upgrade your license to use Workflows.')
      ).toBeInTheDocument();
    });

    it('should show subscription plans and manage license actions', () => {
      renderWithProviders(
        <WorkflowsAvailabilityWrapper>
          <div />
        </WorkflowsAvailabilityWrapper>
      );

      expect(screen.getByText('Subscription plans')).toBeInTheDocument();
      expect(screen.getByText('Manage your license')).toBeInTheDocument();
    });

    it('should show the enterprise badge in the footer', () => {
      renderWithProviders(
        <WorkflowsAvailabilityWrapper>
          <div />
        </WorkflowsAvailabilityWrapper>
      );

      expect(screen.getByText('License required:')).toBeInTheDocument();
      expect(screen.getByText('Enterprise')).toBeInTheDocument();
    });

    it('should report telemetry when workflows are unavailable due to license', async () => {
      renderWithProviders(
        <WorkflowsAvailabilityWrapper>
          <div />
        </WorkflowsAvailabilityWrapper>
      );

      await waitFor(() =>
        expect(
          mockUseKibanaServices.workflowsManagement.telemetry.reportEvent
        ).toHaveBeenCalledWith(
          WorkflowUIEventTypes.WorkflowAccessDeniedLicense,
          expect.objectContaining({
            eventName: workflowEventNames[WorkflowUIEventTypes.WorkflowAccessDeniedLicense],
          })
        )
      );
    });
  });

  describe('when unavailable due to serverless tier', () => {
    beforeEach(() => {
      mockAvailabilityService.getAvailabilityStatus$.mockReturnValue(
        of({
          isAvailable: false,
          unavailabilityReason: 'serverless_tier',
          requiredProducts: ['Security Complete'],
        })
      );
      mockUseKibanaServices.cloud.getPrivilegedUrls.mockResolvedValue({ billingUrl: undefined });
    });

    it('should render access denied with serverless tier title and description', () => {
      renderWithProviders(
        <WorkflowsAvailabilityWrapper>
          <div data-test-subj="childContent" />
        </WorkflowsAvailabilityWrapper>
      );

      expect(screen.queryByTestId('childContent')).not.toBeInTheDocument();
      expect(screen.getByTestId('workflowsAccessDeniedEmptyState')).toBeInTheDocument();
      expect(screen.getByText('Upgrade your subscription')).toBeInTheDocument();
      expect(
        screen.getByText(
          'You need to upgrade your serverless project subscription to use Workflows.'
        )
      ).toBeInTheDocument();
    });

    it('should show required product badges in the footer', () => {
      renderWithProviders(
        <WorkflowsAvailabilityWrapper>
          <div />
        </WorkflowsAvailabilityWrapper>
      );

      expect(screen.getByText('Security Complete')).toBeInTheDocument();
    });

    it('should show contact admin text when billing URL is not available', async () => {
      renderWithProviders(
        <WorkflowsAvailabilityWrapper>
          <div />
        </WorkflowsAvailabilityWrapper>
      );

      expect(
        await screen.findByText('Contact your administrator to upgrade your subscription.')
      ).toBeInTheDocument();
    });

    it('should show manage subscription button when billing URL is available', async () => {
      mockUseKibanaServices.cloud.getPrivilegedUrls.mockResolvedValue({
        billingUrl: 'https://cloud.elastic.co/billing',
      });

      renderWithProviders(
        <WorkflowsAvailabilityWrapper>
          <div />
        </WorkflowsAvailabilityWrapper>
      );

      expect(await screen.findByText('Manage subscription')).toBeInTheDocument();
    });

    it('should show contact admin text when billing URL is not https', async () => {
      mockUseKibanaServices.cloud.getPrivilegedUrls.mockResolvedValue({
        billingUrl: 'http://cloud.elastic.co/billing',
      });

      renderWithProviders(
        <WorkflowsAvailabilityWrapper>
          <div />
        </WorkflowsAvailabilityWrapper>
      );

      expect(
        await screen.findByText('Contact your administrator to upgrade your subscription.')
      ).toBeInTheDocument();
      expect(screen.queryByText('Manage subscription')).not.toBeInTheDocument();
    });

    it('should report telemetry when workflows are unavailable due to serverless tier', async () => {
      renderWithProviders(
        <WorkflowsAvailabilityWrapper>
          <div />
        </WorkflowsAvailabilityWrapper>
      );

      await waitFor(() =>
        expect(
          mockUseKibanaServices.workflowsManagement.telemetry.reportEvent
        ).toHaveBeenCalledWith(
          WorkflowUIEventTypes.WorkflowAccessDeniedServerlessTier,
          expect.objectContaining({
            eventName: workflowEventNames[WorkflowUIEventTypes.WorkflowAccessDeniedServerlessTier],
          })
        )
      );
    });
  });
});
