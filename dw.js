/**
 * Limitations:
 *   - external scripts written using document.write are async, not immediately available
 *   - code written using document.write is buffered in a highly speculative way
 *   - thou shalt not call document.write while there is an external script load pending
 */
;(function() {

var emptyTags = "area,base,basefont,br,col,frame,hr,img,input,isindex,link,meta,param,embed,source".split(",");
var selfCloseTags = "colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr".split(",");

/**
 * List of sequentially loaded (pending) external scripts. Only one at a time may be loaded,
 * because when it executes, we need to have its <script> node accessible (ExternalScripts.current).
 */
var ExternalScripts = {
	current: null,
	queue: {
		local: [], /* requested during processing the current <script> block */
		global: [] /* requested earlier */
	},

	enqueue: function(scripts) {
		this.queue.local = this.queue.local.concat(scripts);

		/* wait until the document parsing is over */
		setTimeout(function() { ExternalScripts.processQueue(); }, 0);
	},

	/**
	 * Try to load next external script sequentially.
	 */
	processQueue: function() {
		if (this.current) { return; }

		while (this.queue.local.length) { this.queue.global.unshift(this.queue.local.pop()); }
		if (!this.queue.global.length) { return; }

		var obj = this.queue.global.shift();

		/* We need to create a new one; the old <script> is inactive */
		var script = document.createElement("script");

		var onload = function() {
			script.onload = script.onerror = script.onreadystatechange = null;
			ExternalScripts.current = null;
			ExternalScripts.processQueue();
		}

		if ("onload" in script) {
			script.onload = onload;
			script.onerror = onload;
		} else {
			script.onreadystatechange = function() {
				if (script.readyState == "loaded") { onload(); }
			}
		}

		script.src = obj.src;

		var tmp = document.getElementById(obj.id);
		tmp.parentNode.replaceChild(script, tmp);

		this.current = script;
	}
}

/** Temporary ID counter */
var idCount = 0;

/** Prefix for temporary element IDs */
var idPrefix = "dw-tmp-";

var currentInlineScript = null;

/**
 * Write all pending data to the parent node
 */
var writeTo = function(node, data) {
	var inline = {}, external = [];
	var srcRE = /src=['"]?([^\s'"]+)/i;

	var html = data.replace(/<script(.*?)>([\s\S]*?)<\/script>/ig, function(match, tag, code) {
		var id = idPrefix + (idCount++);

		var src = tag.match(srcRE);
		if (src) {
			external.push({id:id, src:src[1]});
		} else {
			inline[id] = code;
		}

		var script = ("<script" + tag + "></script>").replace(srcRE, "");
		return "<span id='"+id+"'></span>" + script;
	});

	writeToSeparated(node, html, inline);
	ExternalScripts.enqueue(external);
}

/**
 * Write HTML and inline JS parts to the parent node
 */
var writeToSeparated = function(node, html, inline) {
	/* use DocumentFragment; insertAdjacentHTML only in FF >= 8 */
	var frag = document.createDocumentFragment();
	var div = document.createElement("div");
	div.innerHTML = html;
	while (div.firstChild) { frag.appendChild(div.firstChild); }

	/* For <script> nodes, we insert before them. For other nodes, we append to them. */
	if (node.nodeName.toLowerCase() == "script" || node.id.indexOf(idPrefix) == 0) {
		node.parentNode.insertBefore(frag, node);
	} else {
		node.appendChild(frag);
	}

	for (var id in inline) {
		var tmp = document.getElementById(id);
		currentInlineScript = tmp;
		(1,eval)(inline[id]); /* eval in global scope */
		currentInlineScript = null;
		tmp.parentNode && tmp.parentNode.removeChild(tmp);
	}

}

/** We have to buffer arguments to document.write and check them for validity/writability */
var CodeBuffer = {
	code: "",
	node: null,

	append: function(node, code) {
		/* reset whatever was remaining in the code buffer */
		if (this.node != node) {
			this.code = "";
			this.node = node;
		}

		this.code += code;

		if (this.isWritable()) {
			var code = this.code;
			this.code = "";
			writeTo(this.node, code);
		}
	},

	/**
	 * Is this code considered safe to be parsed?
	 */
	isWritable: function() {
		var openTags = this.code.match(/<[a-z0-9-]+[\s>]/ig) || [];
		var closeTags = this.code.match(/<\/[a-z0-9-]+/ig) || [];

		var openCount = 0;
		for (var i=0;i<openTags.length;i++) {
			var name = openTags[i].substring(1).toLowerCase();
			/* Ignore empty tags (they have no close counterpart). Ignore self-close tags as well, we have no idea whether they are closed. */
			var n = name.substring(0,name.length-1);
			if (emptyTags.indexOf(n) > -1 || selfCloseTags.indexOf(n) > -1) { continue; }
			openCount++;
		}

		var closeCount = 0;
		for (var i=0;i<closeTags.length;i++) {
			var name = closeTags[i].substring(2).toLowerCase();
			/* Empty tags cannot appear here. Ignore self-close tags, they do not signify anything. */
			if (selfCloseTags.indexOf(name) > -1) { continue; }
			closeCount++;
		}

		if (openCount != closeCount) { return false; }

		return true;
	}
}

/**
 * Our very own document.write
 */
var write = function() {
	/*
	 * Find a proper "parent" node for the current document.write call.
	 * We can get here from three different document.write callsites:
	 *   1) plain <script> node in the original document:
	 *      -> take the last open <script> node
	 *   2) inline <script> code from another document.write:
	 *      -> take the document.write.to temporary variable
	 *   3) external <script> code from another document.write:
	 *      -> this is a queued call; ExternalScripts.current is its <script>
	 */
	var scripts = document.getElementsByTagName("script");
	var node = (currentInlineScript || ExternalScripts.current || scripts[scripts.length-1] || document.body);

	var code = "";
	for (var i=0;i<arguments.length;i++) { code += arguments[i]; }
	CodeBuffer.append(node, code);
}

document.write = write;
document.writeln = write;
document.writeTo = writeTo;

})();

/******************************************************************************/
