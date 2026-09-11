/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import { useScheduleView } from './use_schedule_view';
import { useScheduleApi } from '../schedule/logic/use_schedule_api';
import { useKibana } from '../../../../common/lib/kibana';
import { useDataView } from '../../../../data_view_manager/hooks/use_data_view';
import { TestProviders } from '../../../../common/mock';
import { mockFindAttackDiscoverySchedules } from '../../mock/mock_find_attack_discovery_schedules';
import { triggersActionsUiMock } from '@kbn/triggers-actions-ui-plugin/public/mocks';
import { ATTACK_DISCOVERY_FEATURE_ID } from '../../../../../common/constants';

jest.mock('react-router', () => ({
  matchPath: jest.fn(),
  useLocation: jest.fn().mockReturnValue({
    search: '',
  }),
  withRouter: jest.fn(),
}));
jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../data_view_manager/hooks/use_data_view');
jest.mock('../schedule/logic/use_schedule_api');
jest.mock('../schedule/create_flyout', () => ({
  CreateFlyout: ({ onClose }: { onClose: () => void }) => (
    <div data-test-subj="scheduleCreateFlyout">
      <button type="button" data-test-subj="close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;
const mockUseDataView = useDataView as jest.MockedFunction<typeof useDataView>;
const mockUseScheduleApi = useScheduleApi as jest.MockedFunction<typeof useScheduleApi>;

const mockUseFindSchedules = jest.fn();
const mockMutateAsync = jest.fn();
const mockUseCreateSchedule = jest
  .fn()
  .mockReturnValue({ isLoading: false, mutateAsync: mockMutateAsync });
const mockUseDeleteSchedule = jest.fn().mockReturnValue({ mutateAsync: mockMutateAsync });
const mockUseDisableSchedule = jest.fn().mockReturnValue({ mutateAsync: mockMutateAsync });
const mockUseEnableSchedule = jest.fn().mockReturnValue({ mutateAsync: mockMutateAsync });
const mockUseBulkDeleteSchedules = jest.fn().mockReturnValue({ mutateAsync: mockMutateAsync });
const mockUseBulkDisableSchedules = jest.fn().mockReturnValue({ mutateAsync: mockMutateAsync });
const mockUseBulkEnableSchedules = jest.fn().mockReturnValue({ mutateAsync: mockMutateAsync });

const setupUseKibana = (updateAttackDiscoverySchedule = true) => {
  mockUseKibana.mockReturnValue({
    services: {
      application: {
        capabilities: {
          [ATTACK_DISCOVERY_FEATURE_ID]: {
            updateAttackDiscoverySchedule,
          },
        },
      },
      featureFlags: {
        getBooleanValue: jest.fn().mockResolvedValue(false),
      },
      lens: {
        EmbeddableComponent: () => <div data-test-subj="mockEmbeddableComponent" />,
      },
      telemetry: { reportEvent: jest.fn() },
      triggersActionsUi: {
        ...triggersActionsUiMock.createStart(),
      },
      uiSettings: {
        get: jest.fn(),
      },
      unifiedSearch: {
        ui: {
          SearchBar: () => <div data-test-subj="mockSearchBar" />,
        },
      },
    },
  } as unknown as jest.Mocked<ReturnType<typeof useKibana>>);
};

describe('useScheduleView', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    setupUseKibana();

    mockUseDataView.mockReturnValue({
      dataView: { id: 'security', title: 'security' },
      status: 'ready',
    } as unknown as jest.Mocked<ReturnType<typeof useDataView>>);

    mockUseFindSchedules.mockReturnValue({
      data: mockFindAttackDiscoverySchedules,
      isLoading: false,
    });

    mockUseScheduleApi.mockReturnValue({
      isWorkflowsEnabled: false,
      useBulkDeleteSchedules: mockUseBulkDeleteSchedules,
      useBulkDisableSchedules: mockUseBulkDisableSchedules,
      useBulkEnableSchedules: mockUseBulkEnableSchedules,
      useCreateSchedule: mockUseCreateSchedule,
      useDeleteSchedule: mockUseDeleteSchedule,
      useDisableSchedule: mockUseDisableSchedule,
      useEnableSchedule: mockUseEnableSchedule,
      useFindSchedules: mockUseFindSchedules,
    } as unknown as ReturnType<typeof useScheduleApi>);
  });

  it('should return the `empty schedules` page if there are no existing schedules', () => {
    mockUseFindSchedules.mockReturnValue({
      data: { schedules: [], total: 0 },
      isLoading: false,
    });

    const { result } = renderHook(() => useScheduleView());

    render(<TestProviders>{result.current.scheduleView}</TestProviders>);

    expect(screen.getByTestId('emptySchedule')).toBeInTheDocument();
  });

  it('should not return `create new schedule` action button if there are no existing schedules', () => {
    mockUseFindSchedules.mockReturnValue({
      data: { schedules: [], total: 0 },
      isLoading: false,
    });

    const { result } = renderHook(() => useScheduleView());

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    expect(screen.queryByTestId('createSchedule')).not.toBeInTheDocument();
  });

  it('should return the `attack discovery schedules table` if there are existing schedules', () => {
    const { result } = renderHook(() => useScheduleView());

    render(<TestProviders>{result.current.scheduleView}</TestProviders>);

    expect(screen.getByTestId('schedulesTable')).toBeInTheDocument();
  });

  it('should return `create new schedule` action button if there are existing schedules', () => {
    const { result } = renderHook(() => useScheduleView());

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    expect(screen.getByTestId('createSchedule')).toBeInTheDocument();
  });

  it('should show create schedule flyout on `create new schedule` action button click', async () => {
    const { result } = renderHook(() => useScheduleView());

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    expect(screen.getByTestId('createSchedule')).toBeInTheDocument();

    const createButton = screen.getByTestId('createSchedule');
    act(() => {
      fireEvent.click(createButton);
    });

    render(<TestProviders>{result.current.scheduleView}</TestProviders>);
    await waitFor(() => {
      expect(screen.getByTestId('scheduleCreateFlyout')).toBeInTheDocument();
    });
  });

  it('uses useFindSchedules from useScheduleApi (not the hardcoded public API hook)', () => {
    renderHook(() => useScheduleView());

    expect(mockUseFindSchedules).toHaveBeenCalled();
  });

  describe('when workflows feature flag is enabled', () => {
    beforeEach(() => {
      mockUseScheduleApi.mockReturnValue({
        isWorkflowsEnabled: true,
        useBulkDeleteSchedules: mockUseBulkDeleteSchedules,
        useBulkDisableSchedules: mockUseBulkDisableSchedules,
        useBulkEnableSchedules: mockUseBulkEnableSchedules,
        useCreateSchedule: mockUseCreateSchedule,
        useDeleteSchedule: mockUseDeleteSchedule,
        useDisableSchedule: mockUseDisableSchedule,
        useEnableSchedule: mockUseEnableSchedule,
        useFindSchedules: mockUseFindSchedules,
      } as unknown as ReturnType<typeof useScheduleApi>);
    });

    it('shows the schedules table when the workflow find hook returns schedules', () => {
      const { result } = renderHook(() => useScheduleView());

      render(<TestProviders>{result.current.scheduleView}</TestProviders>);

      expect(screen.getByTestId('schedulesTable')).toBeInTheDocument();
    });

    it('shows the empty page when the workflow find hook returns no schedules', () => {
      mockUseFindSchedules.mockReturnValue({
        data: { schedules: [], total: 0 },
        isLoading: false,
      });

      const { result } = renderHook(() => useScheduleView());

      render(<TestProviders>{result.current.scheduleView}</TestProviders>);

      expect(screen.getByTestId('emptySchedule')).toBeInTheDocument();
    });
  });

  describe('transitioning from empty to populated after schedule creation', () => {
    const TestScheduleView: React.FC = () => {
      const { scheduleView } = useScheduleView();

      return <>{scheduleView}</>;
    };

    it('shows EmptyPage when there are no schedules, and SchedulesTable after useFindSchedules returns a schedule', async () => {
      mockUseFindSchedules.mockReturnValue({
        data: { schedules: [], total: 0 },
        isLoading: false,
      });

      const { rerender } = render(
        <TestProviders>
          <TestScheduleView />
        </TestProviders>
      );

      expect(screen.getByTestId('emptySchedule')).toBeInTheDocument();
      expect(screen.queryByTestId('schedulesTable')).not.toBeInTheDocument();

      mockUseFindSchedules.mockReturnValue({
        data: mockFindAttackDiscoverySchedules,
        isLoading: false,
      });

      rerender(
        <TestProviders>
          <TestScheduleView />
        </TestProviders>
      );

      await waitFor(() => {
        expect(screen.getByTestId('schedulesTable')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('emptySchedule')).not.toBeInTheDocument();
    });

    it('renders exactly one CreateFlyout (managed by useScheduleView, not EmptyPage) when clicking Create in the empty state', async () => {
      mockUseFindSchedules.mockReturnValue({
        data: { schedules: [], total: 0 },
        isLoading: false,
      });

      render(
        <TestProviders>
          <TestScheduleView />
        </TestProviders>
      );

      expect(screen.getByTestId('emptySchedule')).toBeInTheDocument();

      const createButton = screen.getByTestId('createSchedule');

      act(() => {
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('scheduleCreateFlyout')).toBeInTheDocument();
      });

      const flyouts = screen.getAllByTestId('scheduleCreateFlyout');

      expect(flyouts).toHaveLength(1);
    });
  });

  describe('refetching schedules after flyout closes', () => {
    const TestScheduleView: React.FC = () => {
      const { scheduleView } = useScheduleView();

      return <>{scheduleView}</>;
    };

    it('calls refetch when the create flyout closes, ensuring the schedule list updates', async () => {
      const mockRefetch = jest.fn();
      mockUseFindSchedules.mockReturnValue({
        data: { schedules: [], total: 0 },
        isLoading: false,
        refetch: mockRefetch,
      });

      render(
        <TestProviders>
          <TestScheduleView />
        </TestProviders>
      );

      expect(screen.getByTestId('emptySchedule')).toBeInTheDocument();

      const createButton = screen.getByTestId('createSchedule');

      await act(async () => {
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('scheduleCreateFlyout')).toBeInTheDocument();
      });

      mockRefetch.mockClear();

      const closeButton = screen.getByTestId('close');

      await act(async () => {
        fireEvent.click(closeButton);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('scheduleCreateFlyout')).not.toBeInTheDocument();
      });

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('update schedule kibana privilege', () => {
    it('should return enabled `create new schedule` action button if update schedule privilege is granted', () => {
      setupUseKibana(true);

      const { result } = renderHook(() => useScheduleView());

      render(<TestProviders>{result.current.actionButtons}</TestProviders>);

      expect(screen.getByTestId('createSchedule')).toBeEnabled();
    });

    it('should return disabled `create new schedule` action button if update schedule privilege is missing', () => {
      setupUseKibana(false);

      const { result } = renderHook(() => useScheduleView());

      render(<TestProviders>{result.current.actionButtons}</TestProviders>);

      expect(screen.getByTestId('createSchedule')).toBeDisabled();
    });

    it('should render missing privileges tooltip if update schedule privilege is missing', async () => {
      setupUseKibana(false);

      const { result } = renderHook(() => useScheduleView());

      render(<TestProviders>{result.current.actionButtons}</TestProviders>);

      const createButton = screen.getByTestId('createSchedule');
      fireEvent.mouseOver(createButton.parentElement as Node);

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('Missing privileges');
    }, 30000);
  });
});
