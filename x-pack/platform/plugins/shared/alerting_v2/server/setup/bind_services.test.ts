/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Container, ContainerModule } from 'inversify';
import { Logger } from '@kbn/core-di';
import { CoreStart, Request } from '@kbn/core-di-server';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import {
  EsServiceInternalToken,
  EsServiceScopedToken,
  EsServiceScopedSpaceRoutingToken,
} from '../lib/services/es_service/tokens';
import {
  QueryServiceScopedToken,
  QueryServiceScopedSpaceRoutingToken,
} from '../lib/services/query_service/tokens';
import { bindServices } from './bind_services';

describe('bindServices - Elasticsearch client routing', () => {
  let container: Container;
  let elasticsearch: ReturnType<typeof elasticsearchServiceMock.createStart>;
  let request: ReturnType<typeof httpServerMock.createKibanaRequest>;

  beforeEach(() => {
    container = new Container();
    elasticsearch = elasticsearchServiceMock.createStart();
    request = httpServerMock.createKibanaRequest();

    container.bind(CoreStart('elasticsearch')).toConstantValue(elasticsearch);
    container.bind(Request).toConstantValue(request);
    container.bind(Logger).toConstantValue(loggingSystemMock.createLogger());

    container.loadSync(new ContainerModule((options) => bindServices(options)));
  });

  it('binds the internal client to asInternalUser (origin-only, local)', () => {
    expect(container.get(EsServiceInternalToken)).toBe(elasticsearch.client.asInternalUser);
    expect(elasticsearch.client.asScoped).not.toHaveBeenCalled();
  });

  it('binds the scoped client to asCurrentUser without project routing (local)', () => {
    const client = container.get(EsServiceScopedToken);

    expect(elasticsearch.client.asScoped).toHaveBeenCalledTimes(1);
    expect(elasticsearch.client.asScoped).toHaveBeenCalledWith(request);
    expect(client).toBe(elasticsearch.client.asScoped.mock.results[0].value.asCurrentUser);
  });

  it("binds the space-routed scoped client with projectRouting: 'space'", () => {
    const client = container.get(EsServiceScopedSpaceRoutingToken);

    expect(elasticsearch.client.asScoped).toHaveBeenCalledTimes(1);
    expect(elasticsearch.client.asScoped).toHaveBeenCalledWith(request, {
      projectRouting: 'space',
    });
    expect(client).toBe(elasticsearch.client.asScoped.mock.results[0].value.asCurrentUser);
  });

  it('wires the scoped QueryService to the origin-only (local) client', () => {
    container.get(QueryServiceScopedToken);

    expect(elasticsearch.client.asScoped).toHaveBeenCalledTimes(1);
    expect(elasticsearch.client.asScoped).toHaveBeenCalledWith(request);
  });

  it("wires the space-routed scoped QueryService with projectRouting: 'space'", () => {
    container.get(QueryServiceScopedSpaceRoutingToken);

    expect(elasticsearch.client.asScoped).toHaveBeenCalledTimes(1);
    expect(elasticsearch.client.asScoped).toHaveBeenCalledWith(request, {
      projectRouting: 'space',
    });
  });
});
