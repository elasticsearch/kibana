/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { createMockStore, mockGlobalState } from '../../../../common/mock';
import { TestProviders } from '../../../../common/mock/test_providers';

import { TabsContent } from '.';
import { TimelineId, TimelineTabs } from '../../../../../common/types/timeline';
import { TimelineTypeEnum } from '../../../../../common/api/timeline';
import { useEsqlAvailability } from '../../../../common/hooks/esql/use_esql_availability';
import { render, screen, waitFor } from '@testing-library/react';
import { useUserPrivileges } from '../../../../common/components/user_privileges';

jest.mock('../../../../common/hooks/use_license');
jest.mock('../../../../common/components/user_privileges');

const mockUseUiSetting = jest.fn().mockReturnValue([false]);
jest.mock('@kbn/kibana-react-plugin/public', () => {
  const original = jest.requireActual('@kbn/kibana-react-plugin/public');
  return {
    ...original,
    useUiSetting$: () => mockUseUiSetting(),
  };
});

jest.mock('react-router-dom', () => {
  const original = jest.requireActual('react-router-dom');
  return {
    ...original,
    useLocation: () => ({}),
  };
});

jest.mock('../../../../common/hooks/esql/use_esql_availability', () => ({
  useEsqlAvailability: jest.fn().mockReturnValue({
    isEsqlAdvancedSettingEnabled: true,
  }),
}));

const useEsqlAvailabilityMock = useEsqlAvailability as jest.Mock;

const defaultProps = {
  renderCellValue: () => {
    return null;
  },
  rowRenderers: [],
  timelineId: TimelineId.test,
  timelineType: TimelineTypeEnum.default,
  timelineDescription: '',
};

describe('Timeline', () => {
  describe('esql tab', () => {
    const esqlTabSubj = `timelineTabs-${TimelineTabs.esql}`;

    it('should show the esql tab', () => {
      render(
        <TestProviders>
          <TabsContent {...defaultProps} />
        </TestProviders>
      );
      expect(screen.getByTestId(esqlTabSubj)).toBeVisible();
    });

    describe('no existing esql query is present', () => {
      it('should not show the esql tab when the advanced setting is disabled', async () => {
        useEsqlAvailabilityMock.mockReturnValue({
          isEsqlAdvancedSettingEnabled: false,
        });
        render(
          <TestProviders>
            <TabsContent {...defaultProps} />
          </TestProviders>
        );

        await waitFor(() => {
          expect(screen.queryByTestId(esqlTabSubj)).toBeNull();
        });
      });
    });

    describe('existing esql query is present', () => {
      let mockStore: ReturnType<typeof createMockStore>;
      beforeEach(() => {
        const stateWithSavedSearchId = structuredClone(mockGlobalState);
        stateWithSavedSearchId.timeline.timelineById[TimelineId.test].savedSearchId = 'test-id';
        mockStore = createMockStore(stateWithSavedSearchId);
      });

      it('should show the esql tab when the advanced setting is disabled', async () => {
        useEsqlAvailabilityMock.mockReturnValue({
          isESQLTabInTimelineEnabled: false,
        });

        render(
          <TestProviders store={mockStore}>
            <TabsContent {...defaultProps} />
          </TestProviders>
        );

        await waitFor(() => {
          expect(screen.queryByTestId(esqlTabSubj)).toBeVisible();
        });
      });
    });
  });

  describe('Super Timeline mode', () => {
    let mockStore: ReturnType<typeof createMockStore>;
    beforeEach(() => {
      const superState = structuredClone(mockGlobalState);
      superState.timeline.timelineById[TimelineId.test].isSuperTimeline = true;
      mockStore = createMockStore(superState);
    });

    it('hides the ESQL tab when isSuperTimeline is true', async () => {
      render(
        <TestProviders store={mockStore}>
          <TabsContent {...defaultProps} />
        </TestProviders>
      );
      await waitFor(() => {
        expect(screen.queryByTestId(`timelineTabs-${TimelineTabs.esql}`)).toBeNull();
      });
    });

    it('hides the EQL tab when isSuperTimeline is true', async () => {
      render(
        <TestProviders store={mockStore}>
          <TabsContent {...defaultProps} />
        </TestProviders>
      );
      await waitFor(() => {
        expect(screen.queryByTestId(`timelineTabs-${TimelineTabs.eql}`)).toBeNull();
      });
    });
  });

  describe('privileges', () => {
    it('should show notes and pinned tabs for users with the required privileges', () => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        timelinePrivileges: { read: true },
        notesPrivileges: { read: true },
      });

      render(
        <TestProviders>
          <TabsContent {...defaultProps} />
        </TestProviders>
      );
      expect(screen.getByTestId('timelineTabs-notes')).not.toBeDisabled();
      expect(screen.getByTestId('timelineTabs-pinned')).not.toBeDisabled();
    });

    it('should not show notes and pinned tabs for users with the insufficient privileges', () => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        timelinePrivileges: { read: false },
        notesPrivileges: { read: false },
      });

      render(
        <TestProviders>
          <TabsContent {...defaultProps} />
        </TestProviders>
      );
      expect(screen.getByTestId('timelineTabs-notes')).toBeDisabled();
      expect(screen.getByTestId('timelineTabs-pinned')).toBeDisabled();
    });
  });
});
