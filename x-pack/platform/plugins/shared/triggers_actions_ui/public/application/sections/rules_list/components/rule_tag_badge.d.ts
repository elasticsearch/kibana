import React from 'react';
export type RuleTagBadgeOptions = 'tagsOutPopover' | 'default';
export interface RuleTagBadgeBasicOptions {
    isOpen: boolean;
    onClick: React.MouseEventHandler<HTMLButtonElement>;
    onClose: () => void;
}
export interface RuleTagBadgeCommonProps {
    tagsOutPopover?: boolean;
    tags: string[];
    badgeDataTestSubj?: string;
    titleDataTestSubj?: string;
    tagItemDataTestSubj?: (tag: string) => string;
}
export type RuleTagBadgeProps<T extends RuleTagBadgeOptions = 'default'> = T extends 'default' ? RuleTagBadgeBasicOptions & RuleTagBadgeCommonProps : T extends 'tagsOutPopover' ? RuleTagBadgeCommonProps : never;
export declare const RuleTagBadge: <T extends RuleTagBadgeOptions>(props: RuleTagBadgeProps<T>) => React.JSX.Element;
export { RuleTagBadge as default };
