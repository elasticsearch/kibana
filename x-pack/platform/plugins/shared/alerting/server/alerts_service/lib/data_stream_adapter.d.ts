import type { CreateConcreteWriteIndexOpts } from './create_concrete_write_index';
export interface DataStreamAdapter {
    isUsingDataStreams(): boolean;
    getIndexTemplateFields(alias: string, patterns: string[]): IndexTemplateFields;
    createStream(opts: CreateConcreteWriteIndexOpts): Promise<void>;
}
export interface BulkOpProperties {
    require_alias: boolean;
}
export interface IndexTemplateFields {
    data_stream?: {
        hidden: true;
    };
    index_patterns: string[];
    rollover_alias?: string;
}
export interface GetDataStreamAdapterOpts {
    useDataStreamForAlerts: boolean;
}
export declare function getDataStreamAdapter(opts: GetDataStreamAdapterOpts): DataStreamAdapter;
