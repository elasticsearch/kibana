/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const changeTypeIcons: Record<string, string> = {
  create: 'plusInCircle',
  update: 'pencil',
  delete: 'trash',
  rename: 'sortRight',
};

export const changeTypeColors: Record<string, 'success' | 'primary' | 'danger' | 'warning'> = {
  create: 'success',
  update: 'primary',
  delete: 'danger',
  rename: 'warning',
};
