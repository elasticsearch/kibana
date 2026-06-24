/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { renderHook, act } from '@testing-library/react';
import { useUrlDetail, useSyncUrlDetails, getCardIdFromHash } from './use_url_detail';
import { useHistory } from 'react-router-dom';

// --- Mocks for dependencies ---
jest.mock('@kbn/security-solution-navigation', () => ({
  ...jest.requireActual('@kbn/security-solution-navigation'),
  useNavigateTo: jest.fn(),
  SecurityPageName: { landing: 'landing', siemMigrationsManage: 'siemMigrationsManage' },
}));

jest.mock('./use_stored_state', () => ({
  ...jest.requireActual('./use_stored_state'),
  useStoredUrlDetails: jest.fn(),
}));

jest.mock('./use_topic_id', () => ({
  ...jest.requireActual('./use_topic_id'),
  useTopicId: jest.fn(),
}));

jest.mock('./use_cloud_topic_id', () => ({
  ...jest.requireActual('./use_cloud_topic_id'),
  useCloudTopicId: jest.fn(),
}));

jest.mock('../onboarding_context', () => ({
  ...jest.requireActual('../onboarding_context'),
  useOnboardingContext: jest.fn(),
}));

jest.mock('react-router-dom', () => {
  const originalModule = jest.requireActual('react-router-dom');
  return {
    ...originalModule,
    useHistory: jest.fn(),
  };
});

// Import the mocked modules for type-checking and setting implementations
import { useStoredUrlDetails } from './use_stored_state';
import { useTopicId } from './use_topic_id';
import { useCloudTopicId } from './use_cloud_topic_id';
import { useNavigateTo, SecurityPageName } from '@kbn/security-solution-navigation';
import { useOnboardingContext } from '../onboarding_context';
import type { OnboardingCardId } from '../../constants';
import { OnboardingTopicId } from '../../constants';
import type { History } from 'history';

// --- Tests for useUrlDetail ---
describe('useUrlDetail', () => {
  let mockSetStoredUrlDetail: jest.Mock;
  let mockNavigateTo: jest.Mock;
  let mockReportCardOpen: jest.Mock;

  beforeEach(() => {
    mockSetStoredUrlDetail = jest.fn();
    mockNavigateTo = jest.fn();
    mockReportCardOpen = jest.fn();

    // By default, no stored detail
    (useStoredUrlDetails as jest.Mock).mockReturnValue([null, mockSetStoredUrlDetail]);
    (useNavigateTo as jest.Mock).mockReturnValue({ navigateTo: mockNavigateTo });
    (useTopicId as jest.Mock).mockReturnValue(OnboardingTopicId.default);
    (useOnboardingContext as jest.Mock).mockReturnValue({
      spaceId: 'test-space',
      telemetry: { reportCardOpen: mockReportCardOpen },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the expected initial values', () => {
    const { result } = renderHook(() => useUrlDetail());
    expect(result.current.topicId).toBe(OnboardingTopicId.default);
    expect(typeof result.current.setTopic).toBe('function');
    expect(typeof result.current.setCard).toBe('function');
    expect(typeof result.current.navigateToDetail).toBe('function');
    expect(result.current.storedUrlDetail).toBe(null);
  });

  it('setTopic updates stored detail and navigates (default topic)', () => {
    const { result } = renderHook(() => useUrlDetail());

    act(() => {
      result.current.setTopic(OnboardingTopicId.default);
    });

    // When topic is "default", the detail is null
    expect(mockSetStoredUrlDetail).toHaveBeenCalledWith(null);
    expect(mockNavigateTo).toHaveBeenCalledWith({
      deepLinkId: SecurityPageName.landing,
      path: undefined,
    });
  });

  it('setTopic updates stored detail and navigates (non-default topic)', () => {
    const { result } = renderHook(() => useUrlDetail());

    act(() => {
      result.current.setTopic('customTopic' as OnboardingTopicId);
    });

    expect(mockSetStoredUrlDetail).toHaveBeenCalledWith('customTopic');
    expect(mockNavigateTo).toHaveBeenCalledWith({
      deepLinkId: SecurityPageName.landing,
      path: 'customTopic',
    });
  });

  it('setCard updates the URL hash, stored detail and reports telemetry when a cardId is provided', () => {
    // Spy on history.replace (used in setHash)
    const useHistoryMock = useHistory as unknown as jest.MockedFn<typeof useHistory>;
    const replaceStateMock = jest.fn();

    useHistoryMock.mockReturnValue({
      replace: replaceStateMock,
    } as unknown as History<unknown>);

    (useTopicId as jest.Mock).mockReturnValue(OnboardingTopicId.default);
    const { result } = renderHook(() => useUrlDetail());
    const cardId = 'card1';

    act(() => {
      result.current.setCard(cardId as OnboardingCardId);
    });

    // Expect the URL hash to be updated to "#card1"
    expect(replaceStateMock).toHaveBeenCalledWith({ hash: `#${cardId}` });
    // For topic "default", getUrlDetail produces `#card1`
    expect(mockSetStoredUrlDetail).toHaveBeenCalledWith(`#${cardId}`);
    expect(mockReportCardOpen).toHaveBeenCalledWith(cardId);
    replaceStateMock.mockRestore();
  });

  it('setCard updates the URL hash and stored detail without reporting telemetry when cardId is null', () => {
    // Spy on history.replace (used in setHash)
    const useHistoryMock = useHistory as unknown as jest.MockedFn<typeof useHistory>;
    const replaceStateMock = jest.fn();

    useHistoryMock.mockReturnValue({
      replace: replaceStateMock,
    } as unknown as History<unknown>);

    const { result } = renderHook(() => useUrlDetail());

    act(() => {
      result.current.setCard(null);
    });

    expect(replaceStateMock).toHaveBeenCalledWith({ hash: undefined });
    // For a null cardId, getUrlDetail returns an empty string (falsy) so stored detail becomes null
    expect(mockSetStoredUrlDetail).toHaveBeenCalledWith(null);
    expect(mockReportCardOpen).not.toHaveBeenCalled();
    replaceStateMock.mockRestore();
  });

  it('navigateToDetail calls navigateTo with the correct parameters', () => {
    const { result } = renderHook(() => useUrlDetail());

    act(() => {
      result.current.navigateToDetail('detail-path');
    });

    expect(mockNavigateTo).toHaveBeenCalledWith({
      deepLinkId: SecurityPageName.landing,
      path: 'detail-path',
    });
  });
});

// --- Tests for getCardIdFromHash ---
describe('getCardIdFromHash', () => {
  it('extracts the card id from a hash with query parameters', () => {
    const cardId = getCardIdFromHash('#card1?foo=bar');
    expect(cardId).toBe('card1');
  });

  it('returns null if no card id is present', () => {
    const cardId = getCardIdFromHash('#?foo=bar');
    expect(cardId).toBeNull();
  });
});

// --- Tests for useSyncUrlDetails ---
describe('useSyncUrlDetails', () => {
  let mockSetStoredUrlDetail: jest.Mock;
  let mockNavigateTo: jest.Mock;
  let mockReportCardOpen: jest.Mock;
  let mockStartGetCloudTopicId: jest.Mock;
  let mockConfigHas: jest.Mock;
  let mockCloudOnComplete: (topicId: OnboardingTopicId | null) => void;

  beforeEach(() => {
    window.history.replaceState({}, '', '/app/security/get_started');
    mockSetStoredUrlDetail = jest.fn();
    mockNavigateTo = jest.fn();
    mockReportCardOpen = jest.fn();
    mockStartGetCloudTopicId = jest.fn();
    mockConfigHas = jest.fn().mockReturnValue(true);

    // Provide default values for the dependencies used inside useUrlDetail
    (useStoredUrlDetails as jest.Mock).mockReturnValue([null, mockSetStoredUrlDetail]);
    (useNavigateTo as jest.Mock).mockReturnValue({ navigateTo: mockNavigateTo });
    (useTopicId as jest.Mock).mockReturnValue(OnboardingTopicId.default);
    (useCloudTopicId as jest.Mock).mockImplementation(({ onComplete }) => {
      mockCloudOnComplete = onComplete;
      return {
        start: mockStartGetCloudTopicId,
        isLoading: false,
      };
    });
    (useOnboardingContext as jest.Mock).mockReturnValue({
      config: { has: mockConfigHas },
      spaceId: 'test-space',
      telemetry: { reportCardOpen: mockReportCardOpen },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('updates stored detail and reports telemetry when URL detail differs from stored detail', () => {
    const pathTopicId = 'customTopic' as OnboardingTopicId;
    const hashCardId = 'card1' as OnboardingCardId;
    const expectedUrlDetail = `${pathTopicId}#${hashCardId}`;

    // Render the hook with URL detail (via path and hash)
    renderHook(() => useSyncUrlDetails({ pathTopicId, hashCardId }));

    // useEffect should run immediately after mount:
    expect(mockReportCardOpen).toHaveBeenCalledWith(hashCardId, { auto: true });
    expect(mockSetStoredUrlDetail).toHaveBeenCalledWith(expectedUrlDetail);
  });

  it('navigates to the stored detail when URL is empty and a stored detail exists', () => {
    // Simulate that a stored detail already exists
    (useStoredUrlDetails as jest.Mock).mockReturnValue([
      'customTopic#card1',
      mockSetStoredUrlDetail,
    ]);

    renderHook(() => useSyncUrlDetails({ pathTopicId: null, hashCardId: null }));

    expect(mockNavigateTo).toHaveBeenCalledWith({
      deepLinkId: SecurityPageName.landing,
      path: 'customTopic#card1',
    });
  });

  it('clears stored siem migrations topic when URL is empty', () => {
    (useStoredUrlDetails as jest.Mock).mockReturnValue([
      OnboardingTopicId.siemMigrations,
      mockSetStoredUrlDetail,
    ]);

    renderHook(() => useSyncUrlDetails({ pathTopicId: null, hashCardId: null }));

    expect(mockSetStoredUrlDetail).toHaveBeenCalledWith(null);
    expect(mockNavigateTo).not.toHaveBeenCalled();
    expect(mockStartGetCloudTopicId).not.toHaveBeenCalled();
  });

  it('clears stored siem migrations topic with card detail when URL is empty', () => {
    (useStoredUrlDetails as jest.Mock).mockReturnValue([
      `${OnboardingTopicId.siemMigrations}#migrate_rules`,
      mockSetStoredUrlDetail,
    ]);

    renderHook(() => useSyncUrlDetails({ pathTopicId: null, hashCardId: null }));

    expect(mockSetStoredUrlDetail).toHaveBeenCalledWith(null);
    expect(mockNavigateTo).not.toHaveBeenCalled();
    expect(mockStartGetCloudTopicId).not.toHaveBeenCalled();
  });

  it('calls startGetCloudTopicId when URL is empty and stored detail is undefined', () => {
    // Simulate no stored detail (undefined) – e.g. first time onboarding
    (useStoredUrlDetails as jest.Mock).mockReturnValue([undefined, mockSetStoredUrlDetail]);

    renderHook(() => useSyncUrlDetails({ pathTopicId: null, hashCardId: null }));

    expect(mockStartGetCloudTopicId).toHaveBeenCalled();
  });

  it('navigates to SIEM migrations topic after clearing stored detail', () => {
    renderHook(() => useSyncUrlDetails({ pathTopicId: null, hashCardId: null }));

    act(() => {
      mockCloudOnComplete(OnboardingTopicId.siemMigrations);
    });
    expect(mockNavigateTo).toHaveBeenCalledWith({
      deepLinkId: SecurityPageName.landing,
      path: OnboardingTopicId.siemMigrations,
    });
    expect(mockSetStoredUrlDetail).toHaveBeenCalledWith(null);
  });

  it('clears stored detail if the stored topic is invalid', () => {
    // Simulate a stored detail with an invalid topic
    (useStoredUrlDetails as jest.Mock).mockReturnValue([
      'invalidTopic#card1',
      mockSetStoredUrlDetail,
    ]);
    // Simulate config.has returning false for an invalid topic
    mockConfigHas.mockReturnValue(false);

    renderHook(() => useSyncUrlDetails({ pathTopicId: null, hashCardId: null }));

    expect(mockSetStoredUrlDetail).toHaveBeenCalledWith(null);
    // In this case, navigation should not be triggered
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });
});
