import type { ConvertUiamAPIKeysResponse } from '@kbn/core-security-server';
import type { ApiKeyToConvert, ConvertApiKeysResult } from '../types';
/**
 * Maps the UIAM convert API response and input rules into a result map and failed-conversion status docs.
 * Caller must ensure convertResponse.results.length === apiKeysToConvert.length.
 */
export declare const mapConvertResponseToResult: (apiKeysToConvert: Array<ApiKeyToConvert>, convertResponse: ConvertUiamAPIKeysResponse) => ConvertApiKeysResult;
