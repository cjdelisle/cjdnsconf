/*@flow*/
'use strict';
/*::
import type {
    NewParse_Object_t,
    NewParse_Dict_t,
    NewParse_List_t,
    NewParse_Int_t,
    NewParse_String_t,
    NewParse_Comment_t
} from './NewParse.js';
*/

let stringifyGeneric;

const ONE_LINER_MAX_CHR = 90;

const specialChar = (bchar) => {
    return !(
        bchar < 126 &&
        bchar > 31 &&
        bchar !== '\\'.charCodeAt(0) &&
        bchar !== '"'.charCodeAt(0)
    );
};

const indent = (ctx) => {
    return new Array(ctx.indentLevel + 1).join('    ');
};

const encodeChar = (chr) => {
    const s = chr.toString(16);
    return '\\x' + ((s.length === 1) ? '0' : '') + s;
};

const SERIALIZERS = {
    string: (ctx, _s) => {
        if (_s.type !== 'string') { throw new Error(); }
        const s = (_s /*:NewParse_String_t*/);
        const v = s.val;
        if (!Buffer.isBuffer(v)) { throw new Error("Expected a buffer, got " + typeof(v)); }
        let special = 0;
        for (let i = 0; i < v.length; i++) { special += specialChar(v[i]); }
        const out = ['"'];
        if (!special) {
            out.push(v.toString('utf8'));
        } else if (special > v.length / 5) {
            for (let i = 0; i < v.length; i++) {
                out.push(encodeChar(v[i]));
            }
        } else {
            for (let i = 0; i < v.length; i++) {
                out.push(specialChar(v[i]) ? encodeChar(v[i]) : String.fromCharCode(v[i]));
            }
        }
        out.push('"');
        return out.join('');
    },
    number: (ctx, _i) => {
        if (_i.type !== 'number') { throw new Error(); }
        const i = (_i /*:NewParse_Int_t*/);
        return '' + i.val;
    },
    dict: (ctx, _d) => {
        if (_d.type !== 'dict') { throw new Error(); }
        const d = (_d /*:NewParse_Dict_t*/);
        //const dd = [];
        let hasComments = false;
        ctx.indentLevel++;
        let lastEntry;
        let length = 0;
        d.val.forEach((kv) => {
            if (kv.type === 'comment' || kv.type === 'line') {
                hasComments = true;
            } else {
                lastEntry = kv;
                length += (
                    stringifyGeneric(ctx, kv.k) +
                    ': ' +
                    stringifyGeneric(ctx, kv.v) +
                    ', '
                ).length;
            }
        });
        const out = [];
        if (!hasComments && length < ONE_LINER_MAX_CHR) {
            // one-liner representation because no comments and result is short
            out.push('{ ');
            d.val.forEach((kv) => {
                if (kv.type !== 'dictentry') { throw new Error(); }
                out.push(stringifyGeneric(ctx, kv.k), ': ', stringifyGeneric(ctx, kv.v), ', ');
            });
            out[out.length - 1] = ' }';
            ctx.indentLevel--;
            return out.join('');
        } else {
            out.push('{\n');
            d.val.forEach((kv) => {
                if (kv.type === 'comment') {
                    out.push(indent(ctx), stringifyGeneric(ctx, kv), '\n');
                } else if (kv.type === 'line') {
                    out.push(stringifyGeneric(ctx, kv));
                } else {
                    out.push(indent(ctx), stringifyGeneric(ctx, kv.k), ': ',
                        stringifyGeneric(ctx, kv.v));
                    if (lastEntry === kv) {
                        out.push('\n');
                    } else {
                        out.push(',\n');
                    }
                }
            });
            ctx.indentLevel--;
            out.push(indent(ctx), '}');
            return out.join('');
        }
    },
    list: (ctx, l) => {
        if (l.type !== 'list') { throw new Error(); }
        l = (l /*:NewParse_List_t*/);
        let hasComments = false;
        ctx.indentLevel++;
        let lastEntry;
        let length = 0;
        l.val.forEach((v) => {
            if (v.type === 'comment' || v.type === 'line') {
                hasComments = true;
            } else {
                lastEntry = v;
                length += (stringifyGeneric(ctx, v) + ', ').length;
            }
        });
        const out = [];
        if (!hasComments && length < ONE_LINER_MAX_CHR) {
            // one-liner representation because no comments and result is short
            out.push('[ ');
            l.val.forEach((v) => { out.push(stringifyGeneric(ctx, v), ', '); });
            out[out.length - 1] = ' ]';
            ctx.indentLevel--;
            return out.join('');
        } else {
            out.push('[\n');
            l.val.forEach((v) => {
                if (v.type === 'comment') {
                    out.push(indent(ctx), stringifyGeneric(ctx, v), '\n');
                } else if (v.type === 'line') {
                    out.push(stringifyGeneric(ctx, v));
                } else {
                    out.push(indent(ctx), stringifyGeneric(ctx, v));
                    if (lastEntry === v) {
                        out.push('\n');
                    } else {
                        out.push(',\n');
                    }
                }
            });
            out[out.length - 1] = '\n';
            ctx.indentLevel--;
            out.push(indent(ctx), ']');
            return out.join('');
        }
    },
    line: (ctx, l) => {
        return '\n';
    },
    comment: (ctx, c) => {
        if (c.type !== 'comment') { throw new Error(); }
        c = (c /*:NewParse_Comment_t*/);
        const str = c.val.toString('utf8');
        if (str.indexOf('\n') > -1) {
            // multiline comments are tricky because we need to indent the lines in them
            // to indent() + ' ' (the last space is to line up with the second char in /* )
            const spaces = indent(ctx) + ' ';
            const lines = str.split('\n');
            if (lines[0] === '') { lines.shift(); }
            if (/^ *$/.test(lines[lines.length - 1])) { lines.pop(); }
            let shortestPadding = Infinity;
            for (let i = 0; i < lines.length; i++) {
                if (/^ *$/.test(lines[i])) { continue; }
                const l = lines[i].replace(/^( +).*$/, (x, a) => (a));
                if (l.length < shortestPadding) { shortestPadding = l.length; }
            }
            for (let i = 0; i < lines.length; i++) {
                lines[i] = (spaces + lines[i].slice(shortestPadding)).replace(/ *$/g, '');
            }
            //console.log('/*\n' + lines.join('\n') + '\n' + spaces + '*/');
            return '/*\n' + lines.join('\n') + '\n' + spaces + '*/';
        } else {
            return '//' + str;
        }
    }
};

stringifyGeneric = (ctx, o /*:NewParse_Object_t*/) => {
    //console.log(o.type);
    return SERIALIZERS[o.type](ctx, o);
};

const stringify = module.exports.stringify = (obj /*:NewParse_Object_t*/) => {
    const ctx = {
        indentLevel: 0,
        out: []
    };
    return stringifyGeneric(ctx, obj);
};