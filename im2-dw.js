var im = {
	conf: {
		urlLength: 2000,
		params: ["zoneId", "section", "collocation", "source", "passon", "flag"],
		protocol: (location.protocol.match(/s/i) ? "https" : "http"),
		server: "i.imedia.cz",
		charset: "utf-8"
	},

	zoneToId: {}, /* mapovani zon na ID; potreba kvuli adformovemu opakovanemu dotazovani */

	_flash: false,

	_detectAdTypes: function() {
		if (window.ActiveXObject) {
			try {
				new ActiveXObject("ShockwaveFlash.ShockwaveFlash");
				this._flash = true;
			} catch (e) {}
		}
		var type = "application/x-shockwave-flash";
		var mT = navigator.mimeTypes;
		if (mT && mT[type] && mT[type].enabledPlugin) { this._flash = true; }
	}
};

im._detectAdTypes();

/* zadost o reklamy */
im.getAds = function(data) {
	if (!data.length) { return; }
	this._logAds(data);

	var prefix = this._buildPrefix();
	var index = 0;
	var buffer = [];
	var url = prefix;
	do {
		if (index != data.length) { var str = this._buildItem(data[index], buffer.length); } /* serializovat dalsi zonovy objekt */

		if (index == data.length || (url.length + str.length > this.conf.urlLength && buffer.length)) { /* odeslat */
			var name = "adcb" + Math.random().toString().split(".").join("");
			this._buildCallback(name, buffer);
			url += "&callback=" + name;

			var s = document.createElement("script");
			s.src = url;
			document.getElementsByTagName("head")[0].appendChild(s);

			buffer = [];
			url = prefix;
			if (index != data.length) { str = this._buildItem(data[index], buffer.length); } /* znovu zeserializovat s novym indexem */
		}

		if (index != data.length) { /* prihodit prave vznikly objekt do zasobniku pro dalsi varku */
			buffer.push(data[index]);
			url += "&" + str;
		}

		index++;
	} while (buffer.length);
}

/* zapise reklamu do prvku se zadanym id */
im.writeAd = function(ad, data) {
	var container = (typeof(data.id) == "string" ? document.getElementById(data.id) : data.id);
	if (!container) { return false; }

	if (ad.indexOf('/impress?spotId=') != -1) { container.className += " adFull"; }
	document.writeTo(container, ad);
	if (data.scroll) { im._scroll(container); }
}

/* posun stranky s ohledem na kontejner s reklamou */
im._scroll = function(container) {
	var h = container.offsetHeight;
	var top = 0;
	var node = container;
	while (node) { top += node.offsetTop; node = node.offsetParent; }
	var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
	var scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft;
	if (scrollTop > top+h) { scrollTo(scrollLeft, scrollTop+h); }
}

/* flashplayer si zada o reklamu */
im.videoAds = function(id, zoneId, section, collocation) {
	var zoneIds = zoneId.split(",");
	var counter = zoneIds.length;
	var results = {};

	function callback(str, pos) {
		counter--;
		var type = pos.zoneId.split(".").pop().replace(/-/g,"");
		var result = im._parseVideoAd(str);
		if (result) { results[type] = result; }

		if (!counter) {
			var fl = document.getElementById(id);
			if (!fl) { return; }
			var embeds = fl.getElementsByTagName("embed");
			if (embeds.length) { fl = embeds[0]; }
			fl.setAds(results);
		}
	}

	var ads = [];
	for (var i=0;i<zoneIds.length;i++) { ads.push({callback:callback, zoneId:zoneIds[i], section:section, collocation:collocation}); }
	this.getAds(ads, true);

	return true; /* tohle playeru rekne, ze o reklamu bylo pozadano, at to znova nezkousi */
}

im._buildPrefix = function() {
	var obj = {
		charset: this.conf.charset,
		cookieEnabled: (navigator.cookieEnabled ? 1 : 0),
		lang: (navigator.language || navigator.systemLanguage || "").substring(0, 2),
		referer: document.referrer.substring(0, document.referrer.indexOf("/", 10)) /* protokol a :// se vejde do 10 znaku */
	}
	if (!this._flash) { obj.gflag = "!FLASH"; }
	var arr = [];
	for (var p in obj) { arr.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p])); }
	return this.conf.protocol + "://" + this.conf.server + "/javascript?mode=generic&" + arr.join("&");
}

/* zretezeni jedne pozice */
im._buildItem = function(data, index) {
	this.zoneToId[data.zoneId] = data.id; /* zapamatovat pro pripadny adform-related re-request */

	if (data.passons) { data.passon = data.passons; } /* zpetne kompatibilni hack */
	if (!data.callback) {
		var elm = (typeof(data.id) == "string" ? document.getElementById(data.id) : data.id);
		if (!elm) { throw new Error("No callback and invalid ID passed to IM (" + data.id + ")"); }
	}
	var arr = [];
	for (var i=0;i<this.conf.params.length;i++) {
		var param = this.conf.params[i];
		if (!(param in data)) { continue; }
		var value = data[param];
		var key = encodeURIComponent(param)+"-"+index;

		if (typeof(value) == "object") { /* passon */
			for (var p in value) {
				arr.push(key + "." + encodeURIComponent(p) + "=" + encodeURIComponent(value[p]));
			}
		} else { /* jednoducha hodnota */
			arr.push(key+"=" + encodeURIComponent(value));
		}

	}
	return arr.join("&");
}

/* vyrobi jsonp callback pro vydejovy server */
im._buildCallback = function(name, data) {
	window[name] = function(ads) {
		for (var i=0;i<ads.length;i++) {
			var ad = ads[i];
			var d = data[i];
			var cb = d.callback || im.writeAd; /* im.writeAd je vychozi callback */
			cb(ad, d);
		}
		window[name] = null;
		try { delete window[name]; } catch (e) {}; /* ie neumi delete z window */
	}
}

/* zalogovat pouzita zoneIds */
im._logAds = function(data) {
	if (!window.DOT) { return; }
	var zoneIds = {};
	for (var i=0;i<data.length;i++) { zoneIds[data[i].zoneId] = true; }
	var arr = []; for (var id in zoneIds) { 
		if (id in {}) { continue; } /* HACK pro nejake obsolete interprety, ktere enumeruji i DontEnum vlastnosti */
		arr.push(id); 
	}
	DOT.hit("ad", {d:{zones:arr.join(",")}});
}

/* vrati objekt nebo null pro videoodpoved od reklamniho serveru */
im._parseVideoAd = function(str) {
	var json = str;
	var comments = [];

	json = json.replace(/<!--(.*?)-->/g, function(comment, inner) {
		comments.push(inner);
		return "";
	}); /* spir komentare */


	for (var i=0;i<comments.length;i++) { /* presunout komentare do stranky */
		var c = comments[i];
		var comment = document.createComment(c);
		document.body.appendChild(comment);
	}

	json = json /* vyresolvit entity */
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, "\"")
			.replace(/&apos;/g, "'");

	/* pokud jsou data tvorena jen obrazkem, je to varianta MISS */
	var r = json.match(/^\s*<img *src *= *(['"])(.*?)\1[^>]*\/>\s*$/);

	if (r) { return [{ miss: r[2] }]; }

	json = json.replace(/<img.*?\/>/g, ""); /* nahodne zustale obrazky */
	json = json.replace(/}\s*{/g, "},{"); /* vicenasobna pozice */
	if (json.match(/^[\s]*$/)) { return null; } /* prazdno */
	var arr = eval("["+json+"]");
	return arr;
}
