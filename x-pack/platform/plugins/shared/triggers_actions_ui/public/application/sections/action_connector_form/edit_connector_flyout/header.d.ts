import React from 'react';
import type { IconType } from '@elastic/eui';
import type { SubFeature } from '@kbn/actions-plugin/common';
import { EditConnectorTabs } from '../../../../types';
export declare const FlyoutHeader: React.NamedExoticComponent<{
    isExperimental?: boolean;
    subFeature?: SubFeature;
    isPreconfigured: boolean;
    connectorName: string;
    connectorTypeDesc: string;
    selectedTab: EditConnectorTabs;
    setTab: (nextPage: EditConnectorTabs) => void;
    icon?: IconType | null;
    isTestable?: boolean;
    hideRulesTab?: boolean;
}>;
