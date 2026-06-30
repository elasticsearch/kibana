import type { Type, TypeOf } from '@kbn/config-schema';
export declare const dataViewSpecSchema: import("@kbn/config-schema").ObjectType<{
    title: Type<string>;
    version: Type<string | undefined>;
    id: Type<string | undefined>;
    type: Type<string | undefined>;
    timeFieldName: Type<string | undefined>;
    sourceFilters: Type<Readonly<{
        clientId?: string | number | undefined;
    } & {
        value: string;
    }>[] | undefined>;
    fields: Type<Record<string, Readonly<{
        script?: string | undefined;
        format?: Readonly<{
            id?: string | undefined;
            params?: any;
        } & {}> | undefined;
        count?: number | undefined;
        searchable?: boolean | undefined;
        customLabel?: string | undefined;
        customDescription?: string | undefined;
        esTypes?: string[] | undefined;
        scripted?: boolean | undefined;
        subType?: Readonly<{
            nested?: Readonly<{} & {
                path: string;
            }> | undefined;
            multi?: Readonly<{} & {
                parent: string;
            }> | undefined;
        } & {}> | undefined;
        shortDotsEnable?: boolean | undefined;
        aggregatable?: boolean | undefined;
        readFromDocValues?: boolean | undefined;
        runtimeField?: Readonly<{
            script?: Readonly<{} & {
                source: string;
            }> | undefined;
            format?: Readonly<{
                id?: string | undefined;
                params?: any;
            } & {}> | undefined;
            customLabel?: string | undefined;
            customDescription?: string | undefined;
            popularity?: number | undefined;
        } & {
            type: "boolean" | "ip" | "date" | "double" | "long" | "keyword" | "geo_point" | "composite";
        }> | Readonly<{
            script?: Readonly<{} & {
                source: string;
            }> | undefined;
            fields?: Record<string, Readonly<{
                format?: Readonly<{
                    id?: string | undefined;
                    params?: any;
                } & {}> | undefined;
                customLabel?: string | undefined;
                customDescription?: string | undefined;
                popularity?: number | undefined;
            } & {
                type: "boolean" | "ip" | "date" | "double" | "long" | "keyword" | "geo_point" | "composite";
            }>> | undefined;
        } & {
            type: "boolean" | "ip" | "date" | "double" | "long" | "keyword" | "geo_point" | "composite";
        }> | undefined;
    } & {
        type: string;
        name: string;
    }>> | undefined>;
    typeMeta: Type<Readonly<{} & {}> | undefined>;
    fieldFormats: Type<Record<string, Readonly<{
        id?: string | undefined;
        params?: any;
    } & {}>> | undefined>;
    fieldAttrs: Type<Record<string, Readonly<{
        count?: number | undefined;
        customLabel?: string | undefined;
        customDescription?: string | undefined;
    } & {}>> | undefined>;
    allowNoIndex: Type<boolean | undefined>;
    runtimeFieldMap: Type<Record<string, Readonly<{
        script?: Readonly<{} & {
            source: string;
        }> | undefined;
        format?: Readonly<{
            id?: string | undefined;
            params?: any;
        } & {}> | undefined;
        customLabel?: string | undefined;
        customDescription?: string | undefined;
        popularity?: number | undefined;
    } & {
        type: "boolean" | "ip" | "date" | "double" | "long" | "keyword" | "geo_point" | "composite";
    }> | Readonly<{
        script?: Readonly<{} & {
            source: string;
        }> | undefined;
        fields?: Record<string, Readonly<{
            format?: Readonly<{
                id?: string | undefined;
                params?: any;
            } & {}> | undefined;
            customLabel?: string | undefined;
            customDescription?: string | undefined;
            popularity?: number | undefined;
        } & {
            type: "boolean" | "ip" | "date" | "double" | "long" | "keyword" | "geo_point" | "composite";
        }>> | undefined;
    } & {
        type: "boolean" | "ip" | "date" | "double" | "long" | "keyword" | "geo_point" | "composite";
    }>> | undefined>;
    name: Type<string | undefined>;
    namespaces: Type<string[] | undefined>;
    allowHidden: Type<boolean | undefined>;
    managed: Type<boolean | undefined>;
}>;
export type DataViewSpec = TypeOf<typeof dataViewSpecSchema>;
