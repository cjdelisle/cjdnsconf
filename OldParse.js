/*@flow*/
'use strict';

/*::
export type OldParse_Object_t =
    number|Buffer|Array<OldParse_Object_t>|{[string]:OldParse_Object_t};
*/

// This parser is laboriously written to copy the code in JsonSerializer.c bug for bug.

let parseGeneric;

/**
 * Read until 1 char after the target character.
 */
const readUntil = (target, reader) => {
    while (reader.read1() !== target.charCodeAt(0)) {}
};

const parseString = (reader) /*:Buffer*/ => {
    const BUFF_SZ = (1<<8);
    const BUFF_MAX = (1<<20);

    let curSize = BUFF_SZ;
    //struct Allocator* localAllocator = Allocator_child(allocator);
    //uint8_t* buffer = Allocator_malloc(localAllocator, curSize);
    let buffer = Buffer.alloc(curSize);
    readUntil('"', reader);
    buffer[0] = reader.read1();
    for (let i = 0; i < BUFF_MAX - 1; i++) {
        if (buffer[i] === '\\'.charCodeAt(0)) {
            // \x01 (skip the x)
            reader.skip(1);
            const hexHigh = String.fromCharCode(reader.read1());
            const hexLow = String.fromCharCode(reader.read1());
            buffer[i] = Number('0x' + hexHigh + '' + hexLow);
            if (isNaN(buffer[i])) { throw new Error("invalid escape"); }
        } else if (buffer[i] === '"'.charCodeAt(0)) {
            const output = Buffer.alloc(i);
            buffer.copy(output, 0, 0, i);
            return output;
        }
        if (i === curSize - 1) {
            curSize <<= 1;
            const nb = Buffer.alloc(curSize);
            buffer.copy(nb, 0, 0, i);
            buffer = nb;
        }
        buffer[i + 1] = reader.read1();
    }
    throw new Error("Maximum string length exceeded");
};

/** @see BencSerializer.h */
const parseint64_t = (reader) /*:number*/ => {
    const buffer = Buffer.alloc(32);

    for (let i = 0; i < 21; i++) {
        buffer[i] = reader.peak();
        //int32_t status = Reader_read(reader, buffer + i, 0);
        if (i === 0 && buffer[i] === '-'.charCodeAt(0)) {
            // It's just a negative number, no need to fail it.
            continue;
        }
        if (buffer[i] < '0'.charCodeAt(0) || buffer[i] > '9'.charCodeAt(0)) {
            //buffer[i] = '\0';
            //int64_t out = strtol((char*)buffer, NULL, 10);
            const str = buffer.slice(0,i).toString('utf8');
            const out = Number(str);
            // Failed parse causes 0 to be set.
            if (out === 0 &&
                buffer[0] !== '0'.charCodeAt(0) &&
                (buffer[0] !== '-'.charCodeAt(0) || buffer[1] !== '0'.charCodeAt(0)))
            {
                throw new Error("Failed to parse \"" + str + "\": not a number");
            }
            if (isNaN(out) || out >= 0x7fffffffffffffff || out <= -0x7fffffffffffffff) {
                throw new Error("Failed to parse \"" + str + "\": number too large/small\n");
            }
            return out;
        }
        reader.skip(1);
    }

    // Larger than the max possible int64.
    throw new Error("Failed to parse \"" + buffer.toString('utf8') + "\": number too large\n");
};

/**
 * Parse a comment in with "slash splat" or double slash notation,
 * leave the reader on the first character after the last end of comment mark.
 */
const parseComment = (reader) => {
    const high = reader.read1();
    const low = reader.read1();
    if (high !== '/'.charCodeAt(0)) {
        throw new Error("Warning: expected a comment starting with '/', instead found " +
            String.fromCharCode(high));
    }
    switch (low) {
        case '*'.charCodeAt(0):
            do {
                readUntil('*', reader);
            } while (reader.read1() !== '/'.charCodeAt(0));
            return -1;
        case '/'.charCodeAt(0):
            readUntil('\n', reader);
            return -1;
        default:
            throw new Error("Warning: expected a comment starting with \"//\" or \"/*\", " +
                   "instead found " + String.fromCharCode(low));
    }
};

/** @see BencSerializer.h */
const parseList = (reader) /*Array<OldParse_Object_t>*/ => {
    const out = [];
    readUntil('[', reader);

    for (;;) {
        for (;;) {
            const nextChar = String.fromCharCode(reader.peak());
            if (nextChar === '/') {
                parseComment(reader);
                continue;
            }
            switch (nextChar) {
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                case '[':
                case '{':
                case '"':
                    break;

                case ']':
                    reader.skip(1);
                    return out;

                default:
                    // FIXME(gerard): silently skipping anything we don't understand
                    // might not be the best idea
                    reader.skip(1);
                    continue;
            }
            break;
        }
        out.push(parseGeneric(reader));
    }
    throw new Error();
};

/** @see BencSerializer.h */
const parseDictionary = (reader) /*{[string]:OldParse_Object_t}*/ => {

    const out = {};
    readUntil('{', reader);

    for (;;) {
        for (;;) {
            //ret = Reader_read(reader, &nextChar, 0);
            switch (String.fromCharCode(reader.peak())) {
                case '"':
                    break;

                case '}':
                    reader.skip(1);
                    return out;

                case '/': {
                    // CAUTION: in a dict, the result of parseComment is disregarded !
                    try {
                        parseComment(reader);
                    } catch (e) { }
                    continue;
                }

                default:
                    reader.skip(1);
                    continue;
            }
            break;
        }

        // Get key and value.
        const key = parseString(reader).toString('utf8');
        readUntil(':', reader);
        const value = parseGeneric(reader);
        out[key] = value;
    }
    throw new Error();
};

parseGeneric = (reader) /*:OldParse_Object_t*/ => {
    let firstChar = String.fromCharCode(reader.peak());
    for (;;) {
        firstChar = String.fromCharCode(reader.peak());
        switch (firstChar) {
            case ' ':
            case '\r':
            case '\n':
            case '\t':
                reader.skip(1);
                continue;

            case '/':
                parseComment(reader);
                continue;

            default: break;
        }
        break;
    }

    switch (firstChar) {
        //case '-':  // old parser doesn't handle - numbers
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
            // int64_t. Int is special because it is not a pointer but a int64_t.
            return parseint64_t(reader);

        case '[':
            // List.
            return parseList(reader);

        case '{':
            // Dictionary
            return parseDictionary(reader);

        case '"':
            // String
            return parseString(reader);

        default:
            throw new Error("While looking for something to parse: " +
                   "expected one of 0 1 2 3 4 5 6 7 8 9 [ { \", found " + firstChar);
    }
};

const parse = module.exports.parse = (buf /*:Buffer*/) => {
    let marker = 0;
    const reader = {
        peak: () => { return buf[marker]; },
        read1: () => { return buf[marker++]; },
        skip: (num) => { marker += num; },
        read: (num, outBuffer /*:Buffer*/, offset /*:?number*/) => {
            offset = offset || 0;
            buf.copy(outBuffer, offset, marker, marker + num);
            marker += num;
        }
    };
    return parseGeneric(reader);
};