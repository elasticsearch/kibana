/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ContextWithProfileId } from '../../../../profile_service';
import { createEsqlDataSource } from '../../../../../../common/data_sources';
import type { DataSourceProfileProviderParams, RootContext } from '../../../../profiles';
import { SolutionType } from '../../../../profiles';
import { createResolve } from './create_resolve';
import { OBSERVABILITY_ROOT_PROFILE_ID } from '../../consts';
import { RESOLUTION_MATCH } from '../__mocks__/logs_data_source_resolution_match';

describe('createResolve', () => {
  const VALID_INDEX_PATTERN = 'valid';
  const INVALID_INDEX_PATTERN = 'invalid';
  const ROOT_CONTEXT: ContextWithProfileId<RootContext> = {
    profileId: OBSERVABILITY_ROOT_PROFILE_ID,
    solutionType: SolutionType.Observability,
  };
  const RESOLUTION_MISMATCH = {
    isMatch: false,
  };
  const resolve = createResolve(VALID_INDEX_PATTERN);

  it('should match a valid index pattern', () => {
    const result = resolve({
      rootContext: ROOT_CONTEXT,
      dataSource: createEsqlDataSource(),
      query: { esql: `FROM ${VALID_INDEX_PATTERN}` },
    });
    expect(result).toEqual(RESOLUTION_MATCH);
  });

  it('should not match an invalid index pattern', () => {
    const result = resolve({
      rootContext: ROOT_CONTEXT,
      dataSource: createEsqlDataSource(),
      query: { esql: `FROM ${INVALID_INDEX_PATTERN}` },
    });
    expect(result).toEqual(RESOLUTION_MISMATCH);
  });

  it('should match in Classic but not other solution views', () => {
    const params: Omit<DataSourceProfileProviderParams, 'rootContext'> = {
      dataSource: createEsqlDataSource(),
      query: { esql: `FROM ${VALID_INDEX_PATTERN}` },
    };
    expect(
      resolve({
        ...params,
        rootContext: ROOT_CONTEXT,
      })
    ).toEqual(RESOLUTION_MATCH);
    expect(
      resolve({
        ...params,
        rootContext: { profileId: 'other-root-profile', solutionType: SolutionType.Default },
      })
    ).toEqual(RESOLUTION_MATCH);
    expect(
      resolve({
        ...params,
        rootContext: { profileId: 'other-root-profile', solutionType: SolutionType.Search },
      })
    ).toEqual(RESOLUTION_MISMATCH);
    expect(
      resolve({
        ...params,
        rootContext: { profileId: 'other-root-profile', solutionType: SolutionType.Security },
      })
    ).toEqual(RESOLUTION_MISMATCH);
  });
});
