import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { IIndexPatternString } from '../resource_installer_utils';
import type { DataStreamAdapter } from './data_stream_adapter';
export interface ConcreteIndexInfo {
    index: string;
    alias: string;
    isWriteIndex: boolean;
    isHidden?: boolean;
}
interface UpdateIndexMappingsAndSettingsOpts {
    logger: Logger;
    esClient: ElasticsearchClient;
    totalFieldsLimit: number;
    concreteIndices: ConcreteIndexInfo[];
    simulatedMapping: MappingTypeMapping | undefined;
}
/**
 * Updates the underlying mapping for any existing concrete indices
 */
export declare const updateIndexMappingsAndSettings: ({ logger, esClient, totalFieldsLimit, concreteIndices, simulatedMapping, }: UpdateIndexMappingsAndSettingsOpts) => Promise<void>;
export interface CreateConcreteWriteIndexOpts {
    logger: Logger;
    esClient: ElasticsearchClient;
    totalFieldsLimit: number;
    indexPatterns: IIndexPatternString;
    dataStreamAdapter: DataStreamAdapter;
}
/**
 * Installs index template that uses installed component template
 * Prior to installation, simulates the installation to check for possible
 * conflicts. Simulate should return an empty mapping if a template
 * conflicts with an already installed template.
 */
export declare const createConcreteWriteIndex: (opts: CreateConcreteWriteIndexOpts) => Promise<void>;
interface UpdateAliasesAndSetConcreteWriteIndexOpts {
    logger: Logger;
    esClient: ElasticsearchClient;
    concreteIndices: ConcreteIndexInfo[];
    alias: string;
}
export declare function updateAliasesAndSetConcreteWriteIndex(opts: UpdateAliasesAndSetConcreteWriteIndexOpts): Promise<ConcreteIndexInfo>;
export {};
