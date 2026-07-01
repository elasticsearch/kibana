/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '../../../utils/test_helper';
import { alert } from '../mock/alert';
import { useKibana } from '../../../utils/kibana_react';
import { kibanaStartMock } from '../../../utils/kibana_react.mock';
import type { AlertSubtitleProps } from './alert_subtitle';
import { AlertSubtitle } from './alert_subtitle';

jest.mock('../../../utils/kibana_react');

const mockAuthorizedToReadRuleType = jest.fn(() => true);
const mockUseGetRuleTypesPermissions = jest.fn(() => ({
  authorizedToReadRuleType: mockAuthorizedToReadRuleType,
}));
jest.mock('@kbn/alerts-ui-shared/src/common/hooks', () => ({
  ...jest.requireActual('@kbn/alerts-ui-shared/src/common/hooks'),
  useGetRuleTypesPermissions: () => mockUseGetRuleTypesPermissions(),
}));

const useKibanaMock = useKibana as jest.Mock;
const mockKibana = () => {
  useKibanaMock.mockReturnValue({
    services: {
      ...kibanaStartMock.startContract().services,
      http: {
        basePath: {
          prepend: jest.fn(),
        },
      },
    },
  });
};

describe('Alert subtitle', () => {
  const renderComponent = (props: AlertSubtitleProps) => {
    return render(<AlertSubtitle {...props} />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockKibana();
    mockAuthorizedToReadRuleType.mockReturnValue(true);
    mockUseGetRuleTypesPermissions.mockReturnValue({
      authorizedToReadRuleType: mockAuthorizedToReadRuleType,
    });
  });

  it('should show the rule type breached text', async () => {
    const result = renderComponent({ alert });

    expect(result.queryByText('Log threshold breached')).toBeInTheDocument();
  });

  it('should show a "View rule" link', async () => {
    const result = renderComponent({ alert });

    expect(result.queryByText('View rule')).toBeInTheDocument();
    expect(result.getByTestId('o11yAlertRuleLink')).toBeInTheDocument();
  });

  it('should check read authorization for the alert specific rule type and consumer', async () => {
    renderComponent({ alert });

    expect(mockAuthorizedToReadRuleType).toHaveBeenCalledWith('logs.alert.document.count', 'logs');
  });

  it('should NOT show a "View rule" link when not authorized to read the rule type', async () => {
    mockAuthorizedToReadRuleType.mockReturnValue(false);

    const result = renderComponent({ alert });

    expect(result.queryByText('View rule')).not.toBeInTheDocument();
    expect(result.queryByTestId('o11yAlertRuleLink')).not.toBeInTheDocument();
  });
});
