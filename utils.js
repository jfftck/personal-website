export const classes = (...classes) => {
    const sb = [];

    for (var cls of classes) {
        switch (typeof cls) {
            case 'string':
                sb.push(cls);
                break;
            case 'object':
                if (Array.isArray(cls)) {
                    sb.push(cls.join(' '));
                } else {
                    for (var [c, v] of Object.entries(cls)) {
                        if (v) {
                            sb.push(c);
                        }
                    }
                }
                break;
            default:
                throw new Error('Unknown type, unable to generate CSS classes');
        }
    }

    return sb.join(' ');
};