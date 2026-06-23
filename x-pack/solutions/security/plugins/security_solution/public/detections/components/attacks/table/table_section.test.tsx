/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';
import type { GroupingBucket, ParsedGroupingAggregation } from '@kbn/grouping/src';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';

import { TestProviders } from '../../../../common/mock';
import type { DataView } from '@kbn/data-views-plugin/common';
import {
  ATTACKS_TABLE_SORT_STORAGE_KEY,
  TABLE_SECTION_TEST_ID,
  TableSection,
} from './table_section';
import { useUserData } from '../../user_info';
import { useListsConfig } from '../../../containers/detection_engine/lists/use_lists_config';
import { useGetDefaultGroupTitleRenderers } from '../../../hooks/attacks/use_get_default_group_title_renderers';
import { useAttackGroupHandler } from '../../../hooks/attacks/use_attack_group_handler';
import { GroupedAlertsTable } from '../../alerts_table/alerts_grouping';
import type { AlertsGroupingAggregation } from '../../alerts_table/grouping_settings/types';
import { ALERT_ATTACK_IDS } from '../../../../../common/field_maps/field_names';
import { groupingOptions, groupingSettings } from './grouping_settings/grouping_configs';
import { EmptyResultsPrompt } from './empty_results_prompt';
import { useGroupStats } from './grouping_settings/use_group_stats';
import { useKibana } from '../../../../common/lib/kibana';
import { AttacksEventTypes } from '../../../../common/lib/telemetry';
import { useLocalStorage } from '../../../../common/components/local_storage';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { useDefaultDocumentFlyoutProperties } from '../../../../flyout_v2/shared/hooks/use_default_flyout_properties';

jest.mock('../../../../common/components/local_storage', () => ({
  useLocalStorage: jest.fn(),
}));
jest.mock('../../../../common/lib/kibana');
jest.mock('@kbn/expandable-flyout');
jest.mock('../../user_info');
jest.mock('../../../containers/detection_engine/lists/use_lists_config');
jest.mock('../../../hooks/attacks/use_get_default_group_title_renderers');
jest.mock('../../../hooks/attacks/use_attack_group_handler');
jest.mock('../../alerts_table/alerts_grouping', () => ({
  ...jest.requireActual('../../alerts_table/alerts_grouping'),
  GroupedAlertsTable: jest.fn(),
}));
jest.mock('./empty_results_prompt', () => ({
  EmptyResultsPrompt: jest.fn(() => <div data-test-subj="mock-empty-results-prompt" />),
}));
jest.mock('./attacks_view_options_popover', () => ({
  AttacksViewOptionsPopover: jest.fn(
    ({ showAnonymized, onToggleShowAnonymized, showAttacksOnly, onToggleShowAttacksOnly }) => (
      <div data-test-subj="mock-attacks-view-options-popover">
        <button
          type="button"
          data-test-subj="mock-toggle-anonymized"
          onClick={onToggleShowAnonymized}
          role="switch"
          aria-checked={showAnonymized}
        >
          {'Anonymized'}
        </button>
        <button
          type="button"
          data-test-subj="mock-toggle-attacks-only"
          onClick={onToggleShowAttacksOnly}
          role="switch"
          aria-checked={showAttacksOnly}
        >
          {'Attacks Only'}
        </button>
      </div>
    )
  ),
}));
jest.mock('./grouping_settings/use_group_stats');
jest.mock('../../../../common/hooks/use_experimental_features');
jest.mock('../../../../flyout_v2/shared/hooks/use_default_flyout_properties');
jest.mock('../../../../flyout_v2/shared/components/flyout_provider', () => ({
  flyoutProviders: jest.fn(({ children }: { children: React.ReactNode }) => (
    <div data-test-subj="flyout-providers">{children}</div>
  )),
}));
jest.mock('../../../../flyout_v2/attack/main/attack_flyout_wrapper', () => ({
  AttackFlyoutWrapper: (props: unknown) => (
    <div data-test-subj="attack-flyout-wrapper">{JSON.stringify(props)}</div>
  ),
}));
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useStore: () => ({ getState: jest.fn(), dispatch: jest.fn(), subscribe: jest.fn() }),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({ push: jest.fn() }),
}));

const dataView: DataView = createStubDataView({
  spec: { title: '.alerts-security.alerts-default' },
});

const mockUseGetDefaultGroupTitleRenderers = useGetDefaultGroupTitleRenderers as jest.Mock;
const mockUseAttackGroupHandler = useAttackGroupHandler as jest.Mock;
const mockGroupedAlertsTable = GroupedAlertsTable as unknown as jest.Mock;
const mockEmptyResultsPrompt = EmptyResultsPrompt as unknown as jest.Mock;
const mockUseExpandableFlyoutApi = useExpandableFlyoutApi as jest.Mock;
const mockUseGroupStats = useGroupStats as jest.Mock;

const reportEvent = jest.fn();
const mockOpenSystemFlyout = jest.fn();

const defaultProps: Parameters<typeof TableSection>[0] = {
  assignees: [],
  pageFilters: [],
  statusFilter: [],
  dataView,
  selectedConnectorNames: [],
  selectedTypes: [],
  openSchedulesFlyout: jest.fn(),
};

describe('<TableSection />', () => {
  beforeEach(() => {
    (useLocalStorage as jest.Mock).mockReturnValue([
      [{ latestTimestamp: { order: 'desc' } }],
      jest.fn(),
    ]);

    (useKibana as jest.Mock).mockReturnValue({
      services: {
        telemetry: {
          reportEvent,
        },
        overlays: {
          openSystemFlyout: mockOpenSystemFlyout,
        },
      },
    });
    (useIsExperimentalFeatureEnabled as jest.Mock).mockReturnValue(false);
    (useDefaultDocumentFlyoutProperties as jest.Mock).mockReturnValue({
      maxWidth: 1200,
      minWidth: 400,
      ownFocus: false,
      paddingSize: 'm',
      resizable: true,
      size: 's',
    });
    mockUseGetDefaultGroupTitleRenderers.mockReturnValue({
      defaultGroupTitleRenderers: jest.fn(),
    });
    mockUseAttackGroupHandler.mockReturnValue({
      getAttack: jest.fn(),
      isLoading: false,
    });
    mockUseGroupStats.mockReturnValue({
      aggregations: jest.fn(),
      renderer: jest.fn(),
    });
    mockGroupedAlertsTable.mockImplementation((props) => (
      <div data-test-subj="mock-grouped-alerts-table">
        {props.additionalToolbarControls?.map((control: React.ReactNode, index: number) => (
          <React.Fragment key={index}>{control}</React.Fragment>
        ))}
        {props.emptyGroupingComponent}
      </div>
    ));
    mockUseExpandableFlyoutApi.mockReturnValue({
      openFlyout: jest.fn(),
    });
    (useUserData as jest.Mock).mockReturnValue([
      {
        loading: false,
      },
    ]);
    (useListsConfig as jest.Mock).mockReturnValue({
      loading: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', async () => {
    const { getByTestId } = render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(getByTestId(TABLE_SECTION_TEST_ID)).toBeInTheDocument();
      expect(getByTestId('mock-grouped-alerts-table')).toBeInTheDocument();
    });
  });

  it('should pass isLoading from useAttackGroupHandler to useGetDefaultGroupTitleRenderers', async () => {
    mockUseAttackGroupHandler.mockReturnValue({
      getAttack: jest.fn(),
      isLoading: true,
    });

    render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(mockUseGetDefaultGroupTitleRenderers).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: true,
        })
      );
    });
  });

  it('should report telemetry when openAttackDetailsFlyout is called', async () => {
    mockUseAttackGroupHandler.mockReturnValue({
      getAttack: jest.fn().mockReturnValue({ id: 'attack-1' }),
      isLoading: false,
    });

    render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(mockUseGetDefaultGroupTitleRenderers).toHaveBeenCalled();
    });

    const { openAttackDetailsFlyout } = mockUseGetDefaultGroupTitleRenderers.mock.calls[0][0];
    openAttackDetailsFlyout('group-1', {});

    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.DetailsFlyoutOpened, {
      id: 'attack-1',
      source: 'attacks_page_table',
    });
  });

  it('should call openFlyout (legacy) when newFlyoutSystemEnabled is false', async () => {
    const mockOpenFlyout = jest.fn();
    mockUseExpandableFlyoutApi.mockReturnValue({ openFlyout: mockOpenFlyout });
    mockUseAttackGroupHandler.mockReturnValue({
      getAttack: jest.fn().mockReturnValue({ id: 'attack-1' }),
      isLoading: false,
    });

    render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(mockUseGetDefaultGroupTitleRenderers).toHaveBeenCalled();
    });

    const { openAttackDetailsFlyout } = mockUseGetDefaultGroupTitleRenderers.mock.calls[0][0];
    openAttackDetailsFlyout('group-1', {});

    expect(mockOpenFlyout).toHaveBeenCalledWith({
      right: {
        id: expect.any(String),
        params: {
          attackId: 'attack-1',
          indexName: '.alerts-security.alerts-default',
        },
      },
    });
    expect(mockOpenSystemFlyout).not.toHaveBeenCalled();
  });

  it('should call openSystemFlyout with AttackFlyoutWrapper when newFlyoutSystemEnabled is true', async () => {
    (useIsExperimentalFeatureEnabled as jest.Mock).mockReturnValue(true);
    mockUseAttackGroupHandler.mockReturnValue({
      getAttack: jest.fn().mockReturnValue({ id: 'attack-1' }),
      isLoading: false,
    });

    render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(mockUseGetDefaultGroupTitleRenderers).toHaveBeenCalled();
    });

    const { openAttackDetailsFlyout } = mockUseGetDefaultGroupTitleRenderers.mock.calls[0][0];
    openAttackDetailsFlyout('group-1', {});

    expect(mockOpenSystemFlyout).toHaveBeenCalled();
    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.DetailsFlyoutOpened, {
      id: 'attack-1',
      source: 'attacks_page_table',
    });
  });

  it('should pass groupingOptions and groupingSettings to GroupedAlertsTable', async () => {
    render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(GroupedAlertsTable).toHaveBeenCalled();
      const [props] = (GroupedAlertsTable as unknown as jest.Mock).mock.calls[0];
      expect(props.defaultGroupingOptions).toEqual(groupingOptions);
      expect(props.settings).toEqual(groupingSettings);
    });
  });

  it('should pass EmptyResultsPrompt to GroupedAlertsTable', async () => {
    const { getByTestId } = render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(getByTestId('mock-empty-results-prompt')).toBeInTheDocument();
    });

    expect(mockEmptyResultsPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ openSchedulesFlyout: defaultProps.openSchedulesFlyout }),
      expect.anything()
    );
  });

  it('should call useGetDefaultGroupTitleRenderers with attackIds from onAggregationsChange when groupingLevel is 0', async () => {
    let onAggregationsChange: (
      aggs: ParsedGroupingAggregation<AlertsGroupingAggregation>,
      groupingLevel?: number
    ) => void = () => {};
    mockGroupedAlertsTable.mockImplementation((props) => {
      onAggregationsChange = props.onAggregationsChange;
      return <div data-test-subj="mock-grouped-alerts-table" />;
    });

    render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    const mockAggs: ParsedGroupingAggregation<AlertsGroupingAggregation> = {
      groupByFields: {
        buckets: [
          {
            key: ['attack-id-1'],
            key_as_string: 'attack-id-1',
            doc_count: 1,
            selectedGroup: ALERT_ATTACK_IDS,
            isNullGroup: false,
          } as GroupingBucket<AlertsGroupingAggregation>,
        ],
      },
    };

    await waitFor(() => {
      onAggregationsChange(mockAggs, 0);
    });

    await waitFor(() => {
      expect(mockUseAttackGroupHandler).toHaveBeenCalledWith({
        attackIds: ['attack-id-1'],
      });
    });
  });

  it('should not call useAttackGroupHandler with new IDs when groupingLevel is not 0', async () => {
    let onAggregationsChange: (
      aggs: ParsedGroupingAggregation<AlertsGroupingAggregation>,
      groupingLevel?: number
    ) => void = () => {};
    mockGroupedAlertsTable.mockImplementation((props) => {
      onAggregationsChange = props.onAggregationsChange;
      return <div data-test-subj="mock-grouped-alerts-table" />;
    });

    render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    const mockAggs: ParsedGroupingAggregation<AlertsGroupingAggregation> = {
      groupByFields: {
        buckets: [
          {
            key: ['attack-id-1'],
            key_as_string: 'attack-id-1',
            doc_count: 1,
            selectedGroup: ALERT_ATTACK_IDS,
            isNullGroup: false,
          } as GroupingBucket<AlertsGroupingAggregation>,
        ],
      },
    };

    await waitFor(() => {
      onAggregationsChange(mockAggs, 1);
    });

    await waitFor(() => {
      expect(mockUseAttackGroupHandler).not.toHaveBeenCalledWith({
        attackIds: ['attack-id-1'],
      });
    });
  });

  it('should render the table while things user data is loading', async () => {
    (useUserData as jest.Mock).mockReturnValue([
      {
        loading: true,
      },
    ]);
    (useListsConfig as jest.Mock).mockReturnValue({
      loading: false,
    });

    render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      const [props] = (GroupedAlertsTable as unknown as jest.Mock).mock.calls[0];
      expect(props.loading).toBe(true);
    });
  });

  it('should render the table while things list config is loading', async () => {
    (useUserData as jest.Mock).mockReturnValue([
      {
        loading: false,
      },
    ]);
    (useListsConfig as jest.Mock).mockReturnValue({
      loading: true,
    });

    render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      const [props] = (GroupedAlertsTable as unknown as jest.Mock).mock.calls[0];
      expect(props.loading).toBe(true);
    });
  });

  it('should pass correct sort object to GroupedAlertsTable', async () => {
    (useUserData as jest.Mock).mockReturnValue([{ loading: false }]);
    (useListsConfig as jest.Mock).mockReturnValue({ loading: false });

    render(
      <TestProviders>
        <TableSection {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      const [props] = (GroupedAlertsTable as unknown as jest.Mock).mock.calls[0];
      expect(props.sort).toEqual([{ latestTimestamp: { order: 'desc' } }]);
    });
  });

  describe('view options', () => {
    beforeEach(() => {
      (useUserData as jest.Mock).mockReturnValue([{ loading: false }]);
      (useListsConfig as jest.Mock).mockReturnValue({ loading: false });
    });

    it('should render the view options popover', async () => {
      const { getByTestId } = render(
        <TestProviders>
          <TableSection {...defaultProps} />
        </TestProviders>
      );

      await waitFor(() => {
        expect(getByTestId('mock-attacks-view-options-popover')).toBeInTheDocument();
      });
    });

    describe('showAnonymized', () => {
      it('should default to unchecked (false)', async () => {
        const { getByTestId } = render(
          <TestProviders>
            <TableSection {...defaultProps} />
          </TestProviders>
        );

        await waitFor(() => {
          const toggle = getByTestId('mock-toggle-anonymized');
          expect(toggle).toHaveAttribute('aria-checked', 'false');
        });
      });

      it('should toggle state when clicked', async () => {
        const { getByTestId } = render(
          <TestProviders>
            <TableSection {...defaultProps} />
          </TestProviders>
        );

        const toggle = await waitFor(() => getByTestId('mock-toggle-anonymized'));

        await act(async () => {
          toggle.click();
        });

        await waitFor(() => {
          expect(toggle).toHaveAttribute('aria-checked', 'true');
        });
      });

      it('should pass showAnonymized state to useGetDefaultGroupTitleRenderers', async () => {
        const { getByTestId } = render(
          <TestProviders>
            <TableSection {...defaultProps} />
          </TestProviders>
        );

        await waitFor(() => {
          expect(mockUseGetDefaultGroupTitleRenderers).toHaveBeenCalledWith(
            expect.objectContaining({ showAnonymized: false })
          );
        });

        const toggle = getByTestId('mock-toggle-anonymized');
        await act(async () => {
          toggle.click();
        });

        await waitFor(() => {
          expect(mockUseGetDefaultGroupTitleRenderers).toHaveBeenCalledWith(
            expect.objectContaining({ showAnonymized: true })
          );
        });
      });
    });

    describe('showAttacksOnly', () => {
      it('should default to checked (true)', async () => {
        const { getByTestId } = render(
          <TestProviders>
            <TableSection {...defaultProps} />
          </TestProviders>
        );

        await waitFor(() => {
          const toggle = getByTestId('mock-toggle-attacks-only');
          expect(toggle).toHaveAttribute('aria-checked', 'true');
        });
      });

      it('should toggle state when clicked', async () => {
        const { getByTestId } = render(
          <TestProviders>
            <TableSection {...defaultProps} />
          </TestProviders>
        );

        const toggle = await waitFor(() => getByTestId('mock-toggle-attacks-only'));

        await act(async () => {
          toggle.click();
        });

        await waitFor(() => {
          expect(toggle).toHaveAttribute('aria-checked', 'false');
        });
      });

      it('should add exists filter for ALERT_ATTACK_IDS when true', async () => {
        render(
          <TestProviders>
            <TableSection {...defaultProps} />
          </TestProviders>
        );

        await waitFor(() => {
          expect(GroupedAlertsTable).toHaveBeenCalled();
          const [props] = (GroupedAlertsTable as unknown as jest.Mock).mock.calls[
            (GroupedAlertsTable as unknown as jest.Mock).mock.calls.length - 1
          ];
          const hasFilter = props.defaultFilters.some(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (f: any) =>
              f.meta?.key === ALERT_ATTACK_IDS &&
              f.meta?.type === 'exists' &&
              f.query?.exists?.field === ALERT_ATTACK_IDS
          );
          expect(hasFilter).toBe(true);
        });
      });

      it('should remove exists filter for ALERT_ATTACK_IDS when toggled false', async () => {
        const { getByTestId } = render(
          <TestProviders>
            <TableSection {...defaultProps} />
          </TestProviders>
        );

        const toggle = await waitFor(() => getByTestId('mock-toggle-attacks-only'));

        await act(async () => {
          toggle.click();
        });

        await waitFor(() => {
          const [props] = (GroupedAlertsTable as unknown as jest.Mock).mock.calls[
            (GroupedAlertsTable as unknown as jest.Mock).mock.calls.length - 1
          ];
          const hasFilter = props.defaultFilters.some(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (f: any) => f.meta?.key === ALERT_ATTACK_IDS
          );
          expect(hasFilter).toBe(false);
        });
      });
    });
  });

  describe('enforced groups', () => {
    it('initializes useLocalStorage with correct key and default value', () => {
      render(
        <TestProviders>
          <TableSection {...defaultProps} />
        </TestProviders>
      );

      expect(useLocalStorage).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ATTACKS_TABLE_SORT_STORAGE_KEY,
          defaultValue: [{ latestTimestamp: { order: 'desc' } }],
        })
      );
    });

    it('should pass all grouping settings including enforcedGroups', async () => {
      render(
        <TestProviders>
          <TableSection {...defaultProps} />
        </TestProviders>
      );

      await waitFor(() => {
        expect(GroupedAlertsTable).toHaveBeenCalled();
        const [props] = (GroupedAlertsTable as unknown as jest.Mock).mock.calls[0];
        expect(props.settings).toMatchObject({
          hideNoneOption: true,
          hideCustomFieldOption: true,
          hideOptionsTitle: true,
          enforcedGroups: [ALERT_ATTACK_IDS],
        });
      });
    });

    it('passes correct accordionExtraActionGroupStats to GroupedAlertsTable', () => {
      const mockStats = { aggregations: jest.fn(), renderer: jest.fn() };
      mockUseGroupStats.mockReturnValue(mockStats);

      render(
        <TestProviders>
          <TableSection {...defaultProps} />
        </TestProviders>
      );

      expect(mockGroupedAlertsTable).toHaveBeenCalledWith(
        expect.objectContaining({
          accordionExtraActionGroupStats: mockStats,
        }),
        expect.anything()
      );

      expect(mockUseGroupStats).toHaveBeenCalledWith({
        getAttack: expect.any(Function),
      });
    });
  });
});
