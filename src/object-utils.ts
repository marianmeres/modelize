export const isObject = (o) => Object.prototype.toString.call(o) === '[object Object]';

//
export const isPlainObject = (o) => {
	let ctor, prot;

	if (isObject(o) === false) return false;

	// If has modified constructor
	ctor = o.constructor;
	if (ctor === undefined) return true;

	// If has modified prototype
	prot = ctor.prototype;
	if (isObject(prot) === false) return false;

	// If constructor does not have an Object-specific method
	if (prot.hasOwnProperty('isPrototypeOf') === false) return false;

	// Most likely a plain Object
	return true;
};

//
export const isEmptyObject = (o) =>
	o && Object.keys(o).length === 0 && o.constructor === Object;

//
export const getPrototypeChain = (o) => {
	if (o === null) return null;
	if (typeof o !== 'object') return null;

	let proto = Object.getPrototypeOf(o);
	const out = [];

	while (!isPlainObject(proto)) {
		out.push(proto);
		proto = Object.getPrototypeOf(proto);
	}

	return out.length ? out : null;
};

//
export const hasSetterFor = (o, prop) =>
	(getPrototypeChain(o) || []).some((proto) => {
		let desc = Object.getOwnPropertyDescriptor(proto, prop);
		return desc && !!desc.set;
	});

//
export const hasGetterFor = (o, prop) =>
	(getPrototypeChain(o) || []).some((proto) => {
		let desc = Object.getOwnPropertyDescriptor(proto, prop);
		return desc && !!desc.get;
	});
