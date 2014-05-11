# dw

Experimenting with custom implementation of document.write.

## Usage

### 1. Basic usage

Just add a `<script src="dw.js"></script>` to your code and hope for the best.
Also, keep your fingers crossed; document.write is a very dark magic and
stuff can go always wrong without warning.

### 2. Advanced usage

If you have a HTML string with a potentially problematic code inside
(script nodes which might contain document.write), insert it into a parent
node via

```js
document.writeTo(parent, htmlCode);
```

## Limitations
 - external scripts written using `document.write` are async, not immediately available
 - code written using `document.write` is buffered in a highly speculative way
 - thou shalt not call `document.write` while there is an external script load pending
