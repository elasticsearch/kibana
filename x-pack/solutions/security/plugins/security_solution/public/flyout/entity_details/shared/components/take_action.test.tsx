/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { TakeAction } from './take_action';
import { TestProviders } from '../../../../common/mock';
import { useInvestigateInTimeline } from '../../../../common/hooks/timeline/use_investigate_in_timeline';
import { useShowTimeline } from '../../../../common/utils/timeline/use_show_timeline';

jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: jest.fn(),
}));

jest.mock('../../../../common/hooks/timeline/use_investigate_in_timeline');

jest.mock('../../../../common/utils/timeline/use_show_timeline', () => ({
  useShowTimeline: jest.fn(() => [true]),
}));

describe('<TakeAction />', () => {
  const kqlQuery = 'host.name: "test-host"';
  const closeFlyout = jest.fn();
  const investigateInTimeline = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useExpandableFlyoutApi as jest.Mock).mockReturnValue({ closeFlyout });
    (useInvestigateInTimeline as jest.Mock).mockReturnValue({ investigateInTimeline });
    (useShowTimeline as jest.Mock).mockReturnValue([true]);
  });

  it('renders the Take Action button', () => {
    const { getByText } = render(<TakeAction kqlQuery={kqlQuery} />, {
      wrapper: TestProviders,
    });
    expect(getByText('Take action')).toBeInTheDocument();
  });

  it('disables the button when isDisabled is true', () => {
    const { getByRole } = render(<TakeAction kqlQuery={kqlQuery} isDisabled />, {
      wrapper: TestProviders,
    });
    const button = getByRole('button', { name: /take action/i });
    expect(button).toBeDisabled();
  });

  it('hides Take Action when Timeline is unavailable and there are no additional items', () => {
    (useShowTimeline as jest.Mock).mockReturnValue([false]);

    const { queryByTestId } = render(<TakeAction kqlQuery={kqlQuery} />, {
      wrapper: TestProviders,
    });

    expect(queryByTestId('take-action-button')).not.toBeInTheDocument();
  });

  it('keeps Take Action when Timeline is unavailable but additional items exist', () => {
    (useShowTimeline as jest.Mock).mockReturnValue([false]);

    const { getByRole, queryByTestId, getByTestId } = render(
      <TakeAction
        kqlQuery={kqlQuery}
        additionalItems={() => [
          <button key="extra" type="button" data-test-subj="extra-take-action-item">
            {'Extra action'}
          </button>,
        ]}
      />,
      { wrapper: TestProviders }
    );

    fireEvent.click(getByRole('button', { name: /take action/i }));
    expect(queryByTestId('investigate-in-timeline-take-action-button')).not.toBeInTheDocument();
    expect(getByTestId('extra-take-action-item')).toBeInTheDocument();
  });

  describe('Investigate in Timeline', () => {
    const clickInvestigateInTimeline = (result: ReturnType<typeof render>) => {
      // Open the "Take action" popover, then click "Investigate in Timeline".
      fireEvent.click(result.getByRole('button', { name: /take action/i }));
      fireEvent.click(result.getByTestId('investigate-in-timeline-take-action-button'));
    };

    it('renders the timeline icon', () => {
      const result = render(<TakeAction kqlQuery={kqlQuery} />, { wrapper: TestProviders });
      fireEvent.click(result.getByRole('button', { name: /take action/i }));
      expect(
        result
          .getByTestId('investigate-in-timeline-take-action-button')
          .querySelector('[data-euiicon-type="timeline"]')
      ).toBeInTheDocument();
    });

    it('opens Timeline with the entity query', async () => {
      const result = render(<TakeAction kqlQuery={kqlQuery} />, {
        wrapper: TestProviders,
      });

      clickInvestigateInTimeline(result);

      await waitFor(() => {
        expect(investigateInTimeline).toHaveBeenCalledWith(
          expect.objectContaining({ query: { language: 'kuery', query: kqlQuery } })
        );
      });
    });

    // entity flyout renders above the Timeline overlay, so it must be closed when
    // opening Timeline, otherwise it stays visible on top of the Timeline page.
    it('closes the entity flyout so it does not overlap the Timeline', async () => {
      const result = render(<TakeAction kqlQuery={kqlQuery} />, {
        wrapper: TestProviders,
      });

      clickInvestigateInTimeline(result);

      await waitFor(() => {
        expect(closeFlyout).toHaveBeenCalledTimes(1);
      });
    });
  });
});
