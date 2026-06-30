/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import { ALERT_RULE_TYPE_ID, ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID } from '@kbn/rule-data-utils';
import type { ProfileProviderServices } from '../profile_provider_services';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../toolkit';
import { DocumentType } from '../../profiles';
import { createSecurityDocumentProfileProviders } from './security_profile_providers';

const createRecord = (flattened: DataTableRecord['flattened']): DataTableRecord =>
  ({
    id: '1',
    raw: {},
    flattened,
    isAnchor: false,
  } as DataTableRecord);

const getDocViewerResult = (
  record: DataTableRecord,
  toolkitActions: {
    refreshData?: () => void;
  } = {}
) => {
  const providerServices = {} as ProfileProviderServices;
  const [enhancedProvider] = createSecurityDocumentProfileProviders(providerServices);
  const prevRenderHeader = jest.fn();
  const prevRenderFooter = jest.fn();
  const prevDocViewer = {
    renderHeader: prevRenderHeader,
    renderFooter: prevRenderFooter,
    docViewsRegistry: jest.fn((r) => r),
  };
  const prev = jest.fn().mockReturnValue(prevDocViewer);
  const getDocViewer = enhancedProvider.profile.getDocViewer!(prev, {
    context: { type: DocumentType.Default },
    toolkit: {
      ...EMPTY_CONTEXT_AWARENESS_TOOLKIT,
      actions: {
        ...EMPTY_CONTEXT_AWARENESS_TOOLKIT.actions,
        ...toolkitActions,
      },
    },
  });
  const result = getDocViewer({ record } as Parameters<typeof getDocViewer>[0]);
  return { result, prevRenderHeader, prevRenderFooter };
};

describe('createSecurityDocumentProfileProviders', () => {
  describe('getDocViewer', () => {
    it('overrides renderHeader for alert documents', () => {
      const { result, prevRenderHeader } = getDocViewerResult(
        createRecord({ 'event.kind': 'signal' })
      );

      expect(result.renderHeader).toBeDefined();
      expect(result.renderHeader).not.toBe(prevRenderHeader);
    });

    it('overrides renderFooter for alert documents', () => {
      const { result, prevRenderFooter } = getDocViewerResult(
        createRecord({ 'event.kind': 'signal' })
      );

      expect(result.renderFooter).toBeDefined();
      expect(result.renderFooter).not.toBe(prevRenderFooter);
    });

    it('overrides renderHeader for non-alert events', () => {
      const { result, prevRenderHeader } = getDocViewerResult(
        createRecord({ 'event.kind': 'event' })
      );

      expect(result.renderHeader).toBeDefined();
      expect(result.renderHeader).not.toBe(prevRenderHeader);
    });

    it('overrides renderFooter for non-alert events', () => {
      const { result, prevRenderFooter } = getDocViewerResult(
        createRecord({ 'event.kind': 'event' })
      );

      expect(result.renderFooter).toBeDefined();
      expect(result.renderFooter).not.toBe(prevRenderFooter);
    });

    it('does not override renderHeader for attack discovery alerts', () => {
      const { result, prevRenderHeader } = getDocViewerResult(
        createRecord({
          'event.kind': 'signal',
          [ALERT_RULE_TYPE_ID]: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
        })
      );

      expect(result.renderHeader).toBe(prevRenderHeader);
    });

    it('does not override renderFooter for attack discovery alerts', () => {
      const { result, prevRenderFooter } = getDocViewerResult(
        createRecord({
          'event.kind': 'signal',
          [ALERT_RULE_TYPE_ID]: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
        })
      );

      expect(result.renderFooter).toBe(prevRenderFooter);
    });

    it('adds the overview tab to the registry for alert documents', () => {
      const { result } = getDocViewerResult(createRecord({ 'event.kind': 'signal' }));
      const registry = { add: jest.fn() };
      result.docViewsRegistry(registry as never);

      expect(registry.add).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc_view_alerts_overview' })
      );
    });

    it('adds the overview tab to the registry for non-alert events', () => {
      const { result } = getDocViewerResult(createRecord({ 'event.kind': 'event' }));
      const registry = { add: jest.fn() };
      result.docViewsRegistry(registry as never);

      expect(registry.add).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc_view_alerts_overview' })
      );
    });

    it('does not add the overview tab to the registry for attack discovery alerts', () => {
      const { result } = getDocViewerResult(
        createRecord({
          'event.kind': 'signal',
          [ALERT_RULE_TYPE_ID]: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
        })
      );
      const registry = { add: jest.fn() };
      result.docViewsRegistry(registry as never);

      expect(registry.add).not.toHaveBeenCalled();
    });

    it('does not override renderHeader when event.kind is absent', () => {
      const { result, prevRenderHeader } = getDocViewerResult(createRecord({}));

      expect(result.renderHeader).toBe(prevRenderHeader);
    });

    it('does not override renderFooter when event.kind is absent', () => {
      const { result, prevRenderFooter } = getDocViewerResult(createRecord({}));

      expect(result.renderFooter).toBe(prevRenderFooter);
    });

    it('does not add the overview tab to the registry when event.kind is absent', () => {
      const { result } = getDocViewerResult(createRecord({}));
      const registry = { add: jest.fn() };
      result.docViewsRegistry(registry as never);

      expect(registry.add).not.toHaveBeenCalled();
    });

    it('overrides renderHeader for remote (CCS/CPS) alert documents', () => {
      const { result, prevRenderHeader } = getDocViewerResult(
        createRecord({
          'event.kind': 'signal',
          _index: 'remote:.alerts-security.alerts-default',
        })
      );

      expect(result.renderHeader).toBeDefined();
      expect(result.renderHeader).not.toBe(prevRenderHeader);
    });

    it('overrides renderFooter for remote (CCS/CPS) alert documents', () => {
      const { result, prevRenderFooter } = getDocViewerResult(
        createRecord({
          'event.kind': 'signal',
          _index: 'remote:.alerts-security.alerts-default',
        })
      );

      expect(result.renderFooter).toBeDefined();
      expect(result.renderFooter).not.toBe(prevRenderFooter);
    });

    it('overrides renderHeader for remote (CCS/CPS) event documents', () => {
      const { result, prevRenderHeader } = getDocViewerResult(
        createRecord({
          'event.kind': 'event',
          _index: 'remote:logs-system-default',
        })
      );

      expect(result.renderHeader).toBeDefined();
      expect(result.renderHeader).not.toBe(prevRenderHeader);
    });

    it('overrides renderFooter for remote (CCS/CPS) event documents', () => {
      const { result, prevRenderFooter } = getDocViewerResult(
        createRecord({
          'event.kind': 'event',
          _index: 'remote:logs-system-default',
        })
      );

      expect(result.renderFooter).toBeDefined();
      expect(result.renderFooter).not.toBe(prevRenderFooter);
    });

    it('adds the overview tab for remote (CCS/CPS) alert documents', () => {
      const { result } = getDocViewerResult(
        createRecord({
          'event.kind': 'signal',
          _index: 'remote:.alerts-security.alerts-default',
        })
      );
      const registry = { add: jest.fn() };
      result.docViewsRegistry(registry as never);

      expect(registry.add).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc_view_alerts_overview' })
      );
    });

    it('adds the overview tab for remote (CCS/CPS) event documents', () => {
      const { result } = getDocViewerResult(
        createRecord({
          'event.kind': 'event',
          _index: 'remote:logs-system-default',
        })
      );
      const registry = { add: jest.fn() };
      result.docViewsRegistry(registry as never);

      expect(registry.add).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc_view_alerts_overview' })
      );
    });

    it('forwards refreshData action to enhanced flyout header', () => {
      const refreshData = jest.fn();
      const hit = createRecord({ 'event.kind': 'signal' });
      const { result } = getDocViewerResult(hit, { refreshData });

      const renderedHeader = result.renderHeader?.({ hit, dataView: dataViewMock });
      expect(renderedHeader).toBeDefined();
      expect((renderedHeader as { props: { refreshData: () => void } }).props.refreshData).toBe(
        refreshData
      );
    });

    it('forwards refreshData action to enhanced flyout footer', () => {
      const refreshData = jest.fn();
      const hit = createRecord({ 'event.kind': 'signal' });
      const { result } = getDocViewerResult(hit, { refreshData });

      const renderedFooter = result.renderFooter?.({ hit, dataView: dataViewMock });
      expect(renderedFooter).toBeDefined();
      expect((renderedFooter as { props: { refreshData: () => void } }).props.refreshData).toBe(
        refreshData
      );
    });

    it('forwards refreshData action to enhanced overview tab', () => {
      const refreshData = jest.fn();
      const hit = createRecord({ 'event.kind': 'signal' });
      const { result } = getDocViewerResult(hit, { refreshData });
      const registry = { add: jest.fn() };

      result.docViewsRegistry(registry as never);
      const addedOverviewTab = registry.add.mock.calls[0][0];

      const renderedOverview = addedOverviewTab.render({ hit, dataView: dataViewMock });
      expect(renderedOverview).toBeDefined();
      expect((renderedOverview as { props: { refreshData: () => void } }).props.refreshData).toBe(
        refreshData
      );
    });

    it('overrides renderHeader for IOC documents', () => {
      const { result, prevRenderHeader } = getDocViewerResult(
        createRecord({ 'event.type': 'indicator' })
      );

      expect(result.renderHeader).toBeDefined();
      expect(result.renderHeader).not.toBe(prevRenderHeader);
    });

    it('overrides renderFooter for IOC documents', () => {
      const { result, prevRenderFooter } = getDocViewerResult(
        createRecord({ 'event.type': 'indicator' })
      );

      expect(result.renderFooter).toBeDefined();
      expect(result.renderFooter).not.toBe(prevRenderFooter);
    });

    it('adds the overview tab to the registry for IOC documents', () => {
      const { result } = getDocViewerResult(createRecord({ 'event.type': 'indicator' }));
      const registry = { add: jest.fn() };
      result.docViewsRegistry(registry as never);

      expect(registry.add).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc_view_ioc_overview' })
      );
    });
  });
});
