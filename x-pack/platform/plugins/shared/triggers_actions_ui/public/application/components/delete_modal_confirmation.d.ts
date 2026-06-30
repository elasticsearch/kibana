import React from 'react';
import type { HttpSetup } from '@kbn/core/public';
export declare const DeleteModalConfirmation: ({ idsToDelete, apiDeleteCall, onDeleted, onCancel, onErrors, singleTitle, multipleTitle, showWarningText, warningText, setIsLoadingState, }: {
    idsToDelete: string[];
    apiDeleteCall: ({ ids, http, }: {
        ids: string[];
        http: HttpSetup;
    }) => Promise<{
        successes: string[];
        errors: string[];
    }>;
    onDeleted: (deleted: string[]) => void;
    onCancel: () => void;
    onErrors: () => void;
    singleTitle: string;
    multipleTitle: string;
    setIsLoadingState: (isLoading: boolean) => void;
    showWarningText?: boolean;
    warningText?: string;
}) => React.JSX.Element | null;
