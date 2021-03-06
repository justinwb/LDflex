/**
 * Returns a function that deletes the given value
 * for the path, and then adds the given values to the path.
 *
 * Requires:
 * - a delete function on the path proxy.
 * - an add function on the path proxy.
 */
export default class ReplaceFunctionHandler {
  execute(path, proxy) {
    return function (oldValue, ...newValues) {
      if (!oldValue || !newValues.length)
        throw new Error('Replacing values requires at least two arguments, old value followed by all new values');
      return proxy.delete(oldValue).add(...newValues);
    };
  }
}
