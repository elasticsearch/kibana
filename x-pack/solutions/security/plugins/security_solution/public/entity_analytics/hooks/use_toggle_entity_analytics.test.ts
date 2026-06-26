/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';

import { useToggleEntityAnalytics } from './use_toggle_entity_analytics';

const mockAddSuccess = jest.fn();
const mockAddError = jest.fn();
jest.mock('../../common/hooks/use_app_toasts', () => ({
  useAppToasts: () => ({ addSuccess: mockAddSuccess, addError: mockAddError }),
}));

const mockInitRiskEngine = jest.fn().mockResolvedValue({});
const mockEnableRiskEngine = jest.fn().mockResolvedValue({});
const mockDisableRiskEngine = jest.fn().mockResolvedValue({});

let mockInitRiskEngineMutationReturn: {
  mutateAsync: jest.Mock;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

jest.mock('../api/hooks/use_init_risk_engine_mutation', () => ({
  useInitRiskEngineMutation: () => mockInitRiskEngineMutationReturn,
}));

jest.mock('../api/hooks/use_enable_risk_engine_mutation', () => ({
  useEnableRiskEngineMutation: () => ({
    mutateAsync: mockEnableRiskEngine,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('../api/hooks/use_disable_risk_engine_mutation', () => ({
  useDisableRiskEngineMutation: () => ({
    mutateAsync: mockDisableRiskEngine,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

const mockInstallEntityStore = jest.fn().mockResolvedValue({});
const mockStartEntityStore = jest.fn().mockResolvedValue({});
const mockStopEntityStore = jest.fn().mockResolvedValue({});

let mockEntityStoreStatusReturn: {
  data: { status: string; engines: unknown[] } | undefined;
  isLoading?: boolean;
};

jest.mock('../components/entity_store/hooks/use_entity_store', () => ({
  useInstallEntityStoreMutation: () => ({
    mutateAsync: mockInstallEntityStore,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useStartEntityStoreMutation: () => ({
    mutateAsync: mockStartEntityStore,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useStopEntityStoreMutation: () => ({
    mutateAsync: mockStopEntityStore,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useEntityStoreStatus: () => mockEntityStoreStatusReturn,
}));

const mockInvalidateRiskEngineSettingsQuery = jest.fn().mockResolvedValue(undefined);
jest.mock('../components/risk_score_management/hooks/use_risk_engine_settings_query', () => ({
  useInvalidateRiskEngineSettingsQuery: () => mockInvalidateRiskEngineSettingsQuery,
}));

let mockRiskEngineStatusReturn: {
  data: { risk_engine_status: string } | undefined;
  isFetching: boolean;
  isLoading?: boolean;
};

const mockUseRiskEngineStatus = jest.fn(() => mockRiskEngineStatusReturn);
jest.mock('../api/hooks/use_risk_engine_status', () => ({
  useRiskEngineStatus: (...args: unknown[]) => mockUseRiskEngineStatus(...(args as [])),
  useInvalidateRiskEngineStatusQuery: () => jest.fn(),
}));

const mockSaveSettings = jest.fn().mockResolvedValue(undefined);
const defaultOptions = {
  selectedSettingsMatchSavedSettings: true,
  onSaveSettings: mockSaveSettings,
  isSavingSettings: false,
};

describe('useToggleEntityAnalytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitRiskEngineMutationReturn = {
      mutateAsync: mockInitRiskEngine,
      isLoading: false,
      isError: false,
      error: null,
    };
    mockRiskEngineStatusReturn = {
      data: { risk_engine_status: 'NOT_INSTALLED' },
      isFetching: false,
      isLoading: false,
    };
    mockEntityStoreStatusReturn = {
      data: { status: 'not_installed', engines: [] },
      isLoading: false,
    };
  });

  describe('toggle ON from not_installed', () => {
    it('installs entity store and inits risk engine without calling start', async () => {
      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockInstallEntityStore).toHaveBeenCalledTimes(1);
      expect(mockStartEntityStore).not.toHaveBeenCalled();
      expect(mockInitRiskEngine).toHaveBeenCalledTimes(1);

      const entityStoreCallOrder = mockInstallEntityStore.mock.invocationCallOrder[0];
      const riskEngineCallOrder = mockInitRiskEngine.mock.invocationCallOrder[0];
      expect(entityStoreCallOrder).toBeLessThan(riskEngineCallOrder);

      expect(mockAddSuccess).toHaveBeenCalled();
    });

    it('saves dirty settings before init', async () => {
      const { result } = renderHook(() =>
        useToggleEntityAnalytics({
          ...defaultOptions,
          selectedSettingsMatchSavedSettings: false,
        })
      );

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockSaveSettings).toHaveBeenCalledTimes(1);
      expect(mockInitRiskEngine).toHaveBeenCalledTimes(1);

      const saveOrder = mockSaveSettings.mock.invocationCallOrder[0];
      const initOrder = mockInitRiskEngine.mock.invocationCallOrder[0];
      expect(saveOrder).toBeLessThan(initOrder);
    });
  });

  describe('toggle ON from stopped', () => {
    beforeEach(() => {
      mockRiskEngineStatusReturn = {
        data: { risk_engine_status: 'DISABLED' },
        isFetching: false,
      };
      mockEntityStoreStatusReturn = {
        data: { status: 'stopped', engines: [] },
      };
    });

    it('starts entity store and enables risk engine', async () => {
      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockStartEntityStore).toHaveBeenCalledTimes(1);
      expect(mockEnableRiskEngine).toHaveBeenCalledTimes(1);
      expect(mockInitRiskEngine).not.toHaveBeenCalled();
      expect(mockInstallEntityStore).not.toHaveBeenCalled();
    });

    it('skips risk engine when it is already enabled', async () => {
      mockRiskEngineStatusReturn = {
        data: { risk_engine_status: 'ENABLED' },
        isFetching: false,
      };

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockStartEntityStore).toHaveBeenCalledTimes(1);
      expect(mockEnableRiskEngine).not.toHaveBeenCalled();
      expect(mockInitRiskEngine).not.toHaveBeenCalled();
    });
  });

  describe('toggle ON from error state', () => {
    it('starts entity store without reinstalling when status is error', async () => {
      mockRiskEngineStatusReturn = {
        data: { risk_engine_status: 'DISABLED' },
        isFetching: false,
      };
      mockEntityStoreStatusReturn = { data: { status: 'error', engines: [] } };

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockInstallEntityStore).not.toHaveBeenCalled();
      expect(mockStartEntityStore).toHaveBeenCalledTimes(1);
    });
  });

  describe('toggle OFF from running', () => {
    it('only stops entity store and ignores risk engine state', async () => {
      mockRiskEngineStatusReturn = {
        data: { risk_engine_status: 'ENABLED' },
        isFetching: false,
      };
      mockEntityStoreStatusReturn = {
        data: { status: 'running', engines: [] },
      };

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockStopEntityStore).toHaveBeenCalledTimes(1);
      expect(mockDisableRiskEngine).not.toHaveBeenCalled();
      expect(mockAddSuccess).toHaveBeenCalled();
    });
  });

  describe('error reporting', () => {
    it('surfaces risk engine init errors via the errors object', () => {
      mockInitRiskEngineMutationReturn = {
        mutateAsync: mockInitRiskEngine,
        isLoading: false,
        isError: true,
        error: { body: { message: 'Risk engine init failed' } },
      };

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      expect(result.current.errors.riskEngine).toContain('Risk engine init failed');
      expect(result.current.errors.entityStore).toHaveLength(0);
    });

    it('uses fallback message when error has no body', () => {
      mockInitRiskEngineMutationReturn = {
        mutateAsync: mockInitRiskEngine,
        isLoading: false,
        isError: true,
        error: new Error('network failure'),
      };

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      expect(result.current.errors.riskEngine).toContain('An unknown error occurred');
    });
  });

  describe('isLoading guard', () => {
    it('is a no-op when isSavingSettings makes isLoading true', async () => {
      const { result } = renderHook(() =>
        useToggleEntityAnalytics({
          ...defaultOptions,
          isSavingSettings: true,
        })
      );

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockInitRiskEngine).not.toHaveBeenCalled();
      expect(mockInstallEntityStore).not.toHaveBeenCalled();
      expect(mockStopEntityStore).not.toHaveBeenCalled();
    });
  });

  describe('concurrent toggle guard', () => {
    it('blocks a second toggle while the first is still in flight', async () => {
      let resolveInit: () => void;
      mockInitRiskEngine.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveInit = resolve;
        })
      );

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      let firstToggle: Promise<void>;
      await act(async () => {
        firstToggle = result.current.toggle();
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockInitRiskEngine).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveInit!();
        await firstToggle!;
      });
    });
  });

  describe('onSaveSettings failure', () => {
    it('does not call initRiskEngine and shows error toast when onSaveSettings rejects', async () => {
      mockSaveSettings.mockRejectedValueOnce(new Error('save failed'));

      const { result } = renderHook(() =>
        useToggleEntityAnalytics({
          ...defaultOptions,
          selectedSettingsMatchSavedSettings: false,
        })
      );

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockSaveSettings).toHaveBeenCalledTimes(1);
      expect(mockInitRiskEngine).not.toHaveBeenCalled();
      expect(mockAddSuccess).not.toHaveBeenCalled();
      expect(mockAddError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ title: expect.any(String) })
      );
    });
  });

  describe('error toast on mutation failure', () => {
    it('shows error toast when initRiskEngine rejects', async () => {
      mockInitRiskEngine.mockRejectedValueOnce(new Error('init failed'));

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockAddSuccess).not.toHaveBeenCalled();
      expect(mockAddError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ title: expect.any(String) })
      );
    });

    it('shows error toast when installEntityStore rejects', async () => {
      mockInstallEntityStore.mockRejectedValueOnce(new Error('store install failed'));

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockAddError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ title: expect.any(String) })
      );
    });
  });

  // Regression: see https://github.com/elastic/kibana/issues/259664
  // Before this guard, clicking the toggle while the entity-store status query was
  // still pending caused enableEntityStore() to silently no-op (entityStoreStatus
  // was `undefined`, so neither the `not_installed` nor `stopped`/`error` branch
  // matched). Risk engine init still fired, leaving the user with risk-engine on
  // and entity-store stuck at not_installed.
  describe('isStatusLoading guard', () => {
    it('exposes isStatusLoading=true when entity store status query is still loading', () => {
      mockEntityStoreStatusReturn = { data: undefined, isLoading: true };

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      expect(result.current.isStatusLoading).toBe(true);
    });

    it('exposes isStatusLoading=true when risk engine status query is still loading', () => {
      mockRiskEngineStatusReturn = {
        data: undefined,
        isFetching: true,
        isLoading: true,
      };

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      expect(result.current.isStatusLoading).toBe(true);
    });

    it('exposes isStatusLoading=false once both status queries have data', () => {
      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      expect(result.current.isStatusLoading).toBe(false);
    });

    it('does not call any mutation when toggled while status queries are still loading', async () => {
      mockEntityStoreStatusReturn = { data: undefined, isLoading: true };
      mockRiskEngineStatusReturn = { data: undefined, isFetching: true, isLoading: true };

      const { result } = renderHook(() => useToggleEntityAnalytics(defaultOptions));

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockInstallEntityStore).not.toHaveBeenCalled();
      expect(mockStartEntityStore).not.toHaveBeenCalled();
      expect(mockStopEntityStore).not.toHaveBeenCalled();
      expect(mockInitRiskEngine).not.toHaveBeenCalled();
      expect(mockEnableRiskEngine).not.toHaveBeenCalled();
      expect(mockDisableRiskEngine).not.toHaveBeenCalled();
      expect(mockAddSuccess).not.toHaveBeenCalled();
      expect(mockAddError).not.toHaveBeenCalled();
    });
  });
});
