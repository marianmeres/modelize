import { isObject } from './object-utils.js';
import { createPubSub } from './create-pub-sub.js';
import Ajv from 'ajv';

const clog = console.log;

type Validator<T> = (model: T, schema, assert?: boolean) => boolean;

export interface ModelizeConfig<T> {
	// whether to allow setting unknown properties (this is checked regardless of schema,
	// just using the same naming convention)
	additionalProperties: boolean;
	// tsconfig.json strictNullChecks must be enabled to use JSONSchemaType
	// schema: JSONSchemaType<T>;
	schema: any;
	validator: Validator<T>;
}

// prefixing with "__" to minimize potential name conflicts with <T>
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
	__setAllowAdditionalProps: (flag: boolean) => Modelized<T>;
	__onChange: (
		cb: (model: T, changed: { property: keyof T; old: any; new: any }) => any
	) => Function;
	// for data hackings... subject of change
	__pauseValidate: () => Modelized<T>;
	__resumeValidate: () => Modelized<T>;
}

export type Modelized<T> = T & ModelizedMethods<T>;

export class ModelizeUnableToValidate extends Error {}
export class ModelizeValidationError extends Error {}

const _validateErrorsToString = (errors) =>
	(errors || [])
		.reduce((memo, e) => {
			memo.push(`${e.schemaPath} ${e.message} ${JSON.stringify(e.params)}`);
			return memo;
		}, [])
		.join(', ');

// @ts-ignore
const ajv = new Ajv({ strict: false, validateFormats: false });

export function modelize<T extends object>(
	model: T,
	data: Partial<Record<keyof T, any>> = {},
	config: Partial<ModelizeConfig<T>> = {}
): Modelized<T> {
	// sanity
	if (!isObject(model)) throw new TypeError('Expecting class instance argument');

	const isFn = (v) => typeof v === 'function';

	// defaults
	let _CONFIG: ModelizeConfig<T> = {
		...({
			additionalProperties: false,
			schema: null,
			validator: null,
		} as ModelizeConfig<T>),
	};

	let _schemaCompiledValidate;
	const _updateConfig = (config: Partial<ModelizeConfig<T>>) => {
		_CONFIG = { ..._CONFIG, ...config };
		// if schema was provided, compile validator now (the compilation for the same schema
		// is cached internally at ajv level, so no worry here)
		if (_CONFIG.schema) {
			_schemaCompiledValidate = ajv.compile(_CONFIG.schema);
		} else {
			_schemaCompiledValidate = null;
		}
	};

	// set now
	_updateConfig({
		// support for special case getter `__config` at model level
		...((model as any).__config || {}),
		// and via param
		...(config || {}),
	});

	// pub/sub with helper pause flag for "construct" time
	const _pubsub = createPubSub();
	let _doPublishChange = false;

	// collection of dirty (changed) keys
	const _dirty = new Set<keyof T>();

	// helper flag to pause/resume validation
	let _doValidate = true;

	//
	const _validateSchema = (assert: boolean = true) => {
		if (!_schemaCompiledValidate) {
			throw new Error('Unknown error... schema validator not available');
		}
		const valid = _schemaCompiledValidate(model);
		if (valid) return true;
		if (assert) {
			throw new ModelizeValidationError(
				_validateErrorsToString(_schemaCompiledValidate.errors)
			);
		}
		return false;
	};

	//
	const _validateOnlyIfValidatorOrSchema = (model: T) => {
		if (!_doValidate) return true;
		let valid = true;
		if (_CONFIG.schema) valid = _validateSchema(true);
		if (valid && isFn(_CONFIG.validator)) {
			valid = _CONFIG.validator(model, _CONFIG.schema, true);
		}
		// if we're still here invalid, we have now 2 issues:
		if (!valid) {
			throw new ModelizeValidationError(
				`Model is not valid! (Additionally, custom validator error detected as well.)`
			);
		}
		return valid;
	};

	//
	const set = (target: T, prop, value, receiver: T) => {
		_assertNonCollidingPropName(prop);
		if (_CONFIG.additionalProperties || Reflect.has(target, prop)) {
			const old = Reflect.get(target, prop, receiver);
			const success = Reflect.set(target, prop, value, receiver);
			if (success && value !== old) {
				try {
					_validateOnlyIfValidatorOrSchema(target);
				} catch (e) {
					// undo... (this is kind of ugly)
					Reflect.set(target, prop, old, receiver);
					throw e;
				}
				_dirty.add(prop);
				_doPublishChange &&
					_pubsub.publish('change', {
						model: target,
						changed: { property: prop, old, new: value },
					});
			}
			return success;
		}
		return true;
	};

	// technically we could just mix it in via `Object.assign(model, methodsMixin)`... but those
	// methods would become enumerable (which is not desired) so we'll just else-if it in
	// the proxy trap below
	const methodsMixin: ModelizedMethods<T> = {
		//
		toJSON: (): Record<keyof T, any> =>
			Object.entries(model).reduce((m, [k, v]) => ({ ...m, [k]: v }), {} as T),
		//
		__hydrate: (data, forceClean = false) => {
			for (let k in data || {}) set(model, k, data[k], model as any);
			forceClean && _dirty.clear();
			return model as Modelized<T>;
		},
		//
		__isDirty: () => (_dirty.size ? Array.from(_dirty) : null),
		//
		__setClean: () => {
			_dirty.clear();
			return model as Modelized<T>;
		},
		//
		__setDirty: (keys: (keyof T)[] = null) => {
			methodsMixin.__setClean();
			(keys || Object.keys(model)).forEach((k) => k in model && _dirty.add(k));
			return model as Modelized<T>;
		},
		//
		__getDirty: () => {
			return (methodsMixin.__isDirty() || []).reduce(
				(m, k) => ({ ...m, [k]: model[k] }),
				{}
			);
		},
		//
		__validate: (assert: boolean = true) => {
			if (!_doValidate) return true;

			let valid = true;
			let wasValidated = 0;

			// if we have a schema, validate it first
			if (_CONFIG.schema) {
				valid = _validateSchema(assert);
				wasValidated++;
			}

			// if we have a custom validator, continue with it as well
			if (valid && isFn(_CONFIG.validator)) {
				valid = _CONFIG.validator(model as Modelized<T>, _CONFIG.schema, assert);
				wasValidated++;
			}

			// explicitly calling `__validate` without any internal validation available?!?
			if (!wasValidated && assert) {
				throw new ModelizeUnableToValidate(
					'Unable to validate! Neither `validator` nor `schema` were provided.'
				);
			}

			return valid;
		},
		//
		__setSchema: (schema: any) => {
			_updateConfig({ schema: schema });
			return model as Modelized<T>;
		},
		//
		__getSchema: () => _CONFIG.schema,
		//
		__setValidator: (validator: Validator<T>) => {
			_updateConfig({ validator: validator });
			return model as Modelized<T>;
		},
		//
		__getValidator: () => _CONFIG.validator,
		//
		__setAllowAdditionalProps: (flag: boolean) => {
			_updateConfig({ additionalProperties: !!flag });
			return model as Modelized<T>;
		},
		//
		__onChange: (cb) =>
			_pubsub.subscribe('change', ({ model, changed }) => cb(model, changed)),
		//
		__pauseValidate: () => {
			_doValidate = false;
			return model as Modelized<T>;
		},
		//
		__resumeValidate: () => {
			_doValidate = true;
			return model as Modelized<T>;
		},
	};

	const _assertNonCollidingPropName = (name) => {
		if (methodsMixin[name]) {
			throw new TypeError(`'${name}' is a reserved modelized method name!`);
		}
	};

	//
	Object.keys(model).forEach(_assertNonCollidingPropName);

	// final proxy
	const modelized = new Proxy<T>(model, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (isFn(value)) {
				return (...args) => value.apply(target, args);
			} else if (methodsMixin[prop]) {
				return (...args) => methodsMixin[prop].apply(target, args);
			} else {
				return value;
			}
		},
		set,
	}) as Modelized<T>;

	// if data are provided, hydrate now, set clean afterwards
	if (data) {
		modelized.__hydrate(data);
		// makes no sense to be dirty at "construct" time (if not desired, simply `__setDirty`)
		modelized.__setClean();
	}

	// from now on, publish changes
	_doPublishChange = true;

	//
	return modelized;
}
