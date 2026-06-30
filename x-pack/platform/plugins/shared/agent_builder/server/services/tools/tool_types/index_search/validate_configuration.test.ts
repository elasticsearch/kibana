/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EsResourceType } from '@kbn/agent-builder-common';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import type { IndexSearchToolConfig } from '@kbn/agent-builder-common/tools';
import { validateConfig } from './validate_configuration';
import { listSearchSources as _listSearchSources } from '@kbn/agent-builder-genai-utils';

jest.mock('@kbn/agent-builder-genai-utils');

const listSearchSourcesMock = _listSearchSources as jest.MockedFunction<typeof _listSearchSources>;

describe('validateConfig', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
  });

  afterEach(() => {
    listSearchSourcesMock.mockReset();
  });

  it('calls listSearchSources with the expected parameters', async () => {
    const config: IndexSearchToolConfig = {
      pattern: 'some-pattern-*',
    };

    listSearchSourcesMock.mockResolvedValue({
      indices: [{ type: EsResourceType.index, name: 'some-pattern-index' }],
      aliases: [],
      data_streams: [],
      datasets: [],
    });

    await validateConfig({ config, esClient });

    expect(listSearchSourcesMock).toHaveBeenCalledTimes(1);
    expect(listSearchSourcesMock).toHaveBeenCalledWith({
      pattern: config.pattern,
      esClient,
    });
  });

  it('throws an error if the pattern does not match any source', async () => {
    const config: IndexSearchToolConfig = {
      pattern: 'some-pattern',
    };

    listSearchSourcesMock.mockResolvedValue({
      indices: [],
      aliases: [],
      data_streams: [],
      datasets: [],
    });

    await expect(() =>
      validateConfig({ config, esClient })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"No sources found for pattern 'some-pattern'"`);
  });

  it('returns without errors if at least one source is found', async () => {
    const config: IndexSearchToolConfig = {
      pattern: 'some-pattern-*',
    };

    listSearchSourcesMock.mockResolvedValue({
      indices: [{ type: EsResourceType.index, name: 'some-pattern-index' }],
      aliases: [],
      data_streams: [],
      datasets: [],
    });

    await validateConfig({ config, esClient });
  });
});
