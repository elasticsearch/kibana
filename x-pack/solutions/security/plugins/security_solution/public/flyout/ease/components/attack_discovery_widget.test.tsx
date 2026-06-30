/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ATTACK_DISCOVERY_ACCORDION_TEST_ID,
  ATTACK_DISCOVERY_NO_RESULTS_TEST_ID,
  AttackDiscoveryWidget,
} from './attack_discovery_widget';
import { TestProviders } from '../../../common/mock';
import { useFindAttackDiscoveries } from '../../../attack_discovery/pages/use_find_attack_discoveries';
import type { AttackDiscoveryPanelProps } from './attack_discovery_panel';

jest.mock('../../../attack_discovery/pages/use_find_attack_discoveries', () => ({
  useFindAttackDiscoveries: jest.fn(),
}));
jest.mock('./attack_discovery_panel', () => ({
  AttackDiscoveryPanel: ({ attackDiscovery }: AttackDiscoveryPanelProps) => (
    <h1>{attackDiscovery.title}</h1>
  ),
}));

const mockData = {
  id: '123',
  alertIds: ['alert-id-xyz789'],
  detailsMarkdown: `
* Suspicious process \`process.name\`:\`rundll32.exe\` launched by \`process.parent.name\`:\`winword.exe\` on \`host.name\`:\`finance-ws-03\`.
* Network connection initiated by \`process.name\`:\`rundll32.exe\` to \`destination.ip\`:\`203.0.113.25\` on \`destination.port\`:\`443\`.
  `,
  mitreAttackTactics: ['TA0002', 'TA0011'],
  summaryMarkdown:
    'Possible command and control activity initiated by `process.name`:`rundll32.exe` originating from `process.parent.name`:`winword.exe` on host `host.name`:`finance-ws-03`.',
  title: 'Suspicious Rundll32 Network Activity',
};

describe('AttackDiscoveryWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading spinner when data is being fetched', () => {
    (useFindAttackDiscoveries as jest.Mock).mockReturnValue({
      isLoading: true,
      data: null,
    });

    const { container } = render(
      <TestProviders>
        <AttackDiscoveryWidget alertId={'123'} />
      </TestProviders>
    );

    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });

  it('should render no results message when no data is available', () => {
    (useFindAttackDiscoveries as jest.Mock).mockReturnValue({
      isLoading: false,
      data: null,
    });

    render(
      <TestProviders>
        <AttackDiscoveryWidget alertId={'123'} />
      </TestProviders>
    );

    expect(screen.getByTestId(ATTACK_DISCOVERY_NO_RESULTS_TEST_ID)).toBeInTheDocument();
  });

  it('should render attack discovery details when data is available', () => {
    (useFindAttackDiscoveries as jest.Mock).mockReturnValue({
      isLoading: false,
      data: { data: [mockData] },
    });

    render(
      <TestProviders>
        <AttackDiscoveryWidget alertId={'123'} />
      </TestProviders>
    );

    expect(screen.getByText(mockData.title)).toBeInTheDocument();
    expect(screen.queryByTestId(ATTACK_DISCOVERY_ACCORDION_TEST_ID)).not.toBeInTheDocument();
  });

  it('should render attack discovery accordion when multiple attack discoveries exist', () => {
    const additionalTitle = 'Another discovery';
    (useFindAttackDiscoveries as jest.Mock).mockReturnValue({
      isLoading: false,
      data: { data: [mockData, { ...mockData, title: additionalTitle }] },
    });
    render(
      <TestProviders>
        <AttackDiscoveryWidget alertId={'123'} />
      </TestProviders>
    );

    expect(screen.getByTestId(ATTACK_DISCOVERY_ACCORDION_TEST_ID)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(ATTACK_DISCOVERY_ACCORDION_TEST_ID));

    expect(screen.getByText(additionalTitle)).toBeInTheDocument();
  });
});
