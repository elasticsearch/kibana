import { graphlib } from '@dagrejs/dagre';
import type { GraphNodeUnion } from '../types';
export declare function createTypedGraph(opt?: {
    directed?: boolean;
    multigraph?: boolean;
    compound?: boolean;
}): graphlib.Graph<GraphNodeUnion>;
