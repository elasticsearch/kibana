/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface EsqlResponse {
  columns: Array<{ name: string }>;
  values: unknown[][];
}

/** Values of one named column across an ES|QL `{ columns, values }` response. */
export const columnValues = ({ columns, values }: EsqlResponse, name: string): unknown[] => {
  const index = columns.findIndex((column) => column.name === name);
  return values.map((row) => row[index]);
};

/** Document fragment scoping a KI to a space, matching the `permissions.kibana.privileges` mapping. */
export const spaceScoped = (spaceId: string) => ({
  permissions: { kibana: { privileges: [{ space: spaceId }] } },
});
