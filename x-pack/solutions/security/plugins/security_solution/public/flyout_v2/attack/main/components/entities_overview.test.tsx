/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import { EntitiesOverview } from './entities_overview';
import { INSIGHTS_ENTITIES_TEST_ID } from '../constants/test_ids';
import { useAttackEntitiesCounts } from '../hooks/use_attack_entities_counts';

jest.mock('@kbn/i18n-react', () => ({
  FormattedMessage: ({ defaultMessage, id }: { defaultMessage: string; id: string }) => (
    <span data-testid={id}>{defaultMessage}</span>
  ),
}));

jest.mock('./section_panel', () => ({
  SectionPanel: ({
    children,
    title,
    'data-test-subj': dataTestSubj,
    link,
  }: {
    children: React.ReactNode;
    title: React.ReactNode;
    'data-test-subj'?: string;
    link?: { callback: () => void; tooltip: React.ReactNode } | undefined;
  }) => (
    <div data-test-subj={dataTestSubj}>
      {link ? (
        <button data-test-subj={`${dataTestSubj}TitleLink`} onClick={link.callback} type="button">
          {title}
        </button>
      ) : (
        <div data-test-subj={`${dataTestSubj}TitleText`}>{title}</div>
      )}
      {children}
    </div>
  ),
}));

jest.mock('../hooks/use_attack_entities_counts', () => ({
  useAttackEntitiesCounts: jest.fn(),
}));

const renderWithEui = (ui: React.ReactElement) => render(<EuiProvider>{ui}</EuiProvider>);

describe('EntitiesOverview (v2)', () => {
  const mockUseAttackEntitiesCounts = jest.mocked(useAttackEntitiesCounts);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAttackEntitiesCounts.mockReturnValue({
      relatedUsers: 0,
      relatedHosts: 0,
      loading: false,
      error: false,
    });
  });

  it('renders the section with the entities test id', () => {
    renderWithEui(<EntitiesOverview alertIds={['alert-1']} />);

    expect(screen.getByTestId(INSIGHTS_ENTITIES_TEST_ID)).toBeInTheDocument();
  });

  it('passes alertIds to useAttackEntitiesCounts', () => {
    const alertIds = ['id-1', 'id-2'];
    renderWithEui(<EntitiesOverview alertIds={alertIds} />);

    expect(mockUseAttackEntitiesCounts).toHaveBeenCalledWith(alertIds);
  });

  it('renders Related users and Related hosts labels', () => {
    renderWithEui(<EntitiesOverview alertIds={['alert-1']} />);

    expect(screen.getByText('Related users')).toBeInTheDocument();
    expect(screen.getByText('Related hosts')).toBeInTheDocument();
  });

  it('renders user and host counts in badges', () => {
    mockUseAttackEntitiesCounts.mockReturnValue({
      relatedUsers: 3,
      relatedHosts: 5,
      loading: false,
      error: false,
    });

    renderWithEui(<EntitiesOverview alertIds={['alert-1']} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders skeleton text while loading', () => {
    mockUseAttackEntitiesCounts.mockReturnValue({
      relatedUsers: 0,
      relatedHosts: 0,
      loading: true,
      error: false,
    });

    renderWithEui(<EntitiesOverview alertIds={['alert-1']} />);

    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders the title as plain text (no link) because left panel is not yet available', () => {
    renderWithEui(<EntitiesOverview alertIds={['alert-1']} />);

    expect(screen.getByTestId(`${INSIGHTS_ENTITIES_TEST_ID}TitleText`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${INSIGHTS_ENTITIES_TEST_ID}TitleLink`)).not.toBeInTheDocument();
  });
});
