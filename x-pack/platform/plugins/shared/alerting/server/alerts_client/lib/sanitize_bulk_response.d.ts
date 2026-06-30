import type { TransportResult } from '@elastic/elasticsearch';
import type { estypes } from '@elastic/elasticsearch';
export declare const sanitizeBulkErrorResponse: (response: TransportResult<estypes.BulkResponse, unknown> | estypes.BulkResponse) => TransportResult<estypes.BulkResponse, unknown> | estypes.BulkResponse;
