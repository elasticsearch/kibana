import type { ActionConnector } from '@kbn/alerts-ui-shared';
import React from 'react';
export interface RuleActionsConnectorsBodyProps {
    onSelectConnector: (connector?: ActionConnector) => void;
    responsiveOverflow?: 'auto' | 'hidden';
}
export declare const RuleActionsConnectorsBody: ({ onSelectConnector, responsiveOverflow, }: RuleActionsConnectorsBodyProps) => React.JSX.Element;
