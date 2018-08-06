/*@flow*/
'use strict';

const NewParse = require('./NewParse.js');
const Stringify = require('./Stringify.js');
const Accessor = require('./Accessor.js');

/*::
import type { NewParse_Object_t } from './NewParse.js';
*/

module.exports.parse = (
    conf /*:string|Buffer*/,
    lax /*:?boolean*/
) /*:{[string]:any, _:NewParse_Object_t}*/ => {
    if (typeof(conf) === 'string') { conf = Buffer.from(conf); }
    if (!Buffer.isBuffer(conf)) { throw new Error("cjdnsconf: input must be a buffer or string"); }
    const p = NewParse.parse(conf, lax);
    return Accessor.wrap(p);
};

module.exports.stringify = (conf /*:{_:NewParse_Object_t}*/) /*:string*/ => {
    return Stringify.stringify(conf._);
};