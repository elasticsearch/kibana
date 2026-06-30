import type { KueryNode } from '@kbn/es-query';
import React from 'react';
import type { HttpSetup } from '@kbn/core/public';
import type { BulkEditResponse, RuleTableItem } from '../../types';
export declare const UpdateApiKeyModalConfirmation: ({ onCancel, idsToUpdate, rulesToUpdate, idsToUpdateFilter, numberOfSelectedRules, apiUpdateApiKeyCall, setIsLoadingState, onUpdated, onSearchPopulate, }: {
    onCancel: () => void;
    idsToUpdate?: string[];
    rulesToUpdate?: RuleTableItem[];
    idsToUpdateFilter?: KueryNode | null | undefined;
    numberOfSelectedRules?: number;
    apiUpdateApiKeyCall: ({ ids, http, filter, }: {
        ids?: string[];
        filter?: KueryNode | null | undefined;
        http: HttpSetup;
    }) => Promise<BulkEditResponse>;
    setIsLoadingState: (isLoading: boolean) => void;
    onUpdated: () => void;
    onSearchPopulate?: (filter: string) => void;
}) => React.JSX.Element | null;
