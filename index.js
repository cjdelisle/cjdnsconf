/*@flow*/
'use strict';

const Fs = require('fs');
const Diff = require('diff');

const OldParse = require('./OldParse.js');
const NewParse = require('./NewParse.js');
const Stringify = require('./Stringify.js');
const Compare = require('./Compare.js');

/*::
import type {
    NewParse_Object_t,
    NewParse_List_t,
    NewParse_Int_t,
    NewParse_String_t
} from './NewParse.js';
import type { OldParse_Object_t } from './OldParse.js';
*/

const convertStrings = (x /*:any*/) => {
    if (typeof(x) !== 'object') { return x; }
    if (Array.isArray(x)) {
        for (let i = 0; i < x.length; i++) {
            x[i] = convertStrings(x[i]);
        }
    } else if (Buffer.isBuffer(x)) {
        let ok = true;
        for (let i = 0; i < x.length; i++) {
            if (x[i] >= 128) { ok = false; }
        }
        if (ok) { return x.toString('utf8'); }
    } else {
        Object.keys(x).forEach((k) => {
            x[k] = convertStrings(x[k]);
        });
    }
    return x;
};

const different = (newContent, oldContent) => {
    console.log(oldContent, newContent);
    return {
        type: 'error',
        code: 'different',
        oldContent: oldContent,
        newContent: newContent
    };
};

const isSame = (res) => {
    switch (res.type) {
        case 'error': return false;
        case 'dictentry': return isSame(res.k) && isSame(res.v);
        case 'dict':
        case 'list': {
            for (let i = 0; i < res.val.length; i++) {
                if (!isSame(res.val[i])) { return false; }
            }
            return true;
        }
        case 'string':
        case 'comment':
        case 'line':
        case 'number': return true;
        default: throw new Error("Unexpected type " + res.type);
    }
};


Fs.readFile(
    //'./sec.json',
    './cjdroute-orig.conf',
(err, ret) => {
    if (err) { throw err; }
    Fs.readFile(
        //'./sec2.json',
        './cjdroute-orig-hacked.conf',
        (err, ret2) => {
        if (err) { throw err; }
        const parsedNew = NewParse.parse(ret, true);
        const parsedOld = OldParse.parse(ret2);
        //console.log('compare');
        const comp = Compare.compareInternal(parsedNew, parsedOld);
        //if (!isSame(comp)) {
            console.log(JSON.stringify(convertStrings(comp), null, '  '));
        //}
        //console.log(JSON.stringify(convertStrings(parsed), null, '  '));
        //const str = Stringify.stringify(parsed);
    //    console.log(str);
        //console.log();
    });
});