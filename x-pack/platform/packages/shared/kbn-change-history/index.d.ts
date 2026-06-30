export type * from './src/types';
export * from './src/client';
export { ILM_POLICY_NAME } from './src/constants';
/**
 * @internal exported for test use only — do NOT use in production code,
 * this could cause the index to be created before the feature is ready for GA
 */
export { FLAGS } from './src/constants';
