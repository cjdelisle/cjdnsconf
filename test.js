/*@flow*/
'use strict';
const Fs = require('fs');
const nThen = require('nthen');
const Cjdnsconf = require('./index.js');

const assertEqual = (x, y) => {
    const xs = JSON.stringify(x);
    const ys = JSON.stringify(y);
    if (xs !== ys) { throw new Error("\n" + xs + " !== \n" + ys); }
};

const spliceTest = () => {
    const orig = `[
        // hihi
        "a",
        // test
        "b",
        // hello
        // world
        "c",
        // test2
        "d"
    ]`;
    let conf = Cjdnsconf.parse(orig);
    assertEqual(Cjdnsconf.stringify(conf), `[
    // hihi
    "a",
    // test
    "b",
    // hello
    // world
    "c",
    // test2
    "d"
]`);
    conf.splice(1, 1, "b2");
    assertEqual(Cjdnsconf.stringify(conf), `[
    // hihi
    "a",
    "b2",
    // hello
    // world
    "c",
    // test2
    "d"
]`);
    conf = Cjdnsconf.parse(orig);
    conf.splice(2, 1, "c2");
    assertEqual(Cjdnsconf.stringify(conf), `[
    // hihi
    "a",
    // test
    "b",
    "c2",
    // test2
    "d"
]`);

    conf = Cjdnsconf.parse(orig);
    conf.shift();
    assertEqual(Cjdnsconf.stringify(conf), `[
    // test
    "b",
    // hello
    // world
    "c",
    // test2
    "d"
]`);

    conf = Cjdnsconf.parse(orig);
    conf.pop();
    assertEqual(Cjdnsconf.stringify(conf), `[
    // hihi
    "a",
    // test
    "b",
    // hello
    // world
    "c"
]`);

    conf = Cjdnsconf.parse(orig);
    conf.push("hello");
    assertEqual(Cjdnsconf.stringify(conf), `[
    // hihi
    "a",
    // test
    "b",
    // hello
    // world
    "c",
    // test2
    "d",
    "hello"
]`);

    conf = Cjdnsconf.parse(orig);
    conf.splice(1, 1);
    assertEqual(Cjdnsconf.stringify(conf), `[
    // hihi
    "a",
    // hello
    // world
    "c",
    // test2
    "d"
]`);
    conf = Cjdnsconf.parse(orig);
    conf.splice(2, 1);
    assertEqual(Cjdnsconf.stringify(conf), `[
    // hihi
    "a",
    // test
    "b",
    // test2
    "d"
]`);

};

const deleteTest = () => {
    const orig = `{
        // hihi
        "a": "b",
        // test
        "b": "c",
        // hello
        // world
        "c": "d",
        // test2
        "d": "e"
    }`;
    let conf = Cjdnsconf.parse(orig);
    assertEqual(Cjdnsconf.stringify(conf), `{
    // hihi
    "a": "b",
    // test
    "b": "c",
    // hello
    // world
    "c": "d",
    // test2
    "d": "e"
}`);

    delete conf.a;
    assertEqual(Cjdnsconf.stringify(conf), `{
    // test
    "b": "c",
    // hello
    // world
    "c": "d",
    // test2
    "d": "e"
}`);

    conf = Cjdnsconf.parse(orig);
    delete conf.b;
    assertEqual(Cjdnsconf.stringify(conf), `{
    // hihi
    "a": "b",
    // hello
    // world
    "c": "d",
    // test2
    "d": "e"
}`);

    conf = Cjdnsconf.parse(orig);
    delete conf.c;
    assertEqual(Cjdnsconf.stringify(conf), `{
    // hihi
    "a": "b",
    // test
    "b": "c",
    // test2
    "d": "e"
}`);

};

const readFiles = (path, out, cb) => {
    Fs.readdir(path, (err, list) => {
        if (err) { throw err; }
        let nt = nThen;
        list.forEach((n) => {
            nt = nt((w) => {
                Fs.readFile(path + n, 'utf8', w((err, ret) => {
                    if (err) { throw err; }
                    out[n.replace(/\.conf$/, '')] = ret;
                }));
            }).nThen;
        });
        nt((w) => { cb(); });
    });
};

const failParse = (conf, passWithLax) => {
    let failed = false;
    try {
        Cjdnsconf.parse(conf);
        failed = true;
    } catch (e) { }
    if (failed) { throw new Error("Conf parsing should have failed"); }
    if (passWithLax) {
        Cjdnsconf.parse(conf, true);
    } else {
        try {
            Cjdnsconf.parse(conf, true);
            failed = true;
        } catch (e) { }
        if (failed) { throw new Error("Conf parsing should have failed with lax"); }
    }
};

const fail = {};
const failstrict = {};
const ok = {};
nThen((w) => {
    readFiles('./tests/fail/', fail, w());
    readFiles('./tests/failstrict/', failstrict, w());
    readFiles('./tests/ok/', ok, w());
}).nThen((w) => {
    const t0 = +new Date();
    Object.keys(fail).forEach((n) => { failParse(fail[n], false); });
    Object.keys(failstrict).forEach((n) => { failParse(failstrict[n], true); });
    Object.keys(ok).forEach((n) => {  Cjdnsconf.parse(ok[n], false); });

    if (ok.goodConf.indexOf('abcdefg') !== -1) { throw new Error(); }
    const json = Cjdnsconf.parse(ok.goodConf, true);
    const xjson = JSON.parse(JSON.stringify(json));
    const check = (path) => {
        // jshint -W054
        const f = new Function('json', 'return ' + path);
        // $FlowFixMe no arguments expected by new function o_O
        assertEqual(f(json), f(xjson));
    };
    
    check('json');
    check('json.security');
    check('json.security[0]');
    check('json.security.slice(0)');
    check('json.security.slice(3)');
    check('json.security.slice(-2)');
    check('json.security.slice(-2, -1)');
    check('json.security.slice(-1)');
    check('json.security.slice(2, 3)');
    check('json.security.slice(2, 2)');
    check('json.security.slice(1, 2)');

    check('json.security.push("lala", "ggg")');
    check('json.security.pop()');
    check('json.security.pop()');

    check('json.security.unshift("meme", "lol")');
    check('json.security[0] = "pingping"');
    check('json.security.shift()');
    check('json.security.shift()');

    check('json.security.unshift("lax")');
    check('json.security[0] = undefined');
    xjson.security.shift();
    check('json.security[0]');

    check('json.security.unshift("laxx")');
    check('json.security[0] = null');
    xjson.security.shift();
    check('json.security[0]');

    check('json.security.splice(3, 0, "hi")');

    check('Object.keys(json.security)');
    check('"hi" in json.security');
    check('json.security');

    const x = [], y = [];
    json.security.forEach((i, j) => { x.push(i, j); });
    xjson.security.forEach((i, j) => { y.push(i, j); });
    assertEqual(json, xjson);

    check('json.security.map((x, i)=>([x,i]))');
    check('json.security.filter((x)=>(x.setupComplete === 1))');
    check('json.security.push({"lala": "ggg"})');

    /// ----- ///
    check('json.router.xxx = -3');
    check('json.router.xxx = -4');
    check('json.router.xxx');
    check('"xxx" in json.router');
    check('delete json.router.xxx');
    check('json.router.xxx');

    check('json.router.xxx = -5');

    json.router.yyy = Buffer.from("00010203", "hex");
    xjson.router.yyy = "\\x00\\x01\\x02\\x03";
    check('json.router');

    json.zzz = Buffer.from("48454c4c4f20574f524c4401", "hex");
    xjson.zzz = "HELLO WORLD\\x01";

    check('json.abcd = ["foo", 3, "bar"]');
    check('json.abcd');

    const str = Cjdnsconf.stringify(json);
    const json2 = Cjdnsconf.parse(str);
    assertEqual(json, json2);
    assertEqual(xjson, json2);

    const error = (expr) => {
        check('json');
        // jshint -W054
        const f = new Function('json', expr);
        let failed = false;
        try {
            // $FlowFixMe no arguments expected by new function o_O
            f(json);
            failed = true;
        } catch (e) { }
        if (failed) {
            throw new Error("expression: [" + expr + "] should have thrown an error");
        }
        check('json');
    };

    error('json.xxx = 1.3');
    try { error('json.xxx = 2'); process.exit(100); } catch (e) { xjson.xxx = 2; }
    error('json.xxx = { _: "hi" }');
    error('json._ = "hi"');
    error('json.xxx = ()=>{}');
    error('json.xxx = Symbol()');
    error('json.xxx = false');

    check('json.xxx = 1');
    check('json.xxx = null');
    delete xjson.xxx;
    check('json.xxx');
    
    check('json.xxx = 1');
    check('json.xxx = undefined');
    delete xjson.xxx;
    check('json.xxx');

    error('json.security[1.3] = 1');
    error('json.security[800] = 1');
    error('json.security.sort()');
    error('json.security["xxx"] = 1');

    check('Object.getOwnPropertyDescriptor(json.security, "3").value');
    error('Object.getOwnPropertyDescriptor(json.security, "800").value');
    if (json._.type !== 'dict') { throw new Error(); }

    check('delete json.xxx');
    check('delete json.xxx');
    check('json.xxx');

    check('json.security[Symbol()]');
    if (json.security._.type !== 'list') { throw new Error(); }

    check('json.security.splice(1, 2, "hihi")');
    check('json.security');

    delete json.security[0];
    xjson.security.splice(0, 1);
    check('json.security');

    spliceTest();
    deleteTest();

    console.log("All tests successful in " + (+new Date() - t0) + 'ms');
});
