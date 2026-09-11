/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useState } from 'react';
import { distinctUntilChanged, map } from 'rxjs';

import type { AggregateQuery } from '@kbn/es-query';
import type { PublishingSubject } from '../publishing_subject';
import { combineCompatibleChildrenApis } from './containers/presentation_container';

/**
 * For embeddables that can use ES|QL internally without necessarily publishing
 * an ES|QL `query$` (e.g. a Vega spec with one or more ES|QL data sources).
 */
export interface PublishesEsql {
  /** Emits the ES|QL queries currently executed by the embeddable — empty array when not in ES|QL mode. */
  esql$: PublishingSubject<AggregateQuery[]>;
  /** Emits the `approximation_applied` flag from the most recent ES|QL response — `true` if Elasticsearch applied approximate execution, `false` if it ran exactly, or `undefined` before the first response or when the panel is not in ES|QL mode. */
  approximationApplied$: PublishingSubject<boolean | undefined>;
}

export const apiPublishesEsql = (unknownApi: unknown): unknownApi is PublishesEsql =>
  Boolean(
    unknownApi &&
      (unknownApi as PublishesEsql)?.esql$ !== undefined &&
      (unknownApi as PublishesEsql)?.approximationApplied$ !== undefined
  );

export function useHasEsqlPanel(parentApi: unknown): boolean {
  const [hasEsqlPanel, setHasEsqlPanel] = useState(false);
  useEffect(() => {
    const subscription = combineCompatibleChildrenApis<PublishesEsql, AggregateQuery[]>(
      parentApi,
      'esql$',
      apiPublishesEsql,
      []
    )
      .pipe(
        map((esqlValues) => esqlValues.length > 0),
        distinctUntilChanged()
      )
      .subscribe(setHasEsqlPanel);
    return () => subscription.unsubscribe();
  }, [parentApi]);
  return hasEsqlPanel;
}
