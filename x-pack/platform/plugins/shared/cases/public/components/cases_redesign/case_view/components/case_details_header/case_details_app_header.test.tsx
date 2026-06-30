/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';

import { CaseDetailsAppHeader } from './case_details_app_header';
import { renderWithTestingProviders } from '../../../../../common/mock';
import { basicCase } from '../../../../../containers/mock';
import { useGetCaseConnectors } from '../../../../../containers/use_get_case_connectors';
import { useDeleteCases } from '../../../../../containers/use_delete_cases';
import { useShouldDisableStatus } from '../../../../actions/status/use_should_disable_status';
import { useStatusAction } from '../../../../actions/status/use_status_action';

jest.mock('../../../../../containers/use_get_case_connectors');
jest.mock('../../../../../containers/use_delete_cases');
jest.mock('../../../../actions/status/use_should_disable_status');
jest.mock('../../../../actions/status/use_status_action');
jest.mock('../../../../../common/navigation/hooks');
jest.mock('../../../../../common/lib/kibana');
jest.mock('../../../../case_view/use_on_refresh_case_view_page');

jest.mock('../../../../confirm_delete_case', () => ({
  ConfirmDeleteCaseModal: () => <div data-test-subj="confirm-delete-modal" />,
}));

jest.mock('../case_settings_popover', () => ({
  CaseSettingsPopover: () => <div data-test-subj="case-settings-popover" />,
}));

(useGetCaseConnectors as jest.Mock).mockReturnValue({ data: {} });
(useDeleteCases as jest.Mock).mockReturnValue({ mutate: jest.fn() });
(useShouldDisableStatus as jest.Mock).mockReturnValue(() => false);
(useStatusAction as jest.Mock).mockReturnValue({ handleUpdateCaseStatus: jest.fn() });

describe('CaseDetailsAppHeader', () => {
  const onUpdateField = jest.fn();
  const onShowMetricsChange = jest.fn();

  const defaultProps = {
    caseData: basicCase,
    onUpdateField,
    showMetrics: true,
    onShowMetricsChange,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useGetCaseConnectors as jest.Mock).mockReturnValue({ data: {} });
    (useDeleteCases as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useShouldDisableStatus as jest.Mock).mockReturnValue(() => false);
    (useStatusAction as jest.Mock).mockReturnValue({ handleUpdateCaseStatus: jest.fn() });
  });

  it('renders the app header with case title', async () => {
    renderWithTestingProviders(<CaseDetailsAppHeader {...defaultProps} />);

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.root)).toBeInTheDocument();
    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(basicCase.title);
  });

  it('renders metadata with reporter name', async () => {
    renderWithTestingProviders(<CaseDetailsAppHeader {...defaultProps} />);

    const metadata = await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.metadata);
    expect(metadata.textContent).toContain('Reported by');
    expect(metadata.textContent).toContain(basicCase.createdBy.fullName!);
  });

  it('renders badges in the header', async () => {
    renderWithTestingProviders(<CaseDetailsAppHeader {...defaultProps} />);

    expect(await screen.findByTestId('case-view-severity-badge')).toBeInTheDocument();
    expect(screen.getByTestId('case-view-status-badge')).toBeInTheDocument();
  });

  it('does not render delete modal by default', async () => {
    renderWithTestingProviders(<CaseDetailsAppHeader {...defaultProps} />);

    await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.root);

    expect(screen.queryByTestId('confirm-delete-modal')).not.toBeInTheDocument();
  });

  it('does not render settings popover by default', async () => {
    renderWithTestingProviders(<CaseDetailsAppHeader {...defaultProps} />);

    await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.root);

    expect(screen.queryByTestId('case-settings-popover')).not.toBeInTheDocument();
  });

  it('does not render settings popover when user lacks update permissions', async () => {
    renderWithTestingProviders(<CaseDetailsAppHeader {...defaultProps} />, {
      wrapperProps: {
        permissions: {
          all: false,
          create: true,
          read: true,
          update: false,
          delete: true,
          push: true,
          connectors: true,
          settings: true,
          reopenCase: true,
          createComment: true,
          assign: true,
          manageTemplates: true,
        },
      },
    });

    await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.root);

    await waitFor(() => {
      expect(screen.queryByTestId('case-settings-popover')).not.toBeInTheDocument();
    });
  });
});
