import React from 'react';
import { type UserActionTitleLinkProps } from '../user_action_title_link';
export interface UserActionTitleProps {
    label: string;
    link?: UserActionTitleLinkProps;
    dataTestSubj?: string;
}
export declare const UserActionTitle: React.NamedExoticComponent<UserActionTitleProps>;
