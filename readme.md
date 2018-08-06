# Cjdnsconf
Library for manipulating cjdns config files (and anything else like them).

* JSON with comments
* parse, edit as javascript object, save back into cjdns conf format (**preserving comments**).

## API

```javascript
/*
 * Parse a string or buffer containing a cjdroute.conf style configuration file, returns a
 * special object (see below "how it works") which can be manipulated as a json object and
 * re-serialized.
 */
Cjdnsconf.parse(string|buffer) => cjdnsconf_object;

/*
 * Serialize a cjdnsconf json object back to a conf file, preserving comments and empty lines.
 */
Cjdnsconf.serialize(cjdnsconf_object) => string;
```

## What is Cjdnsconf

Cjdns conf format is based on bencoding but represented like JSON. The types are `int`, `list`,
`dict` and `string`. Strings can contain arbitrary binary values. JSON types `boolean` and `null`
are not allowed, neither are decimal numbers.

Strings can contain 8 bit values only, the parser handles UTF-8 properly but the serializer will
emit escaped characters. For example:

```javascript
> Cjdnsconf.parse('{"x":"hello beautiful world😊"}').x
'hello beautiful world\\xf0\\x9f\\x98\\x8a'
```

You can specify binary as a string using the hex escape code:

```shell
INPUT='{"binary":"\x01\x02\x03\x04"}' node -e 'console.log(require("./index.js").parse(process.env.INPUT))'
{ binary: '\\x01\\x02\\x03\\x04' }
```

However, Octal, Unicode and other escapes do not work.

### Comments

Cjdns conf format allows C and C++ style comments.

```javascript
> const conf = Cjdnsconf.parse(`{
...     // this is a one line comment
...     "x": "y"
...     /*
...      * this is a multi-line comment
...      */
... }`);
undefined
> conf.x = "z";
'z'
> console.log(Cjdnsconf.stringify(conf));
{
    // this is a one line comment
    "x": "z"
    /*
     * this is a multi-line comment
     */
}
undefined
```

When splicing items out of lists, all comments appearing **before** a removed item will be
removed aswell. Because undefined is illegal in cjdns conf format, `delete list[3]` is an
alias for `list.splice(3, 1)` to make it easier.

```javascript
> const conf2 = Cjdnsconf.parse(`[
...     "a",
...     // test
...     "b",
...     // hello
...     // world
...     "c",
...     "d"
... ]`);
undefined
> console.log(Cjdnsconf.stringify(conf2));
[
    "a",
    "c2",
    // hello
    // world
    "c",
    "d"
]
undefined
```

Deleting items in objects will also clear the comments immediately before the item.

```javascript
> const conf = Cjdnsconf.parse(`{
...     // hihi
...     "a": "b",
...     // hello
...     // world
...     "c": "d",
...     // test2
...     "d": "e"
... }`);
undefined
> delete conf.c;
true
> console.log(Cjdnsconf.stringify(conf));
{
    // hihi
    "a": "b",
    // test2
    "d": "e"
}
undefined
```

## How it works

Obviously there is a parser and a serializer, but between the parser and serializer
there is a
[Javascript Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)
which represents the json object. Every time you access this proxy, you are provided
with another proxy and when you update the proxy, it reflects your updates in the
underlying structure (which includes the comments and empty lines).

## License

MIT

Configuration files with comments are hard to deal with, nobody should have to
reimplement this.