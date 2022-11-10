export declare const createPubSub: () => {
    publish: (event: any, detail?: {}) => void;
    subscribe: (event: any, cb: any) => () => any;
    subscribeOnce: (event: any, cb: any) => () => any;
    unsubscribeAll: (event: any) => boolean;
};
