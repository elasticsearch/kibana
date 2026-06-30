import type { ApplicationStart } from '@kbn/core/public';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import type { PropertySelectionHandler } from '@kbn/workflows/types/latest';
export interface IndexSelectionHandlerServices {
    dataViews: DataViewsContract;
    application: ApplicationStart;
}
export interface IndexSelectionHandlerOptions {
    /** Maximum number of results to return from the search API. Defaults to 20. */
    maxResults?: number;
    /** Whether to allow wildcard patterns in the index selection handler. Defaults to false. */
    allowWildcard?: boolean;
    /** Whether to show all indices, including hidden and internal ones. Defaults to false. */
    showAllIndices?: boolean;
}
export declare const getIndexSelectionHandler: (services: IndexSelectionHandlerServices, options?: IndexSelectionHandlerOptions) => PropertySelectionHandler<string>;
