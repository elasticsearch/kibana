import React from 'react';
export interface UserActionTitleLinkProps {
    targetId?: string | null;
    label?: string | null;
    fallbackLabel?: string;
    getHref?: (targetId: string | null | undefined) => string | undefined;
    onClick?: (targetId: string | null | undefined, ev: React.MouseEvent | MouseEvent) => void;
    dataTestSubj?: string;
    isLoading?: boolean;
}
export declare const UserActionTitleLink: React.NamedExoticComponent<UserActionTitleLinkProps>;
