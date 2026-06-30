import React from 'react';
import type { IconType } from '@elastic/eui';
interface Props {
    icon?: IconType | null;
    actionTypeName?: string | null;
    actionTypeMessage?: string | null;
    compatibility?: string[] | null;
    isExperimental?: boolean;
}
export declare const FlyoutHeader: React.NamedExoticComponent<Props>;
export {};
