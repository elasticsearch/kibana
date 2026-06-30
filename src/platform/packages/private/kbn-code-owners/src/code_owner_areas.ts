/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getTeamByGithubHandle, getTeams } from './teams';

/**
 * Code owner area names
 */
export const CODE_OWNER_AREAS = [
  'platform',
  'search',
  'observability',
  'security',
  'workplaceai',
  'vectordb',
] as const;
export type CodeOwnerArea = (typeof CODE_OWNER_AREAS)[number];

/**
 * Area mappings for code owners, derived from the team registry (`teams.jsonc`).
 */
export const CODE_OWNER_AREA_MAPPINGS: { [area in CodeOwnerArea]: string[] } =
  CODE_OWNER_AREAS.reduce((mappings, area) => {
    mappings[area] = getTeams()
      .filter((team) => team.github.team !== undefined && team.areas?.includes(area))
      .map((team) => team.github.team as string);
    return mappings;
  }, {} as { [area in CodeOwnerArea]: string[] });

/**
 * Find what area a code owner belongs to
 *
 * A team may belong to several areas; the primary area is the first one in
 * {@link CODE_OWNER_AREAS} order, preserving the historical lookup behavior.
 *
 * @param owner Owner to find an area name
 * @returns The code owner area if a match for the given owner is found
 */
export function findAreaForCodeOwner(owner: string): CodeOwnerArea | undefined {
  const areas = getTeamByGithubHandle(owner)?.areas;
  if (areas === undefined) return undefined;
  return CODE_OWNER_AREAS.find((area) => areas.includes(area));
}
