/**
 * This file is part of advblocker Browser Extension (https://github.com/advblockerTeam/advblockerBrowserExtension).
 *
 * advblocker Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * advblocker Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with advblocker Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */

(function (advblocker, api) {

    /**
     * Extension version (x.x.x)
     * @param version
     * @constructor
     */
    var Version = function (version) {

        this.version = Object.create(null);

        var parts = String(version || "").split(".");

        function parseVersionPart(part) {
            if (isNaN(part)) {
                return 0;
            }
            return Math.max(part - 0, 0);
        }

        for (var i = 3; i >= 0; i--) {
            this.version[i] = parseVersionPart(parts[i]);
        }
    };

    /**
     * Compares with other version
     * @param o
     * @returns {number}
     */
    Version.prototype.compare = function (o) {
        for (var i = 0; i < 4; i++) {
            if (this.version[i] > o.version[i]) {
                return 1;
            } else if (this.version[i] < o.version[i]) {
                return -1;
            }
        }
        return 0;
    };

    var objectContentTypes = '.jar.swf.';
    var mediaContentTypes = '.mp4.flv.avi.m3u.webm.mpeg.3gp.3gpp.3g2.3gpp2.ogg.mov.qt.';
    var fontContentTypes = '.ttf.otf.woff.woff2.eot.';
    var imageContentTypes = '.ico.png.gif.jpg.jpeg.webp.';

    //noinspection UnnecessaryLocalVariableJS
    var Utils = {

        getClientId: function () {

            var clientId = advblocker.localStorage.getItem("client-id");
            if (!clientId) {
                var result = [];
                var suffix = (Date.now()) % 1e8;
                var symbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz01234567890';
                for (var i = 0; i < 8; i++) {
                    var symbol = symbols[Math.floor(Math.random() * symbols.length)];
                    result.push(symbol);
                }
                clientId = result.join('') + suffix;
                advblocker.localStorage.setItem("client-id", clientId);
            }

            return clientId;
        },

        /**
         * Checks if left version is greater than the right version
         */
        isGreaterVersion: function (leftVersion, rightVersion) {
            var left = new Version(leftVersion);
            var right = new Version(rightVersion);
            return left.compare(right) > 0;
        },

        isGreaterOrEqualsVersion: function (leftVersion, rightVersion) {
            var left = new Version(leftVersion);
            var right = new Version(rightVersion);
            return left.compare(right) >= 0;
        },

        /**
         * Returns major number of version
         *
         * @param version
         */
        getMajorVersionNumber: function (version) {
            var v = new Version(version);
            return v.version[0];
        },

        /**
         * Returns minor number of version
         *
         * @param version
         */
        getMinorVersionNumber: function (version) {
            var v = new Version(version);
            return v.version[1];
        },

        /**
         * @returns Extension version
         */
        getAppVersion: function () {
            return advblocker.localStorage.getItem("app-version");
        },

        setAppVersion: function (version) {
            advblocker.localStorage.setItem("app-version", version);
        },

        isYaBrowser: function () {
            return advblocker.prefs.browser === "YaBrowser";
        },

        isOperaBrowser: function () {
            return advblocker.prefs.browser === "Opera";
        },

        isEdgeBrowser: function () {
            return advblocker.prefs.browser === "Edge";
        },

        isFirefoxBrowser: function () {
            return advblocker.prefs.browser === "Firefox";
        },

        isChromeBrowser: function () {
            return advblocker.prefs.browser === "Chrome";
        },

        isChromium: function () {
            return advblocker.prefs.platform === 'chromium';
        },

        isWindowsOs: function () {
            return navigator.userAgent.toLowerCase().indexOf("win") >= 0;
        },

        isMacOs: function () {
            return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        },

        /**
         * Finds header object by header name (case insensitive)
         * @param headers Headers collection
         * @param headerName Header name
         * @returns {*}
         */
        findHeaderByName: function (headers, headerName) {
            if (headers) {
                for (var i = 0; i < headers.length; i++) {
                    var header = headers[i];
                    if (header.name.toLowerCase() === headerName.toLowerCase()) {
                        return header;
                    }
                }
            }
            return null;
        },

        /**
         * Finds header value by name (case insensitive)
         * @param headers Headers collection
         * @param headerName Header name
         * @returns {null}
         */
        getHeaderValueByName: function (headers, headerName) {
            var header = this.findHeaderByName(headers, headerName);
            return header ? header.value : null;
        },

        /**
         * Set header value. Only for Chrome
         * @param headers
         * @param headerName
         * @param headerValue
         */
        setHeaderValue: function (headers, headerName, headerValue) {
            if (!headers) {
                headers = [];
            }
            var header = this.findHeaderByName(headers, headerName);
            if (header) {
                header.value = headerValue;
            } else {
                headers.push({name: headerName, value: headerValue});
            }
            return headers;
        },

        /**
         * Removes header from headers by name
         *
         * @param {Array} headers
         * @param {String} headerName
         * @return {boolean} True if header were removed
         */
        removeHeader: function (headers, headerName) {
            let removed = false;
            if (headers) {
                for (let i = headers.length - 1; i >= 0; i--) {
                    const header = headers[i];
                    if (header.name.toLowerCase() === headerName.toLowerCase()) {
                        headers.splice(i, 1);
                        removed = true;
                    }
                }
            }
            return removed;
        },

        getSafebrowsingBackUrl: function (tab) {
            //https://code.google.com/p/chromium/issues/detail?id=11854
            var previousUrl = advblocker.tabs.getTabMetadata(tab.tabId, 'previousUrl');
            if (previousUrl && previousUrl.indexOf('http') === 0) {
                return previousUrl;
            }
            var referrerUrl = advblocker.tabs.getTabMetadata(tab.tabId, 'referrerUrl');
            if (referrerUrl && referrerUrl.indexOf('http') === 0) {
                return referrerUrl;
            }

            return 'about:newtab';
        },

        /**
         * Parse content type from path
         * @param path Path
         * @returns {*} content type (advblocker.RequestTypes.*) or null
         */
        parseContentTypeFromUrlPath: function (path) {

            var ext = path.slice(-6);
            var pos = ext.lastIndexOf('.');

            // Unable to parse extension from url
            if (pos === -1) {
                return null;
            }

            ext = ext.slice(pos) + '.';
            if (objectContentTypes.indexOf(ext) !== -1) {
                return advblocker.RequestTypes.OBJECT;
            }
            if (mediaContentTypes.indexOf(ext) !== -1) {
                return advblocker.RequestTypes.MEDIA;
            }
            if (fontContentTypes.indexOf(ext) !== -1) {
                return advblocker.RequestTypes.FONT;
            }
            if (imageContentTypes.indexOf(ext) !== -1) {
                return advblocker.RequestTypes.IMAGE;
            }

            return null;
        },

        /**
         * Retrieve languages from navigator
         * @param limit Limit of preferred languages
         * @returns {Array}
         */
        getNavigatorLanguages: function (limit) {
            var languages = [];
            // https://developer.mozilla.org/ru/docs/Web/API/NavigatorLanguage/languages
            if (advblocker.utils.collections.isArray(navigator.languages)) {
                languages = navigator.languages.slice(0, limit);
            } else if (navigator.language) {
                languages.push(navigator.language); // .language is first in .languages
            }
            return languages;
        },

        /**
         * Affected issues:
         * https://github.com/advblockerTeam/advblockerBrowserExtension/issues/602
         * https://github.com/advblockerTeam/advblockerBrowserExtension/issues/566
         * 'Popup' window

         * Creators update is not yet released, so we use Insider build 15063 instead.
         */
        EDGE_CREATORS_UPDATE: 15063,

        isEdgeBeforeCreatorsUpdate: function () {
            return this.isEdgeBrowser() && advblocker.prefs.edgeVersion.build < this.EDGE_CREATORS_UPDATE;
        },

        /**
         * Returns extension params: clientId, version and locale
         */
        getExtensionParams: function () {
            var clientId = encodeURIComponent(this.getClientId());
            var locale = encodeURIComponent(advblocker.app.getLocale());
            var version = encodeURIComponent(advblocker.app.getVersion());
            var id = encodeURIComponent(advblocker.app.getId());
            var params = [];
            params.push('v=' + version);
            params.push('cid=' + clientId);
            params.push('lang=' + locale);
            params.push('id=' + id);
            return params;
        },

        /**
         * Checks if extension has required permissions
         * @param {Array<string>} permissions
         * @param {Array<string>} [origins]
         * @returns {Promise<boolean>}
         */
        containsPermissions: (permissions, origins) => new Promise((resolve) => {
            browser.permissions.contains({
                permissions,
                origins,
            }, resolve);
        }),

        /**
         * Requests required permission
         * @param {Array<string>} permissions
         * @param {Array<string>} [origins]
         * @returns {Promise<any>}
         */
        requestPermissions: (permissions, origins) => new Promise((resolve) => {
            browser.permissions.request({
                permissions,
                origins,
            }, resolve);
        }),

        /**
         * Removes unused permissions
         * @param {Array<string>} permissions
         * @param {Array<string>} [origins]
         * @returns {Promise<any>}
         */
        removePermission: (permissions, origins) => new Promise((resolve) => {
            browser.permissions.remove({
                permissions,
                origins,
            }, resolve);
        }),
    };

    api.browser = Utils;

})(advblocker, advblocker.utils);
