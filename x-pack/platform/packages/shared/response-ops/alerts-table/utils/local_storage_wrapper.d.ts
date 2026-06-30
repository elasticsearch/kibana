import type { IStorage, IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
export declare class LocalStorageWrapper implements IStorageWrapper {
    store: IStorage;
    constructor(store: IStorage);
    get: <T>(key: string) => T | null;
    set: <T>(key: string, value: T) => void;
    remove: (key: string) => any;
    clear: () => void;
}
