/*@flow*/
'use strict';

/*::
import type {
    NewParse_Object_t,
    NewParse_List_t,
    NewParse_Int_t,
    NewParse_String_t,
    NewParse_DictEntry_t,
    NewParse_Comment_t,
    NewParse_Line_t,
    NewParse_Dict_t
} from './NewParse.js';
import type { OldParse_Object_t } from './OldParse.js';
export type Compare_Error_t =
    Compare_Error_Different_t | Compare_Error_NewMore_t | Compare_Error_OldMore_t;
export type Compare_Error_Different_t = {
    type: 'error',
    code: 'different',
    extra: {
        oldContent: OldParse_Object_t,
        newContent: NewParse_Object_t
    }
};
export type Compare_Error_NewMore_t = {
    type: 'error', code: 'new_parser_more', extra: NewParse_Object_t
};
export type Compare_Error_OldMore_t = {
    type: 'error', code: 'old_parser_more', extra: OldParse_Object_t
};

export type Compare_DictEntry_t = {
    type: 'dictentry',
    k: NewParse_String_t,
    v: Compare_Object_t
};
export type Compare_Dict_t = {
    type: 'dict',
    val: Array<Compare_DictEntry_t | NewParse_Comment_t | NewParse_Line_t>
};
export type Compare_List_t = {
    type: 'list',
    val: Array<Compare_Object_t>
};

export type Compare_Object_t = Compare_List_t | Compare_Dict_t | Compare_Error_t |
    NewParse_String_t | NewParse_Int_t | NewParse_Comment_t | NewParse_Line_t | Compare_DictEntry_t;
*/

const ERROR_THRESHOLD = 0.20;

const different = (
    newContent /*:NewParse_Object_t*/,
    oldContent /*:OldParse_Object_t*/
) /*:Compare_Error_Different_t*/ => {
    return {
        type: 'error',
        code: 'different',
        extra: {
            oldContent: oldContent,
            newContent: newContent
        }
    };
};
const comparePrim = (newParsed /*:NewParse_Int_t|NewParse_String_t*/, oldParsed /*:number|Buffer*/) => {
    if (newParsed.type !== 'number' && newParsed.type !== 'string') {
        throw new Error("wrong type " + newParsed.type);
    }
    if (newParsed.val === oldParsed) {
        return newParsed;
    } else if (Buffer.isBuffer(oldParsed) && !(oldParsed/*:any*/).compare(newParsed.val)) {
        return newParsed;
    }
    return different(newParsed, oldParsed);
};
const percentDiff = (res /*:Compare_Object_t|Compare_DictEntry_t*/) => {
    let errors = [];
    const recurse = (res) => {
        switch (res.type) {
            case 'error': {
                errors.push(res);
                break;
            }
            case 'dictentry': {
                recurse(res.k);
                recurse(res.v);
                break;
            }
            case 'dict':
            case 'list': {
                for (let i = 0; i < res.val.length; i++) { recurse(res.val[i]); }
                break;
            }
            case 'string':
            case 'number':
            case 'comment':
            case 'line': break;
            default: throw new Error("Unexpected type " + res.type);
        }
    };
    recurse(res);
    return JSON.stringify(errors).length / JSON.stringify(res).length;
};
const oldParserMore = (oldContent) /*:Compare_Error_OldMore_t*/ => {
    return {
        type: 'error',
        code: 'old_parser_more',
        extra: oldContent
    };
};
const newParserMore = (newContent /*:NewParse_Object_t*/) /*:Compare_Error_NewMore_t*/ => {
    return {
        type: 'error',
        code: 'new_parser_more',
        extra: newContent
    };
};
let compareInternal;
const compareDict = (
    newParsed /*:NewParse_Object_t*/,
    oldParsed /*:{[string]:OldParse_Object_t}*/
) /*:Compare_Dict_t*/ => {
    if (newParsed.type !== 'dict') { throw new Error(); }
    if (typeof(oldParsed) !== 'object') { throw new Error(); }
    const out /*:Array<Compare_DictEntry_t | NewParse_Comment_t | NewParse_Line_t>*/ = [];
    const oldParsedKeys = Object.keys(oldParsed);
    newParsed.val.forEach((entry) => {
        if (entry.type === 'comment' || entry.type === 'line') { return void out.push(entry); }
        const keyStr = entry.k.val.toString('utf8');
        if (oldParsedKeys.indexOf(keyStr) === -1) {
            return void out.push({ type: 'dictentry', k: entry.k, v: newParserMore(entry.v) });
        }
        oldParsedKeys.splice(oldParsedKeys.indexOf(keyStr), 1);
        out.push({ type: 'dictentry', k: entry.k, v: compareInternal(entry.v, oldParsed[keyStr]) });
    });
    oldParsedKeys.forEach((k) => {
        out.push({
            type: 'dictentry',
            k: { type: 'string', val: new Buffer(k, 'utf8') },
            v: oldParserMore(oldParsed[k])
        });
    });
    return { type: 'dict', val: out };
};
const listGetSame = (
    newParsed /*:NewParse_List_t*/,
    oldParsed /*:Array<OldParse_Object_t>*/,
    i, j) => {
    const out = [];
    for (; i < newParsed.val.length && j < oldParsed.length; i++) {
        const np = newParsed.val[i];
        if (np.type === 'comment' || np.type === 'line') { out.push(np); continue; }
        const comp = compareInternal(np, oldParsed[j]);
        if (percentDiff(comp) > ERROR_THRESHOLD) { break; }
        out.push(comp);
        j++;
    }
    return { i: i, j: j, list: out };
};
const containsDataEntries = (list) => {
    for (let i = 0; i < list.length; i++) {
        if (list[i].type !== 'comment' && list[i].type !== 'line') { return true; }
    }
    return false;
};
const compareList = (newParsed /*:NewParse_List_t*/, oldParsed /*:Array<OldParse_Object_t>*/) => {
    if (newParsed.type !== 'list') { throw new Error(); }
    if (!Array.isArray(oldParsed)) { throw new Error(); }
    const out = [];
    const pushOut = (l) => { Array.prototype.push.apply(out, l); };
    for (let i = 0, j = 0; i < newParsed.val.length && j < oldParsed.length;) {
        const same = listGetSame(newParsed, oldParsed, i, j);
        if (same.list.length) {
            pushOut(same.list);
            i = same.i; j = same.j;
            continue;
        }
        const added = { i: i, list: [] };
        const removed = { j: j, list: [] };
        for (;;) {
            if (added.i < newParsed.val.length) {
                added.list.push(newParserMore(newParsed.val[added.i++]));
                const same = listGetSame(newParsed, oldParsed, added.i, j);
                if (containsDataEntries(same.list)) {
                    pushOut(added.list);
                    pushOut(same.list);
                    i = same.i; j = same.j;
                    break;
                }
            }
            if (removed.j < oldParsed.length) {
                removed.list.push(oldParserMore(oldParsed[removed.j++]));
                const same = listGetSame(newParsed, oldParsed, i, removed.j);
                if (containsDataEntries(same.list)) {
                    pushOut(removed.list);
                    pushOut(same.list);
                    i = same.i; j = same.j;
                    break;
                }
            }
            if (added.i >= newParsed.val.length && removed.j >= oldParsed.length) {
                pushOut(removed.list);
                pushOut(added.list);
                i = added.i; j = removed.j;
                break;
            }
        }
    }
    return { type: 'list', val: out };
};
const compareInternal1 = module.exports.compareInternal1 = (
    newParsed /*:NewParse_Object_t*/,
    oldParsed /*:OldParse_Object_t*/
) /*:Compare_Object_t*/ => {
    switch (newParsed.type) {
        case 'number':
        case 'string': return comparePrim(newParsed, (oldParsed /*:any*/));
        case 'list': {
            if (!Array.isArray(oldParsed)) { return different(newParsed, oldParsed); }
            return compareList(newParsed, oldParsed);
        }
        case 'dict': {
            if (typeof(oldParsed) !== 'object') { return different(newParsed, oldParsed); }
            return compareDict(newParsed, (oldParsed /*:any*/));
        }
        default: throw new Error("unexpected type " + newParsed.type);
    }
};

compareInternal = module.exports.compareInternal = (
    newParsed /*:NewParse_Object_t*/,
    oldParsed /*:OldParse_Object_t*/
) /*:Compare_Object_t*/ => {
    //console.log('\n', JSON.stringify(oldParsed), '\n', JSON.stringify(newParsed));
    const out = compareInternal1(newParsed, oldParsed);
    //console.log(JSON.stringify(out));
    //console.log(isSame(out));
    return out;
};

let compareToComments;

const errorToCommentDict = (
    obj /*:Compare_Error_t*/
) /*:Array<NewParse_DictEntry_t|NewParse_Comment_t|NewParse_Line_t>*/ => {
    return [ { type: "comment", val: new Buffer("__ERROR__", 'utf8') } ];
};

const errorToCommentList = (
    obj /*:Compare_Error_t*/
) /*:Array<NewParse_Object_t>*/ => {
    return [ { type: "comment", val: new Buffer("__ERROR_LIST__", 'utf8') } ];
};

const listToComments = (
    obj /*:Compare_List_t*/
) /*:NewParse_List_t*/ => {
    return { type: obj.type, val: obj.val.map(compareToComments) };
};

const dictToComments = (
    obj /*:Compare_Dict_t*/
) /*:NewParse_Dict_t*/ => {
    const out = [];
    obj.val.forEach((e) => {
        switch (e.type) {
            case 'dictentry': out.push({ type: 'dictentry', k: e.k, v: compareToComments(e.v) }); break;
            case 'comment': 
            case 'line': out.push(e); break;
            case 'error': Array.prototype.push.apply(out, errorToCommentDict(e)); break;
            default: throw new Error("unexpected type " + e.type);
        }
    });
    return { type: obj.type, val: out };
};

compareToComments = module.exports.compareToComments = (
    obj /*:Compare_Object_t*/
) /*:NewParse_Object_t*/ => {
    switch (obj.type) {
        case 'number':
        case 'comment':
        case 'line':
        case 'string': return obj;
        case 'list': return listToComments(obj);
        case 'dict': return dictToComments(obj);
        case 'error': return errorToCommentList(obj);
        default: throw new Error("unexpected type " + obj.type);
    }
};

module.exports.compare = (
    newParsed /*:NewParse_Object_t*/,
    oldParsed /*:OldParse_Object_t*/
) /*:NewParse_Object_t*/ => {
    return compareToComments(compareInternal(newParsed, oldParsed));
};