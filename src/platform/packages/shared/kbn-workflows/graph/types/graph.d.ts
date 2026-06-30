import type { graphlib } from '@dagrejs/dagre';
import type { GraphNodeUnion } from './nodes/union';
export type WorkflowGraphType = graphlib.Graph<GraphNodeUnion>;
