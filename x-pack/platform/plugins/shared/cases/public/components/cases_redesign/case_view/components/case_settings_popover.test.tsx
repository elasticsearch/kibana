/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CaseMetricsFeature } from '../../../../../common/types/api';
import { CaseSettingsPopover } from './case_settings_popover';
import { renderWithTestingProviders } from '../../../../common/mock';
import { basicCase } from '../../../../containers/mock';
import { useGetTemplates } from '../../../templates_v2/hooks/use_get_templates';
import { useChangeAppliedTemplate } from '../../../case_view/use_change_applied_template';
import { useGetTemplate } from '../../../templates_v2/hooks/use_get_template';
import { KibanaServices } from '../../../../common/lib/kibana';

jest.mock('../../../templates_v2/hooks/use_get_templates');
jest.mock('../../../case_view/use_change_applied_template');
jest.mock('../../../templates_v2/hooks/use_get_template');
jest.mock('../../../../common/lib/kibana');

(useGetTemplates as jest.Mock).mockReturnValue({
  data: { templates: [] },
  isLoading: false,
});
(useChangeAppliedTemplate as jest.Mock).mockReturnValue({
  mutate: jest.fn(),
});
(useGetTemplate as jest.Mock).mockReturnValue({ data: null });

describe('CaseSettingsPopover', () => {
  const anchorElement = document.createElement('button');
  document.body.appendChild(anchorElement);

  const defaultProps = {
    caseData: basicCase,
    syncAlerts: true,
    onSyncAlertsChange: jest.fn(),
    showMetrics: true,
    onShowMetricsChange: jest.fn(),
    isOpen: true,
    onClose: jest.fn(),
    anchorElement,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(KibanaServices, 'getConfig').mockReturnValue({
      templates: { enabled: true },
    } as ReturnType<typeof KibanaServices.getConfig>);
    (useGetTemplates as jest.Mock).mockReturnValue({
      data: { templates: [] },
      isLoading: false,
    });
    (useChangeAppliedTemplate as jest.Mock).mockReturnValue({
      mutate: jest.fn(),
    });
    (useGetTemplate as jest.Mock).mockReturnValue({ data: null });
  });

  it('renders the popover with title', async () => {
    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} />);

    expect(await screen.findByTestId('case-settings-popover')).toBeInTheDocument();
  });

  it('renders sync alerts switch', async () => {
    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} />);

    expect(await screen.findByTestId('case-settings-sync-alerts-switch')).toBeInTheDocument();
  });

  it('renders show metrics switch when metrics features are configured', async () => {
    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} />, {
      wrapperProps: { features: { metrics: [CaseMetricsFeature.ALERTS_COUNT] } },
    });

    expect(await screen.findByTestId('case-settings-show-metrics-switch')).toBeInTheDocument();
  });

  it('does not render show metrics switch when no metrics features are configured', async () => {
    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} />, {
      wrapperProps: { features: { metrics: [] } },
    });

    await screen.findByTestId('case-settings-popover');
    expect(screen.queryByTestId('case-settings-show-metrics-switch')).not.toBeInTheDocument();
  });

  it('calls onSyncAlertsChange when switch is toggled', async () => {
    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} syncAlerts={false} />);

    await userEvent.click(await screen.findByTestId('case-settings-sync-alerts-switch'));

    await waitFor(() => {
      expect(defaultProps.onSyncAlertsChange).toHaveBeenCalledWith(true);
    });
  });

  it('calls onShowMetricsChange when switch is toggled', async () => {
    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} showMetrics={false} />, {
      wrapperProps: { features: { metrics: [CaseMetricsFeature.ALERTS_COUNT] } },
    });

    await userEvent.click(await screen.findByTestId('case-settings-show-metrics-switch'));

    await waitFor(() => {
      expect(defaultProps.onShowMetricsChange).toHaveBeenCalledWith(true);
    });
  });

  it('does not render popover content when isOpen is false', () => {
    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} isOpen={false} />);

    expect(screen.queryByTestId('case-settings-sync-alerts-switch')).not.toBeInTheDocument();
  });

  it('renders template selector when templates are enabled', async () => {
    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} />);

    expect(await screen.findByTestId('case-settings-template-select')).toBeInTheDocument();
  });

  it('does not render sync alerts switch when alerts sync is disabled', async () => {
    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} />, {
      wrapperProps: { features: { alerts: { sync: false } } },
    });

    await screen.findByTestId('case-settings-popover');
    expect(screen.queryByTestId('case-settings-sync-alerts-switch')).not.toBeInTheDocument();
  });

  it('does not render template selector when templates are disabled', async () => {
    jest.spyOn(KibanaServices, 'getConfig').mockReturnValue({
      templates: { enabled: false },
    } as ReturnType<typeof KibanaServices.getConfig>);

    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} />);

    await screen.findByTestId('case-settings-popover');
    expect(screen.queryByTestId('case-settings-template-select')).not.toBeInTheDocument();
  });

  it('does not call changeTemplate when the case already has the selected template applied', async () => {
    const mutateMock = jest.fn();
    const templateId = 'template-1';

    (useChangeAppliedTemplate as jest.Mock).mockReturnValue({ mutate: mutateMock });
    (useGetTemplate as jest.Mock).mockReturnValue({
      data: { templateId, templateVersion: 1, definition: { fields: [] } },
    });

    const caseWithTemplate = {
      ...basicCase,
      template: { id: templateId, version: 1 },
    };

    renderWithTestingProviders(
      <CaseSettingsPopover {...defaultProps} caseData={caseWithTemplate} />
    );

    await screen.findByTestId('case-settings-popover');

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('does not render edit case name link', async () => {
    renderWithTestingProviders(<CaseSettingsPopover {...defaultProps} />);

    await screen.findByTestId('case-settings-popover');
    expect(screen.queryByTestId('case-settings-change-name')).not.toBeInTheDocument();
  });
});
