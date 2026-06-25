/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { useFetchRule } from '../../hooks/use_fetch_rule';
import { RuleStateStatus } from '../../types/rule_state';
import {
  createMockServices,
  createTestQueryClient,
  createQueryClientWrapper,
} from '../../hooks/test_utils';
import { AlertEpisodeDetailsFlyout } from './details_flyout';

jest.mock('../../hooks/use_fetch_rule');

jest.mock('./details_header_section', () => ({
  AlertEpisodeDetailsHeaderSection: () => <div data-test-subj="headerSectionStub" />,
}));
jest.mock('./overview_section', () => ({
  AlertEpisodeOverviewSection: () => <div data-test-subj="overviewSectionStub" />,
}));
jest.mock('./related_section', () => ({
  AlertEpisodesRelatedSection: () => <div data-test-subj="relatedSectionStub" />,
}));
jest.mock('./metadata_section', () => ({
  AlertEpisodeMetadataSection: () => <div data-test-subj="metadataSectionStub" />,
}));
jest.mock('./runbook_section', () => ({
  AlertEpisodeRunbookSection: () => <div data-test-subj="runbookSectionStub" />,
}));

const mockUseFetchRule = jest.mocked(useFetchRule);

const mockHttp = httpServiceMock.createStartContract();
const mockServices = createMockServices({ http: mockHttp });
const Wrapper = createQueryClientWrapper(createTestQueryClient());

const loadedRuleState = {
  status: RuleStateStatus.loaded,
  ruleId: 'rule-1',
  rule: { id: 'rule-1', metadata: { name: 'Rule A' } },
} as const;

const baseProps = {
  episodeId: 'ep-1',
  groupHash: 'gh-1',
  onClose: jest.fn(),
  services: mockServices,
};

describe('AlertEpisodeDetailsFlyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFetchRule.mockReturnValue({
      ruleState: loadedRuleState,
    } as ReturnType<typeof useFetchRule>);
  });

  it('renders header, overview tab body by default, and footer button with the right href', () => {
    render(<AlertEpisodeDetailsFlyout {...baseProps} />, { wrapper: Wrapper });
    expect(screen.getByTestId('headerSectionStub')).toBeInTheDocument();
    expect(screen.getByTestId('overviewSectionStub')).toBeInTheDocument();
    expect(screen.getByTestId('alertingV2EpisodeFlyoutViewDetailsButton')).toHaveAttribute(
      'href',
      mockHttp.basePath.prepend('/app/management/alertingV2/episodes/ep-1')
    );
  });

  it('switches to related tab', () => {
    render(<AlertEpisodeDetailsFlyout {...baseProps} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByTestId('alertingV2EpisodeFlyoutTabRelated'));
    expect(screen.getByTestId('relatedSectionStub')).toBeInTheDocument();
  });

  it('switches to metadata tab when the rule is loaded', () => {
    render(<AlertEpisodeDetailsFlyout {...baseProps} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByTestId('alertingV2EpisodeFlyoutTabMetadata'));
    expect(screen.getByTestId('metadataSectionStub')).toBeInTheDocument();
  });

  it('switches to runbook tab when the rule is loaded', () => {
    render(<AlertEpisodeDetailsFlyout {...baseProps} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByTestId('alertingV2EpisodeFlyoutTabRunbook'));
    expect(screen.getByTestId('runbookSectionStub')).toBeInTheDocument();
  });

  it('hides metadata and runbook tabs when the rule is not loaded', () => {
    mockUseFetchRule.mockReturnValue({
      ruleState: { status: RuleStateStatus.not_found, ruleId: 'rule-1' },
    } as ReturnType<typeof useFetchRule>);

    render(<AlertEpisodeDetailsFlyout {...baseProps} />, { wrapper: Wrapper });

    expect(screen.queryByTestId('alertingV2EpisodeFlyoutTabMetadata')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alertingV2EpisodeFlyoutTabRunbook')).not.toBeInTheDocument();
  });

  it('calls onClose when the footer close button is clicked', () => {
    const onClose = jest.fn();
    render(<AlertEpisodeDetailsFlyout {...baseProps} onClose={onClose} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByTestId('alertingV2EpisodeFlyoutCloseButton'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the top-bar icon button is clicked', () => {
    const onClose = jest.fn();
    render(<AlertEpisodeDetailsFlyout {...baseProps} onClose={onClose} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
