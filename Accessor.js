/*@flow*/
'use strict';
/*::
import type {
    NewParse_Object_t,
    NewParse_Dict_t,
    NewParse_List_t,
    NewParse_Int_t,
    NewParse_String_t,
    NewParse_Comment_t,
    NewParse_Line_t,
    NewParse_DictEntry_t
} from './NewParse.js';
*/
const Stringify = require('./Stringify.js');

let jsonToCjdns;
const TO_CJDNS = {
    string: (ctx, s) /*:NewParse_String_t*/ => {
        return { type: 'string', val: Buffer.from(s) };
    },
    number: (ctx, i) /*:NewParse_Int_t*/ => {
        if (Math.floor(i) !== i) {
            throw new Error("cjdnsconf: Cannot add non-integer numbers to conf");
        }
        return { type: 'number', val: i };
    },
    object: (ctx, o) /*:NewParse_Dict_t|NewParse_String_t|NewParse_List_t*/ => {
        if (Array.isArray(o)) { return { type: 'list', val: o.map((x)=>(jsonToCjdns(ctx, x))) }; }
        if (Buffer.isBuffer(o)) { return { type: 'string', val: Buffer.from(o) }; }
        if (o === null) { throw new Error("cjdnsconf: Cannot add null type to conf"); }
        const outV = [];
        Object.keys(o).forEach((x) => {
            if (x === ctx.internalName) {
                throw new Error("cjdnsconf: cannot assign value '" + ctx.internalName + "' " +
                    "because it is the name of the internal object, try specifying a different " +
                    "internalName if you want to use " + ctx.internalName);
            }
            outV.push({ type: 'dictentry', k: TO_CJDNS.string(ctx, x), v: jsonToCjdns(ctx, o[x]) });
        });
        return { type: 'dict', val: outV };
    },
    'function': (ctx, f) => {
        throw new Error("cjdnsconf: Cannot add javascript functions to conf json " +
            'function: ' + f.toString());
    },
    symbol: (ctx, s) => {
        throw new Error("cjdnsconf: Cannot add javascript symbols to conf");
    },
    boolean: (ctx, s) => {
        throw new Error("cjdnsconf: Cannot add boolean types to conf, consider Number(0|1)");
    },
    'undefined': (ctx, u) => {
        throw new Error("cjdnsconf: Cannot add undefined type to conf");
    }
};
jsonToCjdns = (ctx, json) /*:NewParse_Object_t*/ => {
    return TO_CJDNS[typeof(json)](ctx, json);
};

let wrapGeneric;

const WRAPPERS = {
    string: (ctx, _s) => {
        if (!_s || _s.type !== 'string') { throw new Error(); }
        const s = (_s /*:NewParse_String_t*/);
        return Stringify.stringify(s).slice(1, -1);
    },
    number: (ctx, _i) => {
        if (_i.type !== 'number') { throw new Error(); }
        const i = (_i /*:NewParse_Int_t*/);
        return i.val;
    },
    line: (ctx, l) => {
        return;
    },
    comment: (ctx, c) => {
        return;
    },
    dict: (ctx, _d) => {
        if (_d.type !== 'dict') { throw new Error(); }
        const d = (_d /*:NewParse_Dict_t*/);
        let keyCache;
        const computeCache = () => {
            keyCache = {};
            d.val.forEach((_de, i) => {
                if (_de.type !== 'dictentry') { return; }
                const de = (_de /*:NewParse_DictEntry_t*/);
                keyCache[WRAPPERS.string(ctx, de.k)] = i;
            });
        };
        computeCache();
        const get = (target, prop, receiver) /*:any*/ => {
            if (prop === ctx.internalName) { return d; }
            if (!keyCache.hasOwnProperty(prop)) { return; }
            const i = keyCache[prop];
            if (d.val[i].type !== 'dictentry') {
                let str = '[JSON.stringify failed]';
                try { str = JSON.stringify(d.val[i]); } catch (e) { }
                throw new Error("cjdnsconf: INTERNAL: keyCache contains an entry which is " +
                    "a dictionary entry [" + str + "]");
            }
            return wrapGeneric(ctx, d.val[i].v);
        };
        const obj = { 'setuser': 'y' };
        return new Proxy(obj, {
            get: get,
            set: (obj, prop, value, receiver) => {
                if (prop === ctx.internalName) {
                    let str = '[JSON.stringify failed]';
                    try { str = JSON.stringify(value); } catch (e) { }
                    throw new Error("cjdnsconf: cannot assign key '" + ctx.internalName + "' " +
                        "to value " + str + "because it is the name of the internal object, " +
                        "try specifying a different internalName if you want to use " +
                        ctx.internalName);
                }
                let i = keyCache[prop];
                let ii = (typeof(i) !== 'undefined') ? i : d.val.length;
                d.val[ii] = {
                    type: 'dictentry',
                    k: { type: 'string', val: Buffer.from(prop) },
                    v: jsonToCjdns(ctx, value)
                };
                if (typeof(i) === 'undefined') { computeCache(); }
                return true;
            },
            deleteProperty: (target, prop) => {
                let i = keyCache['' + prop];
                if (typeof(i) === 'undefined') { return true; }
                let j = 1;
                while (d.val[--i] && d.val[i].type !== 'dictentry') { j++; }
                d.val.splice(++i, j);
                computeCache();
                return true;
            },
            ownKeys: (target) => {
                return Object.keys(keyCache);
            },
            has: (target, key) => {
                return keyCache.hasOwnProperty(key);
            },
            getOwnPropertyDescriptor: (target, key) => {
                return {
                    value: get(null, key),
                    writable: true,
                    enumerable: true,
                    configurable: true
                };
            }
        });
    },
    list: (ctx, _l) => {
        if (_l.type !== 'list') { throw new Error(); }
        const l = (_l /*:NewParse_List_t*/);
        let keyCache;
        const computeCache = () => {
            keyCache = [];
            l.val.forEach((o, i) => {
                if (o.type === 'line' || o.type === 'comment') { return; }
                keyCache.push(i);
            });
        };
        computeCache();
        const set = (number /*:number*/, val) => {
            if (number < 0 || Math.floor(number) !== number) {
                throw new Error("cjdnsconf: Cannot assign entry number " + number +
                    " must be an int");
            }
            const i = keyCache[number];
            if (typeof(i) === 'undefined') {
                if (number === keyCache.length) {
                    // append
                    l.val.push(jsonToCjdns(ctx, val));
                    keyCache.push(l.val.length - 1);
                    return val;
                }
                throw new Error("Cannot set list item number " + number +
                    " because list length is " + keyCache.length + " and sparse lists " +
                    "are not allowed");
            }
            l.val[i] = jsonToCjdns(ctx, val);
            // no need to recompute cache because nothing shifted...
            return val;
        };
        const splice = (x, y, ...items) => {
            // Some acrobatics in order to avoid reimplementing the rules of splice()
            const cItems = items.map((x)=>jsonToCjdns(ctx, x));
            // This is used as a marker so we always know where the empry spot is.
            cItems.push(null);
            const newKeyCache = [].concat(keyCache);
            // $FlowFixMe yeah yeah lists with different types in them, it's easier
            const spliced = newKeyCache.splice(x, y, ...cItems);
            const out = JSON.parse(JSON.stringify(spliced.map((x)=>(
                wrapGeneric(ctx, l.val[Number(x)])
            ))));

            const newVal = ([] /*:Array<NewParse_Object_t|NewParse_Comment_t|NewParse_Line_t>*/);
            for (let i = 0, j = 0, skipping = 0; i < newKeyCache.length; i++) {
                if (typeof(newKeyCache[i]) === 'object') {
                    skipping = 1;
                    const x = newKeyCache[i];
                    if (x === null) {
                        newKeyCache.splice(i, 1);
                        i--;
                        continue;
                    }
                    newKeyCache[i] = newVal.length;
                    newVal.push(x);
                    continue;
                }
                let pushList = [];
                while (j < newKeyCache[i]) {
                    const x = l.val[j];
                    if (!(x.type === 'comment' || x.type === 'line')) {
                        if (skipping === 2) {
                            throw new Error(
                                "cjdnsconf: INTERNAL: found 2 holes in splice list, element\n" +
                                JSON.stringify(x) + "\nshould not be there"
                            );
                        }
                        pushList = [];
                    }
                    if (skipping !== 1) {
                        newVal.push(l.val[j]);
                    } else if (x.type === 'comment' || x.type === 'line') {
                        pushList.push(l.val[j]);
                    }
                    j++;
                }
                newVal.push(...pushList);
                skipping = 2;
                newKeyCache[i] = newVal.length;
                newVal.push(l.val[j]);
                j++;
            }
            l.val = newVal;
            computeCache();
            const newKeyCacheS = JSON.stringify(newKeyCache);
            const keyCacheS = JSON.stringify(keyCache);
            if (newKeyCacheS !== keyCacheS) {
                throw new Error("cjdnsconf: INTERNAL:\n" + newKeyCacheS + " !==\n" + keyCacheS);
            }
            return out;
        };
        const slice = (i, j) => {
            return keyCache.slice(i, j).map((x)=>(wrapGeneric(ctx, l.val[x])));
        };
        const arrayMethods = [
            'concat', 'includes', 'indexOf', 'join', 'lastIndexOf', 'slice',
            'toSource', 'entries', 'every', 'filter',
            'find', 'findIndex', 'forEach', 'keys', 'map', 'reduce', 'reduceRight',
            'some', 'values', 'unshift', 'splice', 'sort', 'slice', 'shift', 'reverse',
            'reduce', 'push', 'pop', 'length', 'flatMap', 'flat', 'fill', 'copyWithin',
            'concat'
        ];
        const listFuncs = {};
        arrayMethods.forEach((am) => {
            listFuncs[am] = () => {
                throw new Error("cjdnsconf: array method " + am + " not supported");
            };
        });
        listFuncs.push = (...args) => {
            args.forEach((a) => { set(keyCache.length, a); });
            return keyCache.length;
        };
        listFuncs.pop = () => {
            if (keyCache.length) { return splice(keyCache.length - 1, 1)[0]; }
        };
        listFuncs.shift = () => { if (keyCache.length) { return splice(0, 1)[0]; } };
        listFuncs.unshift = (...args) => {
            const xargs = args.map((x)=>(jsonToCjdns(ctx, x)));
            l.val.unshift(...xargs);
            computeCache();
            return keyCache.length;
        };
        listFuncs.slice = (i, j) => { return slice(i, j); };
        listFuncs.splice = (i, j, ...args) => { return splice(i, j, ...args); };

        let retVal;
        listFuncs.forEach = (f) => {
            keyCache.forEach((ii, i) => { return f(wrapGeneric(ctx, l.val[ii]), i, retVal); });
        };
        listFuncs.map = (f) => {
            const out = [];
            keyCache.forEach((ii, i) => { out.push(f(wrapGeneric(ctx, l.val[ii]), i, retVal)); });
            return out;
        };
        listFuncs.filter = (f) => {
            const out = [];
            keyCache.forEach((ii, i) => {
                const w = wrapGeneric(ctx, l.val[ii]);
                if (f(w, i, retVal)) { out.push(w); }
            });
            return out;
        };

        const get = (target, prop, receiver) /*:any*/ => {
            if (prop === ctx.internalName) { return l; }
            if (prop === 'length') { return keyCache.length; }
            if (listFuncs.hasOwnProperty(prop)) { return listFuncs[prop]; }
            // $FlowFixMe symbol is in fact a valid typeof return type
            if (typeof(prop) === 'symbol') { return; }
            const i = keyCache[Number(prop)];
            if (typeof(i) === 'undefined') { return; }
            return wrapGeneric(ctx, l.val[i]);
        };
        retVal = new Proxy([], {
            get: get,
            set: (obj, prop, value) => {
                if (isNaN(Number(prop))) {
                    throw new Error("cjdnsconf: cannot assign non-numeric in lists");
                }
                set(Number(prop), value);
                return true;
            },
            deleteProperty: (target, prop) => {
                if (isNaN(Number(prop))) {
                    throw new Error("cjdnsconf: cannot assign non-numeric in lists");
                }
                splice(prop, 1);
                return true;
            },
            ownKeys: (target) => {
                const out = ['length'];
                for (let i = 0; i < keyCache.length; i++) { out.push('' + i); }
                return out;
            },
            has: (target, key) => {
                return listFuncs.hasOwnProperty(key) || !!keyCache[Number(key)];
            },
            getOwnPropertyDescriptor: (target, key) => {
                if (key !== 'length' && typeof(keyCache[Number(key)]) !== 'number') { return; }
                return {
                    value: get(null, key),
                    writable: true,
                    enumerable: (key !== 'length'),
                    configurable: (key !== 'length')
                };
            }
        });
        return retVal;
    },
};

wrapGeneric = (ctx, o /*:NewParse_Object_t|NewParse_Comment_t|NewParse_Line_t*/) /*:any*/ => {
    return WRAPPERS[o.type](ctx, o);
};

const wrap = module.exports.wrap = (obj /*:NewParse_Object_t*/) /*:any*/ => {
    const ctx = {
        internalName: '_'
    };
    return wrapGeneric(ctx, obj);
};