/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildDataTableRecord } from '@kbn/discover-utils';
import { DocViewsRegistry } from '@kbn/unified-doc-viewer';
import type { DataSourceContext, RootContext } from '../../../../profiles';
import { DataSourceCategory, DocumentType, SolutionType } from '../../../../profiles';
import { createProfileProviderSharedServicesMock } from '../../../../__mocks__';
import { createObservabilityTracesDocumentProfileProvider } from './profile';
import type { ContextWithProfileId } from '../../../../profile_service';
import { OBSERVABILITY_ROOT_PROFILE_ID } from '../../consts';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../../../toolkit';

describe('tracesDocumentProfileProvider', () => {
  const getRootContext = ({
    profileId,
    solutionType,
  }: {
    profileId: string;
    solutionType?: SolutionType;
  }): ContextWithProfileId<RootContext> => {
    return {
      profileId,
      solutionType: solutionType ?? SolutionType.Observability,
    };
  };

  const DATA_SOURCE_CONTEXT: ContextWithProfileId<DataSourceContext> = {
    profileId: 'traces-document-profile',
    category: DataSourceCategory.Traces,
  };
  const RESOLUTION_MATCH = {
    isMatch: true,
    context: {
      type: DocumentType.Trace,
    },
  };
  const RESOLUTION_MISMATCH = {
    isMatch: false,
  };

  const mockServices = createProfileProviderSharedServicesMock();

  describe('when root profile is observability', () => {
    const profileId = OBSERVABILITY_ROOT_PROFILE_ID;

    const spanDocumentProfileProvider =
      createObservabilityTracesDocumentProfileProvider(mockServices);

    it('matches records with at least the correct source and a trace id', () => {
      expect(
        spanDocumentProfileProvider.resolve({
          rootContext: getRootContext({ profileId }),
          dataSourceContext: DATA_SOURCE_CONTEXT,
          record: buildTraceMockRecord('traces-index', {
            'trace.id': ['c0ffee'],
          }),
        })
      ).toEqual(RESOLUTION_MATCH);
    });

    it('does not match records with no trace id', () => {
      expect(
        spanDocumentProfileProvider.resolve({
          rootContext: getRootContext({ profileId }),
          dataSourceContext: DATA_SOURCE_CONTEXT,
          record: buildTraceMockRecord('traces-index'),
        })
      ).toEqual(RESOLUTION_MISMATCH);
    });

    it('matches records with the correct trace id and any OTEL `kind` field (unprocessed spans)', () => {
      expect(
        spanDocumentProfileProvider.resolve({
          rootContext: getRootContext({ profileId }),
          dataSourceContext: DATA_SOURCE_CONTEXT,
          record: buildTraceMockRecord('traces-index', {
            'trace.id': ['c0ffee'],
            kind: 'Internal',
          }),
        })
      ).toEqual(RESOLUTION_MATCH);
    });
  });

  describe('getDocViewer', () => {
    const spanDocumentProfileProvider =
      createObservabilityTracesDocumentProfileProvider(mockServices);

    const getDocViewer = spanDocumentProfileProvider.profile.getDocViewer!(
      () => ({
        title: 'test title',
        docViewsRegistry: (registry) => registry,
      }),
      {
        context: { type: DocumentType.Trace },
        toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
      }
    );

    it('adds only the overview tab when the record has no gen_ai fields', () => {
      const docViewer = getDocViewer({
        record: buildTraceMockRecord('traces-index', { 'trace.id': ['c0ffee'] }),
      });

      const registry = new DocViewsRegistry();
      docViewer.docViewsRegistry(registry);

      expect(registry.getAll().map(({ id }) => id)).toEqual(['doc_view_obs_traces_overview']);
    });

    it('adds the GenAI tab when the record has gen_ai fields', () => {
      const docViewer = getDocViewer({
        record: buildTraceMockRecord('traces-index', {
          'trace.id': ['c0ffee'],
          'attributes.gen_ai.request.model': ['gpt-4o'],
        }),
      });

      const registry = new DocViewsRegistry();
      docViewer.docViewsRegistry(registry);

      expect(registry.getAll().map(({ id }) => id)).toEqual([
        'doc_view_obs_traces_overview',
        'doc_view_obs_traces_genai',
      ]);
    });

    it('registers the GenAI tab with viewGenAi EBT click attributes', () => {
      const docViewer = getDocViewer({
        record: buildTraceMockRecord('traces-index', {
          'trace.id': ['c0ffee'],
          'attributes.gen_ai.request.model': ['gpt-4o'],
        }),
      });

      const registry = new DocViewsRegistry();
      docViewer.docViewsRegistry(registry);

      const genAiDocView = registry.getAll().find(({ id }) => id === 'doc_view_obs_traces_genai');
      expect(genAiDocView?.ebt).toEqual({ action: 'viewGenAi', element: 'docViewerTabs' });
    });
  });

  describe('when root profile is NOT observability', () => {
    const profileId = 'another-profile';
    const solutionType = SolutionType.Security;
    const spanDocumentProfileProvider =
      createObservabilityTracesDocumentProfileProvider(mockServices);

    it('does not match records with the correct data source and a trace id', () => {
      expect(
        spanDocumentProfileProvider.resolve({
          rootContext: getRootContext({ profileId, solutionType }),
          dataSourceContext: DATA_SOURCE_CONTEXT,
          record: buildTraceMockRecord('traces-index', {
            'trace.id': ['c0ffee'],
          }),
        })
      ).toEqual(RESOLUTION_MISMATCH);
    });
  });

  describe('when root profile is Classic', () => {
    it('matches records with a trace id independently of data source context', () => {
      const spanDocumentProfileProvider =
        createObservabilityTracesDocumentProfileProvider(mockServices);

      expect(
        spanDocumentProfileProvider.resolve({
          rootContext: getRootContext({
            profileId: 'classic-nav-root-profile',
            solutionType: SolutionType.Default,
          }),
          dataSourceContext: {
            profileId: 'default-data-source-profile',
            category: DataSourceCategory.Default,
          },
          record: buildTraceMockRecord('traces-index', {
            'trace.id': ['c0ffee'],
          }),
        })
      ).toEqual(RESOLUTION_MATCH);
    });
  });
});

const buildTraceMockRecord = (index: string, fields: Record<string, unknown> = {}) =>
  buildDataTableRecord({
    _id: '',
    _index: index,
    fields: {
      _index: index,
      ...fields,
    },
  });
