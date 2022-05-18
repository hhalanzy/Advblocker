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

/**
 * Initializing SafebrowsingFilter.
 *
 * http://advblocker.com/en/how-malware-blocked.html#extension
 */

advblocker.safebrowsing = (function (advblocker, global) {

    /**
     * Cache with maxCacheSize stored in local storage.
     *
     * @param lsProperty    Name of the local storage property.
     * @param size          Max cache size
     */

    var LocalStorageCache = function (lsProperty, size) {

        var CACHE_SIZE = 1000;

        var maxCacheSize = size || CACHE_SIZE;

        var cache;
        var cacheSize;

        function getCacheFromLocalStorage() {
            var data = Object.create(null);
            try {
                var json = advblocker.localStorage.getItem(lsProperty);
                if (json) {
                    data = JSON.parse(json);
                }
            } catch (ex) {
                //ignore
                advblocker.console.error("Error read from {0} cache, cause: {1}", lsProperty, ex);
                advblocker.localStorage.removeItem(lsProperty);
            }
            return data;
        }

        function saveCacheToLocalStorage() {
            try {
                advblocker.localStorage.setItem(lsProperty, JSON.stringify(cache));
            } catch (ex) {
                advblocker.console.error("Error save to {0} cache, cause: {1}", lsProperty, ex);
            }
        }

        function getItem(key, ttl) {
            ttl = isNaN(ttl) ? 0 : ttl;
            var value = cache[key];
            if (value !== undefined) {
                var expired = value.expired - 0;
                if (Date.now() >= expired - ttl) {
                    return null;
                }
                return value;
            }
            return null;
        }


        function cleanup() {
            var key;
            for (key in cache) { // jshint ignore:line
                var foundItem = getItem(key);
                if (!foundItem) {
                    delete cache[key];
                    cacheSize--;
                }
            }
            if (cacheSize > maxCacheSize / 2) {
                for (key in cache) { // jshint ignore:line
                    delete cache[key];
                    cacheSize--;
                    if (cacheSize <= maxCacheSize / 2) {
                        break;
                    }
                }
            }
            saveCacheToLocalStorage();
        }

        var getValue = function (value) {
            var foundItem = getItem(value);
            return foundItem ? foundItem.match : null;
        };

        var saveValue = function (value, match, expired) {
            if (!value) {
                return;
            }
            if (cacheSize > maxCacheSize) {
                cleanup();
            }
            cache[value] = {
                match: match,
                expired: expired
            };
            cacheSize++;

            if (cacheSize % 20 === 0) {
                saveCacheToLocalStorage();
            }
        };

        // Load cache
        cache = getCacheFromLocalStorage();
        cacheSize = Object.keys(cache).length;

        cleanup();

        return {
            getValue: getValue,
            saveValue: saveValue
        };
    };

    // Lazy initialized safebrowsing cache
    var safebrowsingCache = {
        get cache() {
            return advblocker.lazyGet(safebrowsingCache, 'cache', function () {
                return new LocalStorageCache("sb-cache");
            });
        }
    };

    var suspendedFromProperty = "safebrowsing-suspended-from";

    /**
     * If we've got an error response from the backend, suspend requests for
     * this time: 40 minutes
     */
    var SUSPEND_TTL = 40 * 60 * 1000;

    /**
     * SB cache ttl: 40 minutes
     */
    var SB_TTL = 40 * 60 * 1000;

    /**
     * If user ignores warning - do not check SB for 40 minutes
     */
    var TRUSTED_TTL = 40 * 60 * 1000;
    var SB_WHITE_LIST = "whitelist";

    /**
     * Parses safebrowsing service response
     *
     * @param responseText  Response text
     * @param hashesMap  Hashes hosts map
     * @returns Safebrowsing list or null
     * @private
     */
    function processSbResponse(responseText, hashesMap) {

        if (!responseText || responseText.length > 10 * 1024) {
            return null;
        }

        try {
            var lines = responseText.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var r = lines[i].split(":");
                var hash = r[2];
                var host = hashesMap[hash];
                if (host) {
                    return r[0];
                }
            }

            return null;
        } catch (ex) {
            advblocker.console.error("Error parse safebrowsing response, cause {0}", ex);
        }
        return null;
    }

    /**
     * Creates lookup callback parameter
     * @param sbList    Safebrowsing list we've detected or null
     * @returns Safebrowsing list or null if this list is SB_WHITE_LIST (means that site was whitelisted).
     * @private
     */
    function createResponse(sbList) {
        return (sbList == SB_WHITE_LIST) ? null : sbList;
    }

    /**
     * Resumes previously suspended work of SafebrowsingFilter
     * @private
     */
    function resumeSafebrowsing() {
        advblocker.localStorage.removeItem(suspendedFromProperty);
    }

    /**
     * Suspend work of SafebrowsingFilter (in case of backend error)
     * @private
     */
    function suspendSafebrowsing() {
        advblocker.localStorage.setItem(suspendedFromProperty, Date.now());
    }

    /**
     * Checks safebrowsing cache
     *
     * @param hosts List of hosts
     * @returns Safebrowsing list (for blacklisted request) or null
     * @private
     */
    function checkHostsInSbCache(hosts) {
        for (var i = 0; i < hosts.length; i++) {
            var sbList = safebrowsingCache.cache.getValue(hosts[i]);
            if (sbList) {
                return sbList;
            }
        }
        return null;
    }

    /**
     * Extracts hosts from one host.
     * This method returns all sub-domains and IP address of the specified host.
     *
     * @param host Host
     * @returns Array of extracted host names
     * @private
     */
    function extractHosts(host) {

        var hosts = [];
        if (advblocker.utils.url.isIpv4(host) || advblocker.utils.url.isIpv6(host)) {
            hosts.push(host);
            return hosts;
        }

        var parts = host.split(".");
        if (parts.length <= 2) {
            hosts.push(host);
        } else {
            for (var i = 0; i <= parts.length - 2; i++) {
                hosts.push(advblocker.utils.strings.join(parts, ".", i, parts.length));
            }
        }

        return hosts;
    }

    /**
     * Calculates SHA256 hashes for strings in hosts and then
     * gets prefixes for calculated hashes
     *
     * @param hosts
     * @returns Map object of prefixes
     * @private
     */
    function createHashesMap(hosts) {

        var result = Object.create(null);

        for (var i = 0; i < hosts.length; i++) {
            var host = hosts[i];
            var hash = global.SHA256.hash(host + '/');
            result[hash.toUpperCase()] = host;
        }

        return result;
    }

    /**
     * Checks URL with safebrowsing filter.
     * http://advblocker.com/en/how-malware-blocked.html#extension
     *
     * @param requestUrl Request URL
     * @param referrerUrl Referrer URL
     * @param safebrowsingCallback Called when check has been finished
     * @param incognitoTab Tab incognito mode
     */
    var checkSafebrowsingFilter = function (requestUrl, referrerUrl, safebrowsingCallback, incognitoTab) {

        if (!advblocker.settings.getSafebrowsingInfo().enabled) {
            return;
        }

        advblocker.console.debug("Checking safebrowsing filter for {0}", requestUrl);

        var callback = function (sbList) {

            if (!sbList) {
                advblocker.console.debug("No safebrowsing rule found");
                return;
            }
            advblocker.console.debug("Following safebrowsing filter has been fired: {0}", sbList);
            if (!incognitoTab && advblocker.settings.getSafebrowsingInfo().sendStats) {
                advblocker.backend.trackSafebrowsingStats(requestUrl);
            }
            safebrowsingCallback(getErrorPageURL(requestUrl, referrerUrl, sbList));

        };

        lookupUrlWithCallback(requestUrl, callback);
    };

    /**
     * Performs lookup to safebrowsing service
     *
     * @param requestUrl        Request URL
     * @param lookupUrlCallback Called on successful check
     */
    var lookupUrlWithCallback = function (requestUrl, lookupUrlCallback) {

        var host = advblocker.utils.url.getHost(requestUrl);
        if (!host) {
            return;
        }

        var hosts = extractHosts(host);
        if (!hosts || hosts.length === 0) {
            return;
        }

        // try find request url in cache
        var sbList = checkHostsInSbCache(hosts);
        if (sbList) {
            lookupUrlCallback(createResponse(sbList));
            return;
        }

        // check safebrowsing is active
        var now = Date.now();
        var suspendedFrom = advblocker.localStorage.getItem(suspendedFromProperty) - 0;
        if (suspendedFrom && (now - suspendedFrom) < SUSPEND_TTL) {
            return;
        }

        var hashesMap = createHashesMap(hosts);

        var successCallback = function (response) {
            if (response.status >= 500) {
                // Error on server side, suspend request
                advblocker.console.error("Error response status {0} received from safebrowsing lookup server.", response.status);
                suspendSafebrowsing();
                return;
            }
            resumeSafebrowsing();

            var sbList = SB_WHITE_LIST;
            if (response.status != 204) {
                sbList = processSbResponse(response.responseText, hashesMap) || SB_WHITE_LIST;
            }

            safebrowsingCache.cache.saveValue(host, sbList, Date.now() + SB_TTL);

            lookupUrlCallback(createResponse(sbList));

        };

        var errorCallback = function () {
            advblocker.console.error("Error response from safebrowsing lookup server for {0}", host);
            suspendSafebrowsing();
        };

        var hashes = Object.keys(hashesMap);
        var shortHashes = [];
        for (var i = 0; i < hashes.length; i++) {
            shortHashes.push(hashes[i].substring(0, 8));
        }

        advblocker.backend.lookupSafebrowsing(shortHashes, successCallback, errorCallback);
    };

    /**
     * Temporarily whitelist URL
     * Adds URL to trusted sites (this URL will be ignored by safebrowsing filter)
     *
     * @param url URL
     */
    var addToSafebrowsingTrusted = function (url) {
        var host = advblocker.utils.url.getHost(url);
        if (!host) {
            return;
        }
        safebrowsingCache.cache.saveValue(host, SB_WHITE_LIST, Date.now() + TRUSTED_TTL);
    };

    /**
     * Access Denied page URL
     *
     * @param requestUrl    Request URL
     * @param referrerUrl   Referrer URL
     * @param sbList        Safebrowsing list
     * @returns page URL
     */
    var getErrorPageURL = function (requestUrl, referrerUrl, sbList) {
        var listName = sbList || "malware";
        var isMalware = advblocker.utils.strings.contains(listName, "malware");
        var url = 'pages/sb.html';
        url += "?malware=" + isMalware;
        url += "&host=" + encodeURIComponent(advblocker.utils.url.getHost(requestUrl));
        url += "&url=" + encodeURIComponent(requestUrl);
        url += "&ref=" + encodeURIComponent(referrerUrl);
        return advblocker.getURL(url);
    };

    return {

        checkSafebrowsingFilter: checkSafebrowsingFilter,
        lookupUrlWithCallback: lookupUrlWithCallback,
        addToSafebrowsingTrusted: addToSafebrowsingTrusted,
        getErrorPageURL: getErrorPageURL,

        extractHosts: extractHosts,
        createHashesMap: createHashesMap,
        processSbResponse: processSbResponse
    };

})(advblocker, window);
