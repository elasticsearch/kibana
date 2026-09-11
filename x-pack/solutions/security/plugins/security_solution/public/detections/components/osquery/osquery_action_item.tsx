/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertTableContextMenuItem } from '../alerts_table/types';
import { ACTION_OSQUERY } from './translations';

interface IProps {
  handleClick: () => void;
}

export const OSQUERY_ACTION_ID = 'osquery-action-item';

export const getOsqueryActionItem = ({ handleClick }: IProps): AlertTableContextMenuItem => ({
  key: OSQUERY_ACTION_ID,
  'data-test-subj': 'osquery-action-item',
  onClick: handleClick,
  name: ACTION_OSQUERY,
});
