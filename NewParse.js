/*@flow*/
'use strict';
/*::
export type NewParse_DictEntry_t = { type: 'dictentry', k: NewParse_String_t, v: NewParse_Object_t };

export type NewParse_Comment_t = { type: 'comment', val: Buffer };
export type NewParse_Line_t = { type: 'line' };

export type NewParse_Dict_t = {
    type: 'dict',
    val: Array<NewParse_DictEntry_t | NewParse_Comment_t | NewParse_Line_t>
};
export type NewParse_List_t = { type: 'list', val: Array<NewParse_Object_t> };
export type NewParse_String_t = { type: 'string', val: Buffer };
export type NewParse_Int_t = { type: 'number', val: number };

export type NewParse_Object_t =
    NewParse_Dict_t | NewParse_List_t | NewParse_String_t | NewParse_Int_t | NewParse_Comment_t | NewParse_Line_t;
*/

const error = (ctx, message) => {
    return new Error(ctx.getLine() + ':' + ctx.getColumn() + ' - ' + message);
};

const assertChar = (ctx, sExpect, lax) => {
    const schar = String.fromCharCode(ctx.peak());
    if (schar !== sExpect) {
        if (lax === true) { return false; }
        throw error(ctx, 'Expected a "' + sExpect + '", got "' + schar + '"');
    }
    return true;
};

const parseComment = (ctx) /*:NewParse_Comment_t*/ => {
    assertChar(ctx, '/');
    ctx.skip(1);
    const secondChar = String.fromCharCode(ctx.peak());
    if (secondChar !== '/' && secondChar !== '*') {
        throw error(ctx, "unexpected character [" + secondChar + ']');
    }
    const out = [];
    let lastCharSplat = false;
    for (;;) {
        ctx.skip(1);
        const bchar = ctx.peak();
        const schar = String.fromCharCode(bchar);
        if (lastCharSplat && secondChar === '*' && schar === '/') {
            // get rid of the trailing *
            out.pop();
            ctx.skip(1);
        } else if (secondChar === '/' && schar === '\n') {
        } else {
            lastCharSplat = (schar === '*');
            out.push(bchar);
            continue;
        }
        return { type: 'comment', val: Buffer.from(out) };
    }
    throw new Error();
};

const parseWhitespaceAndComments = (ctx) /*:Array<NewParse_Comment_t|NewParse_Line_t>*/ => {
    let emptyLine = false;
    const out = [];
    for (;;) {
        const firstChar = String.fromCharCode(ctx.peak());
        switch (firstChar) {
            case '\n':
                if (emptyLine) {
                    out.push({ type: 'line' });
                }
                emptyLine = true;
                /* falls through */
            case ' ':
            case '\r':
            case '\t':
                ctx.skip(1);
                continue;

            case '/':
                emptyLine = false;
                out.push(parseComment(ctx));
                continue;

            default: break;
        }
        break;
    }
    return out;
};

const parseString = (ctx) /*:NewParse_String_t*/ => {
    assertChar(ctx, '"');
    const out = [];
    for (;;) {
        ctx.skip(1);
        const bchar = ctx.peak();
        switch (String.fromCharCode(bchar)) {
            case '"': {
                ctx.skip(1);
                return { type: 'string', val: Buffer.from(out) };
            }
            case '\0':
            case '\n': {
                throw error(ctx, "unterminated string");
            }
            case '\\': {
                ctx.skip(1);
                const x = ctx.read1();
                if (String.fromCharCode(x) !== 'x') {
                    throw error(ctx, "\\ only allowed if followed by x (as in \\xff)");
                }
                const high = ctx.read1();
                const low = ctx.peak();
                const highLow = String.fromCharCode(high) + String.fromCharCode(low);
                if (!/[0-9a-fA-F]{2}/.test(highLow)) {
                    throw error(ctx, "invalid hex encoding");
                }
                out.push(Number('0x' + highLow));
                continue;
            }
            default: {
                out.push(bchar);
                continue;
            }
        }
    }
    throw new Error();
};

const parseInteger = (ctx) /*:NewParse_Int_t*/ => {
    let out = 0;
    let schar = ctx.peak();
    const negative = (schar === '-'.charCodeAt(0));
    if (negative) {
        ctx.skip(1);
        schar = ctx.peak();
    }
    if (schar < '0'.charCodeAt(0) || schar > '9'.charCodeAt(0)) {
        throw error(ctx, "expected a number but no decimal digits found");
    }
    do {
        out *= 10;
        out += schar - ('0'.charCodeAt(0));
        if (out > 0x7fffffffffffffff) {
            throw error(ctx, "number [" + ((negative) ? '-' : '') + out + "] too big");
        }
        ctx.skip(1);
        schar = ctx.peak();
    } while (schar >= '0'.charCodeAt(0) && schar <= '9'.charCodeAt(0));
    if (negative) { out *= -1; }
    return { type: 'number', val: out };
};

let parseList;
let parseDictionary;
const parseGeneric = (ctx) /*:NewParse_Object_t*/ => {
    const firstChar = String.fromCharCode(ctx.peak());
    switch (firstChar) {
        case '-':
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9': return parseInteger(ctx);
        case '[': return parseList(ctx);
        case '{': return parseDictionary(ctx);
        case '"': return parseString(ctx);
        default:
            throw error(ctx, "While looking for something to parse: " +
                   "expected one of - 0 1 2 3 4 5 6 7 8 9 [ { \", found " + firstChar);
    }
};

parseDictionary = (ctx) /*:NewParse_Dict_t*/ => {
    assertChar(ctx, '{');
    ctx.skip(1);
    const out = [];
    for (let i = 0; ; i++) {
        for (;;) {
            Array.prototype.push.apply(out, parseWhitespaceAndComments(ctx));
            if (!ctx.lax || ctx.peak() !== ','.charCodeAt(0)) { break; }
            ctx.skip(1);
        }
        if (ctx.peak() === '}'.charCodeAt(0)) {
            ctx.skip(1);
            return { type: 'dict', val: out };
        }
        if (i && assertChar(ctx, ',', ctx.lax)) {
            ctx.skip(1);
            Array.prototype.push.apply(out, parseWhitespaceAndComments(ctx));
        }
        const key = parseString(ctx);
        Array.prototype.push.apply(out, parseWhitespaceAndComments(ctx));
        if (assertChar(ctx, ':', ctx.lax)) {
            ctx.skip(1);
            Array.prototype.push.apply(out, parseWhitespaceAndComments(ctx));
        }
        out.push({ type: 'dictentry', k: key, v: parseGeneric(ctx) });
    }
    throw new Error();
};

parseList = (ctx) /*:NewParse_List_t*/ => {
    assertChar(ctx, '[');
    ctx.skip(1);
    const out = ([] /*:Array<NewParse_Object_t>*/);
    for (let i = 0; ; i++) {
        for (;;) {
            Array.prototype.push.apply(out, parseWhitespaceAndComments(ctx));
            if (!ctx.lax || ctx.peak() !== ','.charCodeAt(0)) { break; }
            ctx.skip(1);
        }
        if (ctx.peak() === ']'.charCodeAt(0)) {
            ctx.skip(1);
            return { type: 'list', val: out };
        }
        if (i && assertChar(ctx, ',', ctx.lax)) {
            ctx.skip(1);
            Array.prototype.push.apply(out, parseWhitespaceAndComments(ctx));
        }
        out.push(parseGeneric(ctx));
    }
    throw new Error();
};

const parse = module.exports.parse = (
    buf /*:Buffer*/,
    lax /*:?boolean*/
) /*:NewParse_Object_t*/ => {
    let marker = 0;
    let lineCount = 1;
    let beginningLastLine = 0;
    const ctx = {
        peak: () => { return buf[marker]; },
        skip: (num) => {
            for (let i = 0; i < num; i++) {
                if (buf[marker] === '\n'.charCodeAt(0)) {
                    beginningLastLine = marker;
                    lineCount++;
                }
                marker++;
            }
        },
        read1: () => {
            const out = buf[marker];
            ctx.skip(1);
            return out;
        },
        getLine: () => ( lineCount ),
        getColumn: () => ( marker - beginningLastLine ),
        lax: !!lax
    };
    // comments outside of the main structure will be eaten
    parseWhitespaceAndComments(ctx);
    return parseGeneric(ctx);
};