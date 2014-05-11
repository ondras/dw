/**
 * Limitations:
 *   - external scripts written using document.write are async, not immediately available
 *   - code written using document.write is buffered in a highly speculative way
 *   - thou shalt not call document.write while there is an external script load pending
 */
;(function() {

/** We won't write until these are balanced */
var pairTags = ["a", "div", "form", "li", "ol", "script", "span", "table", "ul"];

/**
 * List of sequentially loaded (pending) external scripts. Only one at a time may be loaded, 
 * because when it executes, we need to have its <script> node accessible (ExternalScripts.current).
 */
var ExternalScripts = {
	current: null,
	queue: {},

	enqueue: function(scripts) {
		for (var id in scripts) { this.queue[id] = scripts[id]; }
		
		/* wait until the document parsing is over */
		setTimeout(function() { ExternalScripts.processQueue(); }, 0);
	},
	
	/**
	 * Try to load next external script sequentially.
	 */
	processQueue: function() {
		if (this.current) { return; }
		
		for (var id in this.queue) {
			/* We need to create a new one; the old <script> is inactive */
			this.current = document.createElement("script");
			this.current.onload = function() {
				ExternalScripts.current = null;
				ExternalScripts.processQueue();
			};
			this.current.src = this.queue[id];
			
			var tmp = document.getElementById(id);
			tmp.parentNode.replaceChild(this.current, tmp);

			delete this.queue[id];
			return;
		}
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
	var inline = {}, external = {};

	var html = data.replace(/<script(.*?)>([\s\S]*?)<\/script>/ig, function(match, tag, code) {
		var id = idPrefix + (idCount++);

		var src = tag.match(/src=['"]?([^\s'"]+)/);
		if (src) {
			external[id] = src[1];
		} else {
			inline[id] = code;
		}

		return "<span id='"+id+"'></span>";
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
		tmp.parentNode.removeChild(tmp);
	}
	
}

/** We have to buffer arguments to document.write and check them for validity/writability */
var CodeBuffer = {
	code: "",
	node: null,
	openTagRE: new RegExp("<(" + pairTags.join("|") + ")[^a-z]", "gi"),
	closeTagRE: new RegExp("</\\s*(" + pairTags.join("|") + ")[^a-z]", "gi"),
	
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
		var openScripts = (this.code.match(this.openTagRE) || []).length;
		var closeScripts = (this.code.match(this.closeTagRE) || []).length;
		if (openScripts != closeScripts) { return false; }

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
	 *      -> this is a queued call; ExternalScripts.current is it's <script>
	 */
	var scripts = document.getElementsByTagName("script");
	var node = (currentInlineScript || ExternalScripts.current || scripts[scripts.length-1] || document.body);

	var code = "";
	for (var i=0;i<arguments.length;i++) { code += arguments[i]; }
	CodeBuffer.append(node, code);
}

document.write = write;
document.writeTo = writeTo;
	
})();
