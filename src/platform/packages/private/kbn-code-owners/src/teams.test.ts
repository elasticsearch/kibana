/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { CODE_OWNER_AREAS } from './code_owner_areas';
import { getTeams, getTeamById, getTeamByGithubHandle } from './teams';

describe('team registry', () => {
  describe('getTeams', () => {
    it('returns a non-empty list of teams', () => {
      expect(getTeams().length).toBeGreaterThan(0);
    });

    it('memoizes the parsed registry', () => {
      expect(getTeams()).toBe(getTeams());
    });

    it('only contains valid entries', () => {
      for (const team of getTeams()) {
        expect(typeof team.id).toBe('string');
        expect(team.id.length).toBeGreaterThan(0);
        expect(typeof team.name).toBe('string');
        expect(team.name.length).toBeGreaterThan(0);
        expect(typeof team.github).toBe('object');
      }
    });

    it('has unique team ids', () => {
      const ids = getTeams().map((team) => team.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('has unique GitHub team handles', () => {
      const handles = getTeams()
        .map((team) => team.github.team)
        .filter((handle): handle is string => handle !== undefined);
      expect(new Set(handles).size).toBe(handles.length);
    });

    it('only uses known areas', () => {
      for (const team of getTeams()) {
        for (const area of team.areas ?? []) {
          expect(CODE_OWNER_AREAS).toContain(area);
        }
      }
    });
  });

  describe('getTeamById', () => {
    it('resolves a known team by id', () => {
      expect(getTeamById('core')?.github.team).toBe('elastic/kibana-core');
    });

    it('returns undefined for an unknown id', () => {
      expect(getTeamById('does-not-exist')).toBeUndefined();
    });
  });

  describe('getTeamByGithubHandle', () => {
    it('resolves a known team by handle', () => {
      expect(getTeamByGithubHandle('elastic/kibana-core')?.id).toBe('core');
    });

    it('ignores a leading @ in the handle', () => {
      expect(getTeamByGithubHandle('@elastic/kibana-core')).toBe(
        getTeamByGithubHandle('elastic/kibana-core')
      );
    });

    it('returns undefined for an unknown handle', () => {
      expect(getTeamByGithubHandle('elastic/does-not-exist')).toBeUndefined();
    });
  });
});
