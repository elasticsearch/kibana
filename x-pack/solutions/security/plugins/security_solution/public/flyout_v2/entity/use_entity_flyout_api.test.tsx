/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { EntityType } from '../../../common/entity_analytics/types';
import { RiskScoreLeftPanelSubTab } from '../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import { useEntityFlyoutApi } from './use_entity_flyout_api';
import { useKibana } from '../../common/lib/kibana';
import { useIsInSecurityApp } from '../../common/hooks/is_in_security_app';
import { flyoutProviders } from '../shared/components/flyout_provider';
import { documentFlyoutHistoryKey } from '../shared/constants/flyout_history';
import { buildFlyoutNavTitle } from '../shared/utils/build_flyout_nav_title';
import { FLYOUT_DESCRIPTOR_KIND } from '../shared/url_state/flyout_v2_url_param';
import {
  FlyoutV2EventTypes,
  FLYOUT_ORIGIN,
  FLYOUT_SESSION_KIND,
  FLYOUT_SURFACE,
  FLYOUT_TYPE,
} from '../../common/lib/telemetry';

jest.mock('../shared/utils/build_flyout_nav_title', () => ({
  buildFlyoutNavTitle: jest.fn((title: string) => `NAV:${title}`),
}));

jest.mock('react-redux-v7', () => ({
  ...jest.requireActual('react-redux-v7'),
  useStore: jest.fn(() => ({})),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: jest.fn(() => ({})),
}));
jest.mock('../../common/lib/kibana');
jest.mock('../../common/hooks/is_in_security_app');
jest.mock('../shared/components/flyout_provider', () => ({
  flyoutProviders: jest.fn(() => 'FLYOUT_CONTENT'),
}));
jest.mock('../shared/hooks/use_default_flyout_properties', () => ({
  useDefaultDocumentFlyoutProperties: jest.fn(() => ({ size: 's' })),
  useDefaultToolsFlyoutProperties: jest.fn(() => ({ minWidth: 384, size: 'm' })),
}));

const mockWriteOnOpen = jest.fn();
const mockBuildOnClose = jest.fn(() => jest.fn());
jest.mock('../shared/url_state/flyout_v2_url_writer', () => ({
  useFlyoutV2UrlWriter: jest.fn(() => ({
    writeOnOpen: mockWriteOnOpen,
    buildOnClose: mockBuildOnClose,
  })),
}));

const mockOpenSystemFlyout = jest.fn();
const mockReportEvent = jest.fn();

const managedUser = { _id: 'managed-user-id', _index: 'managed-user-index' };

describe('useEntityFlyoutApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenSystemFlyout.mockReturnValue({ onClose: Promise.resolve(), close: jest.fn() });
    mockBuildOnClose.mockReturnValue(jest.fn());
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        overlays: { openSystemFlyout: mockOpenSystemFlyout },
        storage: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
        telemetry: { reportEvent: mockReportEvent },
      },
    });
    (useIsInSecurityApp as jest.Mock).mockReturnValue(true);
  });

  it('openHostFlyout opens a system flyout as a new session with the document properties', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openHostFlyout({ hostName: 'host-1' });

    expect(flyoutProviders).toHaveBeenCalledTimes(1);
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      'FLYOUT_CONTENT',
      expect.objectContaining({ size: 's', session: 'start', historyKey: documentFlyoutHistoryKey })
    );
  });

  it('openHostFlyout falls back to "Host: <hostName>" when no title is provided', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openHostFlyout({ hostName: 'host-1' });

    expect(mockOpenSystemFlyout.mock.calls[0][1].title).toBe('Host: host-1');
  });

  it('openHostFlyout uses the provided title when given', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openHostFlyout({ hostName: 'host-1', title: 'My Custom Host' });

    expect(mockOpenSystemFlyout.mock.calls[0][1].title).toBe('My Custom Host');
  });

  it('openHostFlyout writes a host descriptor to the URL', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openHostFlyout({ hostName: 'host-1', entityId: 'entity-1', scopeId: 'scope-1' });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.host,
      hostName: 'host-1',
      entityId: 'entity-1',
      scopeId: 'scope-1',
    });
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openHostFlyoutAsChild opens a system flyout that inherits the current session', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openHostFlyoutAsChild({ hostName: 'host-1' });

    expect(mockOpenSystemFlyout.mock.calls[0][1].session).toBe('inherit');
  });

  it('openHostFlyoutAsChild passes the composed nav title when a title is provided', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openHostFlyoutAsChild({ hostName: 'host-1', title: 'My Host' });

    expect(buildFlyoutNavTitle).toHaveBeenCalledWith('My Host');
    expect(mockOpenSystemFlyout.mock.calls[0][1].title).toBe('NAV:My Host');
  });

  it('openHostFlyoutAsChild falls back to "Host: <hostName>" when no title is provided', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openHostFlyoutAsChild({ hostName: 'host-1' });

    expect(buildFlyoutNavTitle).toHaveBeenCalledWith('Host: host-1');
    expect(mockOpenSystemFlyout.mock.calls[0][1].title).toBe('NAV:Host: host-1');
  });

  it('openHostFlyoutAsChild writes a host descriptor in inherit mode', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openHostFlyoutAsChild({ hostName: 'host-1', entityId: 'entity-1' });

    expect(mockWriteOnOpen).toHaveBeenCalledWith(
      {
        kind: FLYOUT_DESCRIPTOR_KIND.host,
        hostName: 'host-1',
        entityId: 'entity-1',
        scopeId: undefined,
      },
      'inherit'
    );
    // readFirstDescriptor returns null (history has no location in tests)
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openUserFlyout opens a system flyout as a new session with the document properties', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openUserFlyout({ userName: 'user-1' });

    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      'FLYOUT_CONTENT',
      expect.objectContaining({ size: 's', session: 'start', historyKey: documentFlyoutHistoryKey })
    );
  });

  it('openUserFlyout falls back to "User: <userName>" when no title is provided', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openUserFlyout({ userName: 'user-1' });

    expect(mockOpenSystemFlyout.mock.calls[0][1].title).toBe('User: user-1');
  });

  it('openUserFlyout writes a user descriptor to the URL', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openUserFlyout({ userName: 'user-1', entityId: 'entity-2' });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.user,
      userName: 'user-1',
      entityId: 'entity-2',
      scopeId: undefined,
    });
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openUserFlyoutAsChild opens a system flyout that inherits the current session', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openUserFlyoutAsChild({ userName: 'user-1' });

    expect(mockOpenSystemFlyout.mock.calls[0][1].session).toBe('inherit');
  });

  it('openUserFlyoutAsChild falls back to "User: <userName>" when no title is provided', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openUserFlyoutAsChild({ userName: 'user-1' });

    expect(buildFlyoutNavTitle).toHaveBeenCalledWith('User: user-1');
    expect(mockOpenSystemFlyout.mock.calls[0][1].title).toBe('NAV:User: user-1');
  });

  it('openServiceFlyout writes a service descriptor to the URL', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openServiceFlyout({ serviceName: 'svc-1', entityId: 'entity-3' });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.service,
      serviceName: 'svc-1',
      entityId: 'entity-3',
      scopeId: undefined,
    });
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openGenericEntityFlyout writes a genericEntity descriptor to the URL', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openGenericEntityFlyout({ entityId: 'generic-1', scopeId: 'scope-1' });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.genericEntity,
      scopeId: 'scope-1',
      entityId: 'generic-1',
      entityDocId: undefined,
    });
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openEntityFlyout reports the caller-provided origin', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityFlyout({
      engineType: 'host',
      entityId: 'entity-1',
      entityName: 'host-1',
      scopeId: 'scope-1',
      origin: FLYOUT_ORIGIN.ENTITIES_TABLE,
    });

    expect(mockReportEvent).toHaveBeenCalledWith(FlyoutV2EventTypes.FlyoutOpened, {
      surface: FLYOUT_SURFACE.FLYOUT,
      flyoutType: FLYOUT_TYPE.HOST,
      tool: undefined,
      session: FLYOUT_SESSION_KIND.START,
      origin: FLYOUT_ORIGIN.ENTITIES_TABLE,
    });
  });

  it('openEntityDetailsAsChild opens the matching entity flyout that inherits the current session', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityDetailsAsChild({
      engineType: 'host',
      entityId: 'entity-1',
      entityName: 'host-1',
      scopeId: 'scopeId',
    });

    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      'FLYOUT_CONTENT',
      expect.objectContaining({ size: 's', session: 'inherit' })
    );
  });

  it('openEntityDetailsAsChild composes a type-specific nav title from the entity name', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityDetailsAsChild({
      engineType: 'host',
      entityId: 'entity-1',
      entityName: 'host-1',
      scopeId: 'scopeId',
    });

    expect(buildFlyoutNavTitle).toHaveBeenCalledWith('Host: host-1');
    expect(mockOpenSystemFlyout.mock.calls[0][1].title).toBe('NAV:Host: host-1');
  });

  it('openEntityDetailsAsChild falls back to entityId when entityName is absent', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityDetailsAsChild({
      engineType: 'host',
      entityId: 'entity-1',
      entityName: undefined,
      scopeId: 'scopeId',
    });

    expect(buildFlyoutNavTitle).toHaveBeenCalledWith('Host: entity-1');
  });

  it.each([
    ['user', 'User: name-1'],
    ['service', 'Service: name-1'],
    ['unknown', 'Entity'],
  ] as const)('openEntityDetailsAsChild formats the %s nav title', (engineType, expectedTitle) => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityDetailsAsChild({
      engineType,
      entityId: 'entity-1',
      entityName: 'name-1',
      scopeId: 'scopeId',
    });

    expect(buildFlyoutNavTitle).toHaveBeenCalledWith(expectedTitle);
  });

  it.each([
    ['host', FLYOUT_DESCRIPTOR_KIND.host],
    ['user', FLYOUT_DESCRIPTOR_KIND.user],
    ['service', FLYOUT_DESCRIPTOR_KIND.service],
    ['unknown', FLYOUT_DESCRIPTOR_KIND.genericEntity],
  ] as const)(
    'openEntityDetailsAsChild writes a %s descriptor in inherit mode',
    (engineType, expectedKind) => {
      const { result } = renderHook(() => useEntityFlyoutApi());
      result.current.openEntityDetailsAsChild({
        engineType,
        entityId: 'entity-1',
        entityName: 'name-1',
        scopeId: 'scope-1',
      });

      expect(mockWriteOnOpen).toHaveBeenCalledWith(
        expect.objectContaining({ kind: expectedKind, scopeId: 'scope-1' }),
        'inherit'
      );
      expect(mockBuildOnClose).toHaveBeenCalledWith(null);
    }
  );

  it.each([
    'openEntityRiskInputs',
    'openEntityAnomalyInsights',
    'openEntityAlertsInsights',
    'openEntityMisconfigurationInsights',
    'openEntityVulnerabilityInsights',
    'openEntityGraphView',
    'openEntityResolution',
    'openEntityEntraInsights',
    'openEntityOktaInsights',
    'openEntityFieldsTable',
  ] as const)('%s opens a tools flyout as a new session', (method) => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    // The tool params differ per method; the hook only spreads them onto the (unrendered, mocked)
    // component, so a permissive object is fine for asserting the flyout properties.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result.current[method] as (params: any) => void)({
      entityType: 'host',
      value: 'x',
      entityName: 'x',
      hostName: 'x',
      entityId: 'entity-1',
      scopeId: '',
      document: {},
      managedUser,
    });

    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      'FLYOUT_CONTENT',
      expect.objectContaining({ size: 'm', session: 'start' })
    );
  });

  it('openEntityAlertsInsights auto-generates "Alerts: <value>" title when none is provided', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityAlertsInsights({ entityType: EntityType.host, value: 'my-host' });

    expect(mockOpenSystemFlyout.mock.calls[0][1].title).toBe('Alerts: my-host');
  });

  it('openEntityAlertsInsights uses the caller-provided title when given', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityAlertsInsights({
      entityType: EntityType.host,
      value: 'my-host',
      title: 'Custom',
    });

    expect(mockOpenSystemFlyout.mock.calls[0][1].title).toBe('Custom');
  });

  it('openEntityRiskInputs auto-generates "Risk score: <entityName>" title when none is provided', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityRiskInputs({ entityType: EntityType.host, entityName: 'my-host' });

    expect(mockOpenSystemFlyout.mock.calls[0][1].title).toBe('Risk score: my-host');
  });

  it('openEntityRiskInputs writes an entityRiskInputs descriptor and clears the param on close', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityRiskInputs({
      entityType: EntityType.host,
      entityName: 'my-host',
      entityId: 'e-1',
    });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.entityRiskInputs,
      entityType: 'host',
      entityName: 'my-host',
      entityId: 'e-1',
    });
    // A tool is a session:'start' root; closing it clears the param (no parent to revert to).
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openEntityRiskInputs persists the resolution subTab on the URL descriptor', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityRiskInputs({
      entityType: EntityType.user,
      entityName: 'alice',
      entityId: 'user:alice',
      subTab: RiskScoreLeftPanelSubTab.RESOLUTION,
    });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.entityRiskInputs,
      entityType: 'user',
      entityName: 'alice',
      entityId: 'user:alice',
      subTab: 'resolution',
    });
  });

  it('openEntityAnomalyInsights writes an entityAnomalyInsights descriptor and clears the param on close', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityAnomalyInsights({
      entityType: EntityType.user,
      value: 'user-1',
      entityId: 'e-2',
    });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.entityAnomalyInsights,
      entityType: 'user',
      value: 'user-1',
      entityId: 'e-2',
    });
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openEntityAlertsInsights writes null fallback for generic entity (no scopeId available)', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityAlertsInsights({
      entityType: EntityType.generic,
      value: 'generic-entity-id',
      entityId: 'e-3',
    });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.entityAlertsInsights,
      entityType: 'generic',
      value: 'generic-entity-id',
      entityId: 'e-3',
    });
    // Generic entity lacks scopeId in tool params, so fallback is null
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openEntityGraphView writes an entityGraphView descriptor and clears the param on close', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityGraphView({
      entityId: 'entity-1',
      scopeId: 'scope-1',
      entityName: 'entity-name',
      onShowEntity: jest.fn(),
    });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.entityGraphView,
      entityId: 'entity-1',
      scopeId: 'scope-1',
      entityName: 'entity-name',
    });
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openEntityResolution writes an entityResolution descriptor and clears the param on close', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityResolution({
      entityId: 'entity-1',
      entityType: EntityType.service,
      entityName: 'svc-1',
      scopeId: 'scope-1',
    });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.entityResolution,
      entityId: 'entity-1',
      entityType: 'service',
      entityName: 'svc-1',
      scopeId: 'scope-1',
    });
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openEntityEntraInsights writes an entityEntraInsights descriptor and clears the param on close', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityEntraInsights({ managedUser, value: 'user@example.com' });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.entityEntraInsights,
      managedUserId: 'managed-user-id',
      managedUserIndex: 'managed-user-index',
      value: 'user@example.com',
    });
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openEntityOktaInsights writes an entityOktaInsights descriptor and clears the param on close', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityOktaInsights({ managedUser, value: 'user@example.com' });

    expect(mockWriteOnOpen).toHaveBeenCalledWith({
      kind: FLYOUT_DESCRIPTOR_KIND.entityOktaInsights,
      managedUserId: 'managed-user-id',
      managedUserIndex: 'managed-user-index',
      value: 'user@example.com',
    });
    expect(mockBuildOnClose).toHaveBeenCalledWith(null);
  });

  it('openEntityFieldsTable does not write a descriptor (intentionally not wired for URL sync)', () => {
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openEntityFieldsTable({
      document: { 'host.name': 'host-1' },
      entityName: 'host-1',
    });

    expect(mockWriteOnOpen).not.toHaveBeenCalled();
    expect(mockBuildOnClose).not.toHaveBeenCalled();
  });

  it('uses the doc-viewer history key when outside the security app', () => {
    (useIsInSecurityApp as jest.Mock).mockReturnValue(false);
    const { result } = renderHook(() => useEntityFlyoutApi());
    result.current.openHostFlyout({ hostName: 'host-1' });

    expect(mockOpenSystemFlyout.mock.calls[0][1].historyKey).toBe(DOC_VIEWER_FLYOUT_HISTORY_KEY);
  });
});
