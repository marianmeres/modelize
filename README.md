# @marianmeres/modelize

Single utility function `modelize` which proxies your model instance to monitor
changes, validate, and more...

## Usage example

```typescript
// SET UP ///////////////////////////////////////////////////////////////////////


// some model class
class User {
    // some public props ...
    firstname: string = '';
    lastname: string = '';
    // some methods ...
    whoami = () => [this.firstname, this.lastname].filter(Boolean).join(' ');
    // some getters ...
    get initials() {
        return [this.firstname.slice(0, 1), this.lastname.slice(0, 1)].join('').toUpperCase();
    }
}

// and model instance
const user = new User();
user.firstname = 'John';
user.lastname = 'Doe';
assert(user.whoami() === 'John Doe');
assert(user.initials === 'JD');


// BEGIN ACTUAL EXAMPLE /////////////////////////////////////////////////////////


// now create a new "modelized" version of the user instance
const modelized = modelize<User>(user);

// the "modelized" object is a new and different instance
assert(modelized !== user);

// but all props and methods are still available
assert(modelized.firstname === 'John');
assert(modelized.whoami() === 'John Doe');
assert(modelized.initials === 'JD');

// now, the new modelized version implements a bunch of new "virtual" utility methods
// (internally via proxy trap). They all start with "__" prefix to minimize the name
// collision risk with the original model class.
interface ModelizedMethods<T> {
    toJSON: () => Record<keyof T, any>;
    __hydrate: (data?: Partial<Record<keyof T, any>>, forceClean?: boolean) => any;
    __isDirty: () => (keyof T)[];
    __setClean: () => Modelized<T>;
    __setDirty: (keys: (keyof T)[]) => Modelized<T>;
    __getDirty: () => Partial<Record<keyof T, any>>;
    __validate: (assert?: boolean) => boolean;
    __setSchema: (schema: any) => Modelized<T>;
    __getSchema: () => any;
    __setValidator: (validator: Validator<T>) => Modelized<T>;
    __getValidator: () => Validator<T>;
    __onChange: (
        cb: (model: T, changed: { property: keyof T; old: any; new: any }) => any
    ) => Function;
    __pauseValidate: () => Modelized<T>;
    __resumeValidate: () => Modelized<T>;
}

// from now on, every instance update is monitored for changes
modelized.lastname = 'Lennon';
assert(modelized.__isDirty());
assert(_.isEqual({ lastname: 'Lennon' }, modelized.__getDirty()));

// and can be later marked as clean
modelized.__setClean();
assert(!modelized.__isDirty());

// you can also subscribe to changes
let log;
const unsubscribe = modelized.__onChange((model, changed) => (log = changed));
modelized.lastname = 'Wick';
assert(_.isEqual(log, { property: 'lastname', old: 'Lennon', new: 'Wick' }));
log = null; // reset

// and unsubscribe
unsubscribe();
modelized.lastname = 'McEnroe';
assert(log === null); // not susbscribed anymore

// you can populate/hydrate multiple props at once, and by default, unknown props
// are silently ignored
modelized.__hydrate({ lastname: 'Depp', email: 'johny@depp.com' })
assert(modelized.lastname === 'Depp');
assert(modelized.email === undefined);

// but you can allow setting additional props if needed
modelized.__setAllowAdditionalProps(true);
modelized.__hydrate({ lastname: 'Cash', email: 'johny@cash.com' })
assert(modelized.lastname === 'Cash');
assert(modelized.email === 'johny@cash.com');

// changes are synced with the original user instance as well
assert(user.email === 'johny@cash.com');
assert(user.initials === 'JC');

// and, you can set json-schema to you model, to be auto validated all the time
modelized.__setSchema({
    type: 'object',
    properties: {
        firstname: { type: 'string' },
        lastname: { type: 'string' },
    },
});
assert(modelized.__validate());
assert.throws(() => (modelized.firstname = 123));

// if json-schema is not your thing, you can create your own validator function
// which has precedence over json-schema validation
modelized.__setValidator((model, schema, assert) => {
    const isJohn = !model.firstname || model.firstname === 'John';
    if (assert && !isJohn) throw new ModelizeValidationError('John only');
    return isJohn;
});
assert(modelized.__validate());

// only John is allowed
assert.throws(() => (modelized.firstname = 'Peter'));
// firstname was not changed
assert(modelized.firstname === 'John');
```

It all works via shorthand notation and on `POJO` objects as well.

```typescript
// signature:
// modelize<T extends object>(
//     model: T,
//     data: Partial<Record<keyof T, any>> = {},
//     config: Partial<ModelizeConfig<T>> = {}
// ): Modelized<T>
const user = modelize(
    {}, // "pojo" instance
    { firstname: 'James', lastname: 'Bond' }, // initial data
    // `additionalProperties` must be set to `true` with pojos
    { additionalProperties: true, schema: null, validator: null } // config
);
assert(_.isEqual({ firstname: 'James', lastname: 'Bond' }, user.toJSON()));
```
