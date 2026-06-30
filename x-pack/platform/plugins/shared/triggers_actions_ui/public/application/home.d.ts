import React from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import type { Section } from './constants';
export interface MatchParams {
    section: Section;
}
export declare const TriggersActionsUIHome: React.FunctionComponent<RouteComponentProps<MatchParams>>;
export { TriggersActionsUIHome as default };
