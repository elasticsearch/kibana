export declare const escapeFieldNameFactory: (query: string | null) => {
    escapeFieldName: (fieldName: string) => string;
    stringValueToESQLCondition: (fieldName: string, v: string | number | null | undefined) => string;
    getRenameQuery: () => string;
};
