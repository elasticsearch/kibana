/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowsSearchParams } from '@kbn/workflows';
import { shouldShowWorkflowsEmptyState } from './workflow_utils';
import type { WorkflowsData } from './workflow_utils';

const createSearchParams = (
  overrides: Partial<WorkflowsSearchParams> = {}
): WorkflowsSearchParams => ({
  size: 10,
  page: 1,
  ...overrides,
});

describe('shouldShowWorkflowsEmptyState', () => {
  it('should return true when there are no workflows and no filters', () => {
    const workflows: WorkflowsData = { total: 0 };
    const search = createSearchParams();

    expect(shouldShowWorkflowsEmptyState(workflows, search)).toBe(true);
  });

  it('should return false when there are workflows', () => {
    const workflows: WorkflowsData = { total: 5 };
    const search = createSearchParams();

    expect(shouldShowWorkflowsEmptyState(workflows, search)).toBe(false);
  });

  it('should return false when workflows is undefined', () => {
    const search = createSearchParams();

    expect(shouldShowWorkflowsEmptyState(undefined, search)).toBe(false);
  });

  it('should return false when there is a query filter', () => {
    const workflows: WorkflowsData = { total: 0 };
    const search = createSearchParams({ query: 'test' });

    expect(shouldShowWorkflowsEmptyState(workflows, search)).toBe(false);
  });

  it('should return false when there is an enabled filter', () => {
    const workflows: WorkflowsData = { total: 0 };
    const search = createSearchParams({ enabled: [true] });

    expect(shouldShowWorkflowsEmptyState(workflows, search)).toBe(false);
  });

  it('should return false when there is a createdBy filter', () => {
    const workflows: WorkflowsData = { total: 0 };
    const search = createSearchParams({ createdBy: ['user1'] });

    expect(shouldShowWorkflowsEmptyState(workflows, search)).toBe(false);
  });

  it('should return false when there is a tags filter', () => {
    const workflows: WorkflowsData = { total: 0 };
    const search = createSearchParams({ tags: ['tag1'] });

    expect(shouldShowWorkflowsEmptyState(workflows, search)).toBe(false);
  });

  it('should return false when there is a managed filter', () => {
    const workflows: WorkflowsData = { total: 0 };
    const search = createSearchParams({ managed: 'managed' });

    expect(shouldShowWorkflowsEmptyState(workflows, search)).toBe(false);
  });

  it('should return true when filters are empty arrays', () => {
    const workflows: WorkflowsData = { total: 0 };
    const search = createSearchParams({ enabled: [], createdBy: [] });

    expect(shouldShowWorkflowsEmptyState(workflows, search)).toBe(true);
  });

  it('should return true when query is an empty string', () => {
    const workflows: WorkflowsData = { total: 0 };
    const search = createSearchParams({ query: '' });

    expect(shouldShowWorkflowsEmptyState(workflows, search)).toBe(true);
  });
});
