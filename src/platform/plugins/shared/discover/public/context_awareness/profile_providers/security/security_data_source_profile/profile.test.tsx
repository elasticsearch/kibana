/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FunctionComponent } from 'react';
import { createStubIndexPattern } from '@kbn/data-views-plugin/common/data_view.stub';
import type { DataGridCellValueElementProps } from '@kbn/unified-data-table';
import { createDataViewDataSource, createEsqlDataSource } from '../../../../../common/data_sources';
import { createProfileProviderSharedServicesMock } from '../../../__mocks__';
import { DataSourceCategory, SolutionType } from '../../../profiles';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../../toolkit';
import { ALERTS_INDEX_PATTERN } from '../constants';
import { createSecurityDataSourceProfileProvider } from './profile';

const services = createProfileProviderSharedServicesMock();
const provider = createSecurityDataSourceProfileProvider(services);
const rootContext = (solutionType: SolutionType) => ({ profileId: 'root', solutionType });

describe('createSecurityDataSourceProfileProvider', () => {
  it('matches any otherwise unclaimed data source in Security navigation', async () => {
    await expect(
      provider.resolve({
        rootContext: rootContext(SolutionType.Security),
        dataSource: createDataViewDataSource({ dataViewId: 'ordinary-view' }),
        dataView: createStubIndexPattern({ spec: { id: 'ordinary-view', title: 'logs-*' } }),
      })
    ).resolves.toMatchObject({
      isMatch: true,
      context: { category: DataSourceCategory.Security },
    });
  });

  it('matches a managed Security data view in Classic navigation', async () => {
    await expect(
      provider.resolve({
        rootContext: rootContext(SolutionType.Default),
        dataSource: createDataViewDataSource({ dataViewId: 'security-solution-default' }),
        dataView: createStubIndexPattern({
          spec: { id: 'security-solution-default', title: 'logs-*,filebeat-*' },
        }),
      })
    ).resolves.toMatchObject({
      isMatch: true,
      context: { category: DataSourceCategory.Security },
    });
  });

  it('matches an all-Security ES|QL query in Classic navigation', async () => {
    await expect(
      provider.resolve({
        rootContext: rootContext(SolutionType.Default),
        dataSource: createEsqlDataSource(),
        query: {
          esql: 'FROM .alerts-security.alerts-default,logs-endpoint.events.process-*',
        },
      })
    ).resolves.toMatchObject({
      isMatch: true,
      context: { category: DataSourceCategory.Security },
    });
  });

  it('rejects a mixed Security and non-Security query in Classic navigation', async () => {
    await expect(
      provider.resolve({
        rootContext: rootContext(SolutionType.Default),
        dataSource: createEsqlDataSource(),
        query: { esql: 'FROM .alerts-security.alerts-default,logs-nginx.access-*' },
      })
    ).resolves.toEqual({ isMatch: false });
  });

  it.each([SolutionType.Observability, SolutionType.Search])(
    'does not match in %s navigation',
    async (solutionType) => {
      await expect(
        provider.resolve({
          rootContext: rootContext(solutionType),
          dataSource: createEsqlDataSource(),
          query: { esql: 'FROM .alerts-security.alerts-default' },
        })
      ).resolves.toEqual({ isMatch: false });
    }
  );

  it('adds Security cell renderers for alert data without overriding existing renderers', async () => {
    const MockRenderer: FunctionComponent<DataGridCellValueElementProps> = () => null;
    const ExistingRenderer: FunctionComponent<DataGridCellValueElementProps> = () => null;
    const providerServices = createProfileProviderSharedServicesMock();
    jest.spyOn(providerServices.discoverShared.features.registry, 'getById').mockReturnValue({
      id: 'security-solution-cell-renderer',
      getRenderer: async () => () => MockRenderer,
    });
    const securityProvider = createSecurityDataSourceProfileProvider(providerServices);
    const resolution = await securityProvider.resolve({
      rootContext: rootContext(SolutionType.Security),
    });
    if (!resolution.isMatch) throw new Error('Expected Security data source profile to match');

    const getCellRenderers = securityProvider.profile.getCellRenderers!(
      () => ({ 'source.ip': ExistingRenderer }),
      {
        context: resolution.context,
        toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
      }
    );
    const dataView = createStubIndexPattern({
      spec: {
        title: `${ALERTS_INDEX_PATTERN}default`,
        fields: {
          'source.ip': { name: 'source.ip', type: 'ip', searchable: true, aggregatable: true },
          'destination.ip': {
            name: 'destination.ip',
            type: 'ip',
            searchable: true,
            aggregatable: true,
          },
        },
      },
    });

    const renderers = getCellRenderers({ dataView } as Parameters<typeof getCellRenderers>[0]);
    expect(renderers['source.ip']).toBe(ExistingRenderer);
    expect(renderers['destination.ip']).toBeDefined();
    expect(renderers['kibana.alert.workflow_status']).toBeDefined();
  });
});
