/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { TestProviders } from '../../../../common/mock';
import { TimelineModalHeader } from '.';
import { render } from '@testing-library/react';
import { useCreateTimeline } from '../../../hooks/use_create_timeline';
import { useInspect } from '../../../../common/components/inspect/use_inspect';
import { useKibana } from '../../../../common/lib/kibana';
import { timelineActions } from '../../../store';

jest.mock('../../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn(),
}));
jest.mock('../../../hooks/use_create_timeline');
jest.mock('../../../../common/components/inspect/use_inspect');
jest.mock('../../../../common/lib/kibana');

const mockGetState = jest.fn().mockReturnValue({});
jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');
  return {
    ...actual,
    useDispatch: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useSelector: (selector: any) =>
      selector({
        timeline: {
          timelineById: {
            'timeline-1': {
              ...mockGetState(),
            },
          },
        },
        dataViewManager: { timeline: {} },
      }),
  };
});

const timelineId = 'timeline-1';
const mockRef = {
  current: null,
};
const renderTimelineModalHeader = () =>
  render(
    <TestProviders>
      <TimelineModalHeader timelineId={timelineId} openToggleRef={mockRef} />
    </TestProviders>
  );

describe('TimelineModalHeader', () => {
  (useCreateTimeline as jest.Mock).mockReturnValue(jest.fn());
  (useInspect as jest.Mock).mockReturnValue(jest.fn());

  it('should render all dom elements', () => {
    const { getByTestId, getByText } = renderTimelineModalHeader();

    expect(getByTestId('timeline-favorite-empty-star')).toBeInTheDocument();
    expect(getByText('Untitled Timeline')).toBeInTheDocument();
    expect(getByTestId('timeline-save-status')).toBeInTheDocument();
    expect(getByTestId('timeline-modal-header-actions')).toBeInTheDocument();
    expect(getByTestId('timeline-modal-new-timeline-dropdown-button')).toBeInTheDocument();
    expect(getByTestId('timeline-modal-open-timeline-button')).toBeInTheDocument();
    expect(getByTestId('inspect-empty-button')).toBeInTheDocument();
    expect(getByTestId('timeline-modal-save-timeline')).toBeInTheDocument();
    expect(getByTestId('timeline-modal-header-close-button')).toBeInTheDocument();
  });

  it('should show attach to case if user has the correct permissions', () => {
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        application: {
          navigateToApp: jest.fn(),
        },
        cases: {
          helpers: {
            canUseCases: jest.fn().mockReturnValue({
              createComment: true,
              read: true,
            }),
          },
          hooks: {
            useCasesAddToNewCaseFlyout: jest.fn().mockReturnValue({ open: jest.fn() }),
            useCasesAddToExistingCaseModal: jest.fn().mockReturnValue({ open: jest.fn() }),
          },
          config: { attachmentsEnabled: false },
        },
        uiSettings: {
          get: jest.fn(),
        },
      },
    });

    const { getByTestId } = renderTimelineModalHeader();

    expect(getByTestId('timeline-modal-attach-to-case-dropdown-button')).toBeInTheDocument();
  });

  describe('Super Timeline read-only mode', () => {
    beforeEach(() => {
      mockGetState.mockReturnValue({ isSuperTimeline: true });
    });
    afterEach(() => {
      mockGetState.mockReturnValue({});
    });

    it('hides Save, Attach to Case, and Favorites buttons and shows the read-only badge', () => {
      const { getByTestId, queryByTestId } = renderTimelineModalHeader();

      expect(getByTestId('timeline-modal-super-timeline-badge')).toBeInTheDocument();
      expect(queryByTestId('timeline-modal-save-timeline')).not.toBeInTheDocument();
      expect(queryByTestId('timeline-favorite-empty-star')).not.toBeInTheDocument();
      expect(
        queryByTestId('timeline-modal-attach-to-case-dropdown-button')
      ).not.toBeInTheDocument();
    });
  });

  it('should call showTimeline action when closing timeline', () => {
    const spy = jest.spyOn(timelineActions, 'showTimeline');

    const { getByTestId } = renderTimelineModalHeader();

    getByTestId('timeline-modal-header-close-button').click();

    expect(spy).toHaveBeenCalledWith({
      id: timelineId,
      show: false,
    });
  });
});
