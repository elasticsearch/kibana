export declare class CancellationToken {
    private _isCancelled;
    private _callbacks;
    constructor();
    on: (callback: Function) => void;
    cancel: () => void;
    isCancelled(): boolean;
}
