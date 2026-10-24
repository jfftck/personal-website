/**
 * @type {() => void | null}
 */
let subscriber = null;

/**
 * @exports
 * @type {<T>(value: T) => {value: T}}
 */
export const signal = value => {
    /**
     * @type {Set<() => void>}}
     */
    let subscribers = new Set();

    return {
        /**
         * @type {T}
         */
        get value() {
            if (subscriber !== null) {
                return subscribers.add(subscriber);
            }

            return value;
        },

        set value(newValue) {
            if (value !== newValue) {
                value = newValue;

                subscribers.forEach(fn => fn());
            }
        }
    }
};

/**
 * @exports
 * @type {(fn: () => void) => void}
 */
export const effect = fn => {
    subscriber = fn;

    fn();

    subscriber = null;
};

/**
 * @exports
 * @type {<T>(fn: () => T) => {value: T}}
 */
export const derived = fn => {
    let signal = signal();

    effect(() => {
        signal.value = fn();
    });

    return signal;
}