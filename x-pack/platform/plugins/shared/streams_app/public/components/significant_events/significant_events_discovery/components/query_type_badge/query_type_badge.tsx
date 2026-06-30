/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { QUERY_TYPE_STATS, type QueryType } from '@kbn/streams-schema';

const STATS_LABEL = i18n.translate('xpack.streams.queryTypeBadge.statsLabel', {
  defaultMessage: 'Stats',
});

const MATCH_LABEL = i18n.translate('xpack.streams.queryTypeBadge.matchLabel', {
  defaultMessage: 'Match',
});

export function QueryTypeBadge({ type }: { type: QueryType }) {
  const isStats = type === QUERY_TYPE_STATS;
  return (
    <EuiBadge color={isStats ? 'hollow' : 'default'}>
      {isStats ? STATS_LABEL : MATCH_LABEL}
    </EuiBadge>
  );
}
