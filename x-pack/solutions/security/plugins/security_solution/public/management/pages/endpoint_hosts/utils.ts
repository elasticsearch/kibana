/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import dateMath from '@kbn/datemath';
import moment from 'moment';

export { isPolicyOutOfDate } from '../../../../common/endpoint/service/policy/rollout_status';

export const getIsInvalidDateRange = ({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) => {
  const start = moment(dateMath.parse(startDate));
  const end = moment(dateMath.parse(endDate));
  if (start.isValid() && end.isValid()) {
    return start.isAfter(end);
  }
  return false;
};
