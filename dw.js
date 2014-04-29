/**
 * Limitations:
 *   - auto-detection of currentScript is a stack-based hack
 *   - if we buffer multiple docwrites, we miss the write-then-query scenario
 *   - if we output immediately, we can emit invalid HTML
 */

;(function() {

var waiting = [];

/**
 * Get a proper batch of queued document.write calls.
 * Create a new one when necessary.
 */
var getBatch = function(node) {
	for (var i=0;i<waiting.length;i++) {
		var batch = waiting[i];
		if (batch.node == node) { return batch; }
	}
	
	var batch = {
		node: node,
		data: ""
	};
	waiting.push(batch);

	setTimeout(function() {
		var index = waiting.indexOf(batch);
		waiting.splice(index, 1);
		writeTo(batch.node, batch.data);
	}, 0);
	return batch;
}

/** Temporary ID counter */
var count = 0;

/**
 * Find a proper "parent" node (<script> element) for the current document.write call
 */
var getParent = function() {
	if (document.write.to) { return document.write.to; }
//	if (document.currentScript) { return document.currentScript; }
	var scripts = document.getElementsByTagName("script");
		
	try {
		throw new Error();
	} catch (e) {
		var stack = e.stack.split(/@|(?:\s+at\s+)/i);
		/* must contain at least 0) error, 1) getParent, 2) write, 3) original call site */
		if (stack.length >= 4) {
			var file = stack.pop().match(/(.*?)(:[0-9]+)*\n?$/)[1];
			for (var i=0;i<scripts.length;i++) {
				var script = scripts[i];
				if (script.src == file) { return script; }
			}
			
		}
	}

// FF: "write@http://localhost/dw/dw.js:109@http://localhost/dw/3.js:1"
// Chrome: "TypeError: number is not a function
//	at HTMLDocument.write (http://localhost/dw/dw.js:115:3) 
//  at http://localhost/dw/3.js:1:10"

	return (scripts.length ? scripts[scripts.length-1] : document.body);
}

/**
 * Write all pending data to the parent node
 */
var writeTo = function(node, data) {
	var external = {};
	var inline = {};

	var html = data.replace(/<script(.*?)>([\s\S]*?)<\/script>/ig, function(match, tag, code) {
		var id = "dw-tmp-" + (count++);

		var src = tag.match(/src=['"]?([^\s'"]+)/);
		if (src) {
			external[id] = src[1];
		} else {
			inline[id] = code;
		}

		return "<span id='"+id+"'></span>";
	});
	
	writeToSeparated(node, html, external, inline);
}

/**
 * Write HTML, external JS and inline JS parts to the parent node
 */
var writeToSeparated = function(node, html, external, inline) {	
	/* pres DocumentFragment, neb insertAdjacentHTML je az ve FF 8 */
	var frag = document.createDocumentFragment();
	var div = document.createElement("div");
	div.innerHTML = html;
	while (div.firstChild) { frag.appendChild(div.firstChild); }

	/* FIXME jsou tri varianty: 
	   - budto je to <script>, pak piseme za nej
	   - nebo je to docasny span, pak piseme misto nej
	   - nebo je to externe zadany prvek, pak piseme do nej
	*/
	if (node.nodeName.toLowerCase() == "script") {
		/* FIXME vice zapisu u opakovaneho docwrite prohodi poradi :/ */
		node.parentNode.insertBefore(frag, node.nextSibling);
	} else if (node.id.indexOf("dw-tmp-") == 0) {
		/* FIXME je tohle spravna chvile? ANO, pokud je to bufferovany zapis, protoze uz za nej nikdo psat nebude */
		node.parentNode.replaceChild(frag, node);
	} else {
		node.appendChild(frag);
	}

	for (var id in external) {
		var script = document.createElement("script");
		script.src = external[id];
		var tmp = document.getElementById(id);
		tmp.parentNode.replaceChild(script, tmp);
	}
	
	for (var id in inline) {
		var tmp = document.getElementById(id);
		document.write.to = tmp;
		(1,eval)(inline[id]);
		document.write.to = null;
		/* FIXME pokud neni docwrite bufferovany ale okamzity, muzeme ted odstranit tmp - jinak nahore */
	}
	
}

/**
 * Our very own document.write
 */
var write = function() {
	var parent = getParent();
	var batch = getBatch(parent);
	for (var i=0;i<arguments.length;i++) {
		batch.data += arguments[i];
	}
}

document.write = write;
document.writeTo = writeTo;
	
})();
