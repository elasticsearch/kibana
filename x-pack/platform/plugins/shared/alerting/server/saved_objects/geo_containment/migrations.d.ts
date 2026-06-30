import type { SavedObjectReference, SavedObjectUnsanitizedDoc } from '@kbn/core/server';
import type { Query } from '@kbn/data-plugin/common/query';
import type { RuleTypeParams } from '../..';
import type { RawRule } from '../../types';
interface GeoContainmentParams extends RuleTypeParams {
    index: string;
    indexId: string;
    geoField: string;
    entity: string;
    dateField: string;
    boundaryType: string;
    boundaryIndexTitle: string;
    boundaryIndexId: string;
    boundaryGeoField: string;
    boundaryNameField?: string;
    indexQuery?: Query;
    boundaryIndexQuery?: Query;
}
type GeoContainmentExtractedParams = Omit<GeoContainmentParams, 'indexId' | 'boundaryIndexId'> & {
    indexRefName: string;
    boundaryIndexRefName: string;
};
export declare function extractEntityAndBoundaryReferences(params: GeoContainmentParams): {
    params: GeoContainmentExtractedParams;
    references: SavedObjectReference[];
};
export declare function extractRefsFromGeoContainmentAlert(doc: SavedObjectUnsanitizedDoc<RawRule>): SavedObjectUnsanitizedDoc<RawRule>;
export {};
