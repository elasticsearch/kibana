import React from 'react';
import type { KueryNode } from '@kbn/es-query';
export interface KqlSearchBarProps {
    onQuerySubmit: (kueryNode: KueryNode) => void;
}
export declare const KqlSearchBar: React.NamedExoticComponent<KqlSearchBarProps>;
