import React from 'react';
import type { ChromeBreadcrumb, CoreStart, CoreTheme, ScopedHistory } from '@kbn/core/public';
import type { Observable } from 'rxjs';
import type { KibanaFeature } from '@kbn/features-plugin/common';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { DataViewEditorStart } from '@kbn/data-view-editor-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { PluginStartContract as AlertingStart } from '@kbn/alerting-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { CloudSetup } from '@kbn/cloud-plugin/public';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { ActionsPublicPluginSetup } from '@kbn/actions-plugin/public';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { ActionTypeRegistryContract, RuleTypeRegistryContract } from '../types';
export interface TriggersAndActionsUiServices extends CoreStart {
    actions: ActionsPublicPluginSetup;
    cloud?: CloudSetup;
    data: DataPublicPluginStart;
    dataViews: DataViewsPublicPluginStart;
    dataViewEditor: DataViewEditorStart;
    charts: ChartsPluginStart;
    alerting?: AlertingStart;
    spaces?: SpacesPluginStart;
    storage?: Storage;
    isCloud: boolean;
    setBreadcrumbs: (crumbs: ChromeBreadcrumb[]) => void;
    actionTypeRegistry: ActionTypeRegistryContract;
    ruleTypeRegistry: RuleTypeRegistryContract;
    history: ScopedHistory;
    kibanaFeatures: KibanaFeature[];
    element: HTMLElement;
    theme$: Observable<CoreTheme>;
    unifiedSearch: UnifiedSearchPublicPluginStart;
    share: SharePluginStart;
    isServerless: boolean;
    uiActions?: UiActionsStart;
}
export declare const renderApp: (deps: TriggersAndActionsUiServices) => () => void;
export declare const App: ({ deps }: {
    deps: TriggersAndActionsUiServices;
}) => React.ReactElement<any, string | React.JSXElementConstructor<any>>;
export declare const AppWithoutRouter: ({ sectionsRegex }: {
    sectionsRegex: string;
}) => React.JSX.Element;
