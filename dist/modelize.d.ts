declare type Validator<T> = (model: T, schema: any, assert?: boolean) => boolean;
export interface ModelizeConfig<T> {
    additionalProperties: boolean;
    schema: any;
    validator: Validator<T>;
}
interface ModelizedMethods<T> {
    toJSON: () => Record<keyof T, any>;
    __hydrate: (data?: Partial<Record<keyof T, any>>, forceClean?: boolean) => any;
    __isDirty: () => (keyof T)[];
    __setClean: () => Modelized<T>;
    __setDirty: (keys: (keyof T)[]) => Modelized<T>;
    __validate: (assert?: boolean) => boolean;
    __setSchema: (schema: any) => Modelized<T>;
    __getSchema: () => any;
    __setValidator: (validator: Validator<T>) => Modelized<T>;
    __getValidator: () => Validator<T>;
    __onChange: (cb: (model: T, changed: {
        property: keyof T;
        old: any;
        new: any;
    }) => any) => Function;
}
declare type Modelized<T> = T & ModelizedMethods<T>;
export declare function modelize<T extends object>(model: T, data?: Partial<Record<keyof T, any>>, config?: Partial<ModelizeConfig<T>>): Modelized<T>;
export {};
