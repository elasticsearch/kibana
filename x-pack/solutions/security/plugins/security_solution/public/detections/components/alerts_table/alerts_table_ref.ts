/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RefObject } from 'react';
import type { AlertsTableImperativeApi } from '@kbn/response-ops-alerts-table/types';

/**
 * Module-scoped imperative ref for the alerts table. Only one alerts table
 * is mounted at a time in the security app. Placing this here (rather than
 * in the pagination context) lets consumers outside the alerts tree — e.g.
 * cell actions in the document details flyout — still reach the alerts
 * table's `refresh()` API without going through a React context.
 */
export const alertsTableRef: RefObject<AlertsTableImperativeApi> = { current: null };
