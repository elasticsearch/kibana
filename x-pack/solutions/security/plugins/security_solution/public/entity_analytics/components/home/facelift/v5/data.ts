/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type SignalCardId =
  | 'entitiesWithAlerts'
  | 'entitiesWithAnomalies'
  | 'riskMovers'
  | 'newlyHighCritical'
  | 'watchlisted'
  | 'newEntity';

export interface SignalCardData {
  id: SignalCardId;
  title: string;
  value: number;
  description: string;
  delta?: number;
  filterLabel: string;
  trend?: number[];
}

export interface ActiveFilter {
  type: 'card';
  cardId: SignalCardId;
  label: string;
  exclude?: boolean;
}
