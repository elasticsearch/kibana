import type { IUiSettingsClient } from '@kbn/core/server';
export declare function getEsQueryConfig(uiSettings: IUiSettingsClient): Promise<{
    allowLeadingWildcards: any;
    queryStringOptions: any;
    ignoreFilterIfFieldNotInIndex: any;
}>;
