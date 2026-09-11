/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import { ALERT_RULE_TYPE_ID, ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID } from '@kbn/rule-data-utils';
import { DocViewsRegistry } from '@kbn/unified-doc-viewer';
import { createProfileProviderSharedServicesMock } from '../../../__mocks__';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../../toolkit';
import { createSecurityDocumentProfileProvider } from './profile';
import { DataSourceCategory, DocumentType, SolutionType } from '../../..';

const mockServices = createProfileProviderSharedServicesMock();
const provider = createSecurityDocumentProfileProvider(mockServices);

const buildRecord = (fields: Record<string, unknown>): DataTableRecord =>
  ({ flattened: fields, raw: {}, id: 'test-id' } as unknown as DataTableRecord);

const prevDocViewer = () => ({
  title: 'test title',
  docViewsRegistry: (registry: DocViewsRegistry) => registry,
});

const getDocViewerFor = (record: DataTableRecord) => {
  const getDocViewer = provider.profile.getDocViewer!(prevDocViewer, {
    context: { type: DocumentType.Default },
    toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
  });
  return getDocViewer({ record } as Parameters<typeof getDocViewer>[0]);
};

describe('createSecurityDocumentProfileProvider — getDocViewer', () => {
  it('sets the flyout title to "Alert: <rule_name>" for alert documents', () => {
    const docViewer = getDocViewerFor(
      buildRecord({ 'event.kind': 'signal', 'kibana.alert.rule.name': 'My Detection Rule' })
    );
    expect(docViewer.title).toBe('Alert: My Detection Rule');
  });

  it('falls back to the previous title when the alert has no rule name', () => {
    const docViewer = getDocViewerFor(buildRecord({ 'event.kind': 'signal' }));
    expect(docViewer.title).toBe('test title');
  });

  it('does not override the title for non-alert event documents', () => {
    const docViewer = getDocViewerFor(
      buildRecord({ 'event.kind': 'event', 'kibana.alert.rule.name': 'Should Not Appear' })
    );
    expect(docViewer.title).toBe('test title');
  });

  it('registers the overview tab for a regular alert', () => {
    const registry = new DocViewsRegistry();
    const docViewer = getDocViewerFor(buildRecord({ 'event.kind': 'signal' }));
    docViewer.docViewsRegistry(registry);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]).toMatchObject({
      id: 'doc_view_alerts_overview',
      title: 'Alert Overview',
    });
  });

  it('registers the overview tab for a signal with an unrelated rule type', () => {
    const registry = new DocViewsRegistry();
    const docViewer = getDocViewerFor(
      buildRecord({
        'event.kind': 'signal',
        [ALERT_RULE_TYPE_ID]: 'siem.queryRule',
      })
    );
    docViewer.docViewsRegistry(registry);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]).toMatchObject({
      id: 'doc_view_alerts_overview',
      title: 'Alert Overview',
    });
  });

  it('registers the overview tab for a non-alert event', () => {
    const registry = new DocViewsRegistry();
    const docViewer = getDocViewerFor(buildRecord({ 'event.kind': 'event' }));
    docViewer.docViewsRegistry(registry);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]).toMatchObject({
      id: 'doc_view_alerts_overview',
      title: 'Event Overview',
    });
  });

  it('does NOT register the overview tab when event.kind is absent', () => {
    const registry = new DocViewsRegistry();
    const docViewer = getDocViewerFor(buildRecord({}));
    docViewer.docViewsRegistry(registry);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('does NOT register the overview tab for a scheduled attack discovery alert', () => {
    const registry = new DocViewsRegistry();
    const docViewer = getDocViewerFor(
      buildRecord({
        'event.kind': 'signal',
        [ALERT_RULE_TYPE_ID]: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
      })
    );
    docViewer.docViewsRegistry(registry);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('does NOT register the overview tab for an ad-hoc attack discovery alert', () => {
    const registry = new DocViewsRegistry();
    const docViewer = getDocViewerFor(
      buildRecord({
        'event.kind': 'signal',
        [ALERT_RULE_TYPE_ID]: 'attack_discovery_ad_hoc_rule_type_id',
      })
    );
    docViewer.docViewsRegistry(registry);
    expect(registry.getAll()).toHaveLength(0);
  });
});

describe('createSecurityDocumentProfileProvider — resolve', () => {
  const record = buildRecord({ 'event.kind': 'signal' });
  const rootContext = { profileId: 'root-profile', solutionType: SolutionType.Default };

  it('matches based on Security data source context in Classic', () => {
    expect(
      provider.resolve({
        rootContext,
        dataSourceContext: {
          profileId: 'security-data-source-profile',
          category: DataSourceCategory.Security,
        },
        record,
      })
    ).toEqual({ isMatch: true, context: { type: DocumentType.Default } });
  });

  it('does not match without Security data source context', () => {
    expect(
      provider.resolve({
        rootContext: { profileId: 'security-root-profile', solutionType: SolutionType.Security },
        dataSourceContext: {
          profileId: 'default-data-source-profile',
          category: DataSourceCategory.Default,
        },
        record,
      })
    ).toEqual({ isMatch: false });
  });
});
