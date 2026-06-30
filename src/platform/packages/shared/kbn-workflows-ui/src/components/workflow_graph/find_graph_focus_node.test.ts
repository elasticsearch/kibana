/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { WORKFLOW_GRAPH_FOCUS_TRIGGER } from '@kbn/workflows';
import { findGraphFocusNode } from './find_graph_focus_node';

const nodes = [
  { id: 'manual', type: 'trigger', data: { label: 'Manual' } },
  { id: 'my-step', type: 'step', data: { label: 'My Step' } },
];

describe('findGraphFocusNode', () => {
  it('matches by step label', () => {
    expect(findGraphFocusNode(nodes, 'My Step')).toEqual(nodes[1]);
  });

  it('matches by node id slug', () => {
    expect(findGraphFocusNode(nodes, 'my-step')).toEqual(nodes[1]);
  });

  it('resolves WORKFLOW_GRAPH_FOCUS_TRIGGER to the first trigger node', () => {
    expect(findGraphFocusNode(nodes, WORKFLOW_GRAPH_FOCUS_TRIGGER)).toEqual(nodes[0]);
  });

  it('returns undefined when nothing matches', () => {
    expect(findGraphFocusNode(nodes, 'missing')).toBeUndefined();
  });
});
