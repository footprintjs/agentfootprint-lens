/** The JSON scalar represented by a folded value, including cross-realm Dates
 * and boxed primitives. Leave containers for the caller to inspect. */
export function recordedJsonScalar(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    // A custom tag can execute a getter or impersonate a built-in. A native
    // Date or boxed primitive needs no tag override, even across realms.
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype || Symbol.toStringTag in value) return value;
    const builtin = Object.prototype.toString.call(value).slice(8, -1);
    switch (builtin) {
      case 'Date':
        return Number.isFinite(Date.prototype.getTime.call(value)) ? Date.prototype.toISOString.call(value) : null;
      case 'Number': value = Number.prototype.valueOf.call(value); break;
      case 'String': return String.prototype.valueOf.call(value);
      case 'Boolean': return Boolean.prototype.valueOf.call(value);
    }
  }
  return typeof value === 'number' && !Number.isFinite(value) ? null : value;
}
