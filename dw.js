;(function() {

/** We won't write until these are balanced */
var pairTags = ["a", "div", "form", "li", "ol", "script", "span", "table", "ul"];
var openTagRE = new RegExp("<(" + pairTags.join("|") + ")[^a-z]", "gi");
var closeTagRE = new RegExp("</\\s*(" + pairTags.join("|") + ")[^a-z]", "gi");


/** Temporary ID counter */
var idCount = 0;

/** Prefix for temporary element IDs */
var idPrefix = "dw-tmp-";

/** A buffered code; document.write calls might be called with an invalid HTML fragment */
var CodeBuffer = function(node) {
	this.node = node;
	this.code = "";

	var all = this.constructor.all;
	var self = this;

	setTimeout(function() {
		var index = all.indexOf(self);
		all.splice(index, 1);
		writeTo(self.node, self.code);
	}, 0);
}

/** All currently pending buffers */
CodeBuffer.all = [];

/**
 * Get a proper buffer of queued document.write calls.
 * Create a new one when necessary.
 */
CodeBuffer.get = function(node) {
	for (var i=0;i<this.all.length;i++) {
		var item = this.all[i];
		if (item.node == node) { return item; }
	}
	
	var item = new this(node);
	this.all.push(item);
	return item;
}

/**
 * Append a code piece; write when suitable
 */
CodeBuffer.prototype.append = function(code) {
	this.code += code;
	
	if (this.isWritable()) {
		writeTo(this.node, this.code);
		this.code = "";
	}
}

/**
 * Is this code considered safe to be parsed?
 */
CodeBuffer.prototype.isWritable = function() {
	var openScripts = (this.code.match(openTagRE) || []).length;
	var closeScripts = (this.code.match(closeTagRE) || []).length;
	if (openScripts != closeScripts) { return false; }

	return true;
}

/**
 * List of sequentially loaded (pending) external scripts. Only one at a time may be loaded, 
 * because when it executes, we need to have its <script> node accessible (ExternalScripts.current).
 */
var ExternalScripts = {
	current: null,
	queue: {},

	enqueue: function(scripts) {
		for (var id in scripts) {
			this.queue[id] = scripts[id];
		}
		
		/* wait until the document parsing is over */
		setTimeout(function() { ExternalScripts.processQueue(); }, 0);
	},
	
	/**
	 * Try to load next external script sequentially.
	 */
	processQueue: function() {
		if (this.current) { return; }
		
		for (var id in this.queue) {
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

/**
 * Write all pending data to the parent node
 */
var writeTo = function(node, data) {
	var external = {};
	var inline = {};

	var html = data.replace(/<script(.*?)>([\s\S]*?)<\/script>/ig, function(match, tag, code) {
		var id = idPrefix + (idCount++);

		var src = tag.match(/src=['"]?([^\s'"]+)/);
		if (src) {
			external[id] = src[1];
		} else {
			inline[id] = code;
		}

		return "<script id='"+id+"'></script>";
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
	if (node.nodeName.toLowerCase() == "script") {
		node.parentNode.insertBefore(frag, node);
	} else {
		node.appendChild(frag);
	}

	for (var id in inline) {
		var tmp = document.getElementById(id);
		document.write.to = tmp;
		(1,eval)(inline[id]); /* eval in global scope */
		document.write.to = null;
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
	var node = (document.write.to || ExternalScripts.current || scripts[scripts.length-1] || document.body);
	var buffer = CodeBuffer.get(node);
	
	var code = "";
	for (var i=0;i<arguments.length;i++) { code += arguments[i]; }
	buffer.append(code);
}

document.write = write;
document.writeTo = writeTo;
	
})();
