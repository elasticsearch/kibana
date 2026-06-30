import type { ExperimentalFeatures } from '../../common/experimental_features';
export declare class ExperimentalFeaturesService {
    private static experimentalFeatures?;
    static init({ experimentalFeatures }: {
        experimentalFeatures: ExperimentalFeatures;
    }): void;
    static get(): ExperimentalFeatures;
    private static throwUninitializedError;
}
