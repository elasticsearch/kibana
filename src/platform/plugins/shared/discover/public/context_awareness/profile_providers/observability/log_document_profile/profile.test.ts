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
import type {
  DataSourceContext,
  DocumentProfileProviderParams,
  RootContext,
} from '../../../profiles';
import { DataSourceCategory, SolutionType } from '../../../profiles';
import { createProfileProviderSharedServicesMock } from '../../../__mocks__';
import { createObservabilityLogDocumentProfileProvider } from './profile';
import type { ContextWithProfileId } from '../../../profile_service';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../../toolkit';
import { OBSERVABILITY_ROOT_PROFILE_ID } from '../consts';
import { RESOLUTION_MATCH } from './__mocks__/log_document_resolution_match';

const mockServices = createProfileProviderSharedServicesMock();

describe('logDocumentProfileProvider', () => {
  const logDocumentProfileProvider = createObservabilityLogDocumentProfileProvider(mockServices);
  const ROOT_CONTEXT: ContextWithProfileId<RootContext> = {
    profileId: OBSERVABILITY_ROOT_PROFILE_ID,
    solutionType: SolutionType.Observability,
  };
  const DATA_SOURCE_CONTEXT: ContextWithProfileId<DataSourceContext> = {
    profileId: 'data-source-profile',
    category: DataSourceCategory.Logs,
  };
  const RESOLUTION_MISMATCH = {
    isMatch: false,
  };

  it('matches records with the correct data stream type', () => {
    expect(
      logDocumentProfileProvider.resolve({
        rootContext: ROOT_CONTEXT,
        dataSourceContext: DATA_SOURCE_CONTEXT,
        record: buildMockRecord('another-index', {
          'data_stream.type': ['logs'],
        }),
      })
    ).toEqual(RESOLUTION_MATCH);
  });

  it('matches records with fields prefixed with "log."', () => {
    expect(
      logDocumentProfileProvider.resolve({
        rootContext: ROOT_CONTEXT,
        dataSourceContext: DATA_SOURCE_CONTEXT,
        record: buildMockRecord('another-index', {
          'log.level': ['INFO'],
        }),
      })
    ).toEqual(RESOLUTION_MATCH);
  });

  it('matches records which have a stream.name set to logs', () => {
    expect(
      logDocumentProfileProvider.resolve({
        rootContext: ROOT_CONTEXT,
        dataSourceContext: DATA_SOURCE_CONTEXT,
        record: buildMockRecord('another-index', {
          'stream.name': 'logs.abc.def',
        }),
      })
    ).toEqual(RESOLUTION_MATCH);
  });

  it('does not match records which have a different stream.name', () => {
    expect(
      logDocumentProfileProvider.resolve({
        rootContext: ROOT_CONTEXT,
        dataSourceContext: DATA_SOURCE_CONTEXT,
        record: buildMockRecord('another-index', {
          'stream.name': 'metrics',
        }),
      })
    ).toEqual(RESOLUTION_MISMATCH);
  });

  it('does not match records where fields prefixed with "log." are null', () => {
    expect(
      logDocumentProfileProvider.resolve({
        rootContext: ROOT_CONTEXT,
        dataSourceContext: DATA_SOURCE_CONTEXT,
        record: buildMockRecord('another-index', {
          'log.level': null,
          'log.other': undefined,
        }),
      })
    ).toEqual(RESOLUTION_MISMATCH);
  });

  it('matches records with indices matching the allowed pattern', () => {
    expect(
      logDocumentProfileProvider.resolve({
        rootContext: ROOT_CONTEXT,
        dataSourceContext: DATA_SOURCE_CONTEXT,
        record: buildMockRecord('logs-2000-01-01'),
      })
    ).toEqual(RESOLUTION_MATCH);
    expect(
      logDocumentProfileProvider.resolve({
        rootContext: ROOT_CONTEXT,
        dataSourceContext: DATA_SOURCE_CONTEXT,
        record: buildMockRecord('remote_cluster:filebeat'),
      })
    ).toEqual(RESOLUTION_MATCH);
  });

  it('does not match records with neither characteristic', () => {
    expect(
      logDocumentProfileProvider.resolve({
        rootContext: ROOT_CONTEXT,
        dataSourceContext: DATA_SOURCE_CONTEXT,
        record: buildMockRecord('another-index'),
      })
    ).toEqual(RESOLUTION_MISMATCH);
  });

  it('matches records in Classic but not other solution views', () => {
    const params: Omit<DocumentProfileProviderParams, 'rootContext'> = {
      dataSourceContext: DATA_SOURCE_CONTEXT,
      record: buildMockRecord('another-index', {
        'data_stream.type': ['logs'],
      }),
    };
    expect(
      logDocumentProfileProvider.resolve({
        ...params,
        rootContext: ROOT_CONTEXT,
      })
    ).toEqual(RESOLUTION_MATCH);
    expect(
      logDocumentProfileProvider.resolve({
        ...params,
        rootContext: { profileId: 'other-data-source-profile', solutionType: SolutionType.Default },
      })
    ).toEqual(RESOLUTION_MATCH);
    expect(
      logDocumentProfileProvider.resolve({
        ...params,
        rootContext: { profileId: 'other-data-source-profile', solutionType: SolutionType.Search },
      })
    ).toEqual(RESOLUTION_MISMATCH);
    expect(
      logDocumentProfileProvider.resolve({
        ...params,
        rootContext: {
          profileId: 'other-data-source-profile',
          solutionType: SolutionType.Security,
        },
      })
    ).toEqual(RESOLUTION_MISMATCH);
  });

  describe('getDocViewer', () => {
    it('adds a log overview doc view to the registry', () => {
      const getDocViewer = logDocumentProfileProvider.profile.getDocViewer!(
        () => ({
          title: 'test title',
          docViewsRegistry: (registry) => registry,
        }),
        { context: RESOLUTION_MATCH.context, toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT }
      );
      const docViewer = getDocViewer({
        record: buildDataTableRecord({}),
      });
      const registry = new DocViewsRegistry();

      expect(docViewer.title).toBe('test title');
      expect(registry.getAll()).toHaveLength(0);
      docViewer.docViewsRegistry(registry);
      expect(registry.getAll()).toHaveLength(1);
      expect(registry.getAll()[0]).toEqual(
        expect.objectContaining({
          id: 'doc_view_logs_overview',
          title: 'Log overview',
          order: 0,
          render: expect.any(Function),
        })
      );
    });
  });
});

const buildMockRecord = (index: string, fields: Record<string, unknown> = {}) =>
  buildDataTableRecord({
    _id: '',
    _index: index,
    fields: {
      _index: index,
      ...fields,
    },
  });
