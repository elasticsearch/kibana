/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { FormattedRelativePreferenceDate } from '../formatted_date';
import { getMaybeDate } from '../formatted_date/maybe_date';
import { getEmptyCellValue } from '../empty_value';

interface Props {
  date: string;
}

export const CreationDate: React.FC<Props> = React.memo(({ date }) => {
  const parsed = getMaybeDate(date);
  if (!parsed.isValid()) {
    return getEmptyCellValue();
  }

  return (
    <FormattedRelativePreferenceDate
      data-test-subj="case-metrics-lifespan-creation-date"
      value={date}
      stripMs={true}
    />
  );
});
CreationDate.displayName = 'CreationDate';
