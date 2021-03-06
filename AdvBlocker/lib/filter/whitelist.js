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

advblocker.whitelist = (function (advblocker) {

    var WHITE_LIST_DOMAINS_LS_PROP = 'white-list-domains';
    var BLOCK_LIST_DOMAINS_LS_PROP = 'block-list-domains';

    var allowAllWhiteListRule = new advblocker.rules.UrlFilterRule('@@whitelist-all$document', advblocker.utils.filters.WHITE_LIST_FILTER_ID);

    var whiteListFilter = new advblocker.rules.UrlFilter();
    var blockListFilter = new advblocker.rules.UrlFilter();

    /**
     * Whitelist filter may not have been initialized yet
     * @returns {*|UrlFilter}
     */
    function getWhiteListFilter() {
        // Request domains property for filter initialization
        whiteListDomainsHolder.domains; // jshint ignore:line
        return whiteListFilter;
    }

    /**
     * Blacklist filter may not have been initialized yet
     * @returns {*|UrlFilter}
     */
    function getBlockListFilter() {
        // Request domains property for filter initialization
        blockListDomainsHolder.domains; // jshint ignore:line
        return blockListFilter;
    }

    /**
     * Returns whitelist mode
     * In default mode filtration is enabled for all sites
     * In inverted model filtration is disabled for all sites
     */
    function isDefaultWhiteListMode() {
        return advblocker.settings.isDefaultWhiteListMode();
    }

    /**
     * Read domains and initialize filters lazy
     */
    var whiteListDomainsHolder = {
        get domains() {
            return advblocker.lazyGet(whiteListDomainsHolder, 'domains', function () {
                whiteListFilter = new advblocker.rules.UrlFilter();
                // Reading from local storage
                var domains = getDomainsFromLocalStorage(WHITE_LIST_DOMAINS_LS_PROP);
                for (var i = 0; i < domains.length; i++) {
                    var rule = createWhiteListRule(domains[i]);
                    if (rule) {
                        whiteListFilter.addRule(rule);
                    }
                }
                return domains;
            });
        },
        add: function (domain) {
            if (this.domains.indexOf(domain) < 0) {
                this.domains.push(domain);
            }
        }
    };
    var blockListDomainsHolder = {
        get domains() {
            return advblocker.lazyGet(blockListDomainsHolder, 'domains', function () {
                blockListFilter = new advblocker.rules.UrlFilter();
                // Reading from local storage
                var domains = getDomainsFromLocalStorage(BLOCK_LIST_DOMAINS_LS_PROP);
                for (var i = 0; i < domains.length; i++) {
                    var rule = createWhiteListRule(domains[i]);
                    if (rule) {
                        blockListFilter.addRule(rule);
                    }
                }
                return domains;
            });
        },
        add: function (domain) {
            if (this.domains.indexOf(domain) < 0) {
                this.domains.push(domain);
            }
        }
    };

    function notifyWhiteListUpdated(options) {
        advblocker.listeners.notifyListeners(advblocker.listeners.UPDATE_WHITELIST_FILTER_RULES);
        advblocker.listeners.notifyListeners(advblocker.listeners.SYNC_REQUIRED, options);
    }

    /**
     * Create whitelist rule from input text
     * @param domain Domain
     * @returns {*}
     * @private
     */
    function createWhiteListRule(domain) {
        if (advblocker.utils.strings.isEmpty(domain)) {
            return null;
        }
        return advblocker.rules.builder.createRule("@@//" + domain + "$document", advblocker.utils.filters.WHITE_LIST_FILTER_ID);
    }

    /**
     * Adds domain to array of whitelist domains
     * @param domain
     */
    function addDomainToWhiteList(domain) {
        if (!domain) {
            return;
        }
        if (isDefaultWhiteListMode()) {
            whiteListDomainsHolder.add(domain);
        } else {
            blockListDomainsHolder.add(domain);
        }
    }

    /**
     * Remove domain form whitelist domains
     * @param domain
     */
    function removeDomainFromWhiteList(domain) {
        if (!domain) {
            return;
        }
        if (isDefaultWhiteListMode()) {
            advblocker.utils.collections.removeAll(whiteListDomainsHolder.domains, domain);
        } else {
            advblocker.utils.collections.removeAll(blockListDomainsHolder.domains, domain);
        }
    }

    /**
     * Remove domain from whitelist
     * @param domain
     */
    function removeFromWhiteList(domain) {
        var rule = createWhiteListRule(domain);
        if (rule) {
            if (isDefaultWhiteListMode()) {
                getWhiteListFilter().removeRule(rule);
            } else {
                getBlockListFilter().removeRule(rule);
            }
        }
        removeDomainFromWhiteList(domain);
        saveDomainsToLocalStorage();
        notifyWhiteListUpdated();
    }

    /**
     * Save domains to local storage
     */
    function saveDomainsToLocalStorage() {
        advblocker.localStorage.setItem(WHITE_LIST_DOMAINS_LS_PROP,
            JSON.stringify(whiteListDomainsHolder.domains));
        advblocker.localStorage.setItem(BLOCK_LIST_DOMAINS_LS_PROP,
            JSON.stringify(blockListDomainsHolder.domains));
    }

    /**
     * Retrieve domains from local storage
     * @param prop
     * @returns {Array}
     */
    function getDomainsFromLocalStorage(prop) {
        var domains = [];
        try {
            var json = advblocker.localStorage.getItem(prop);
            if (json) {
                domains = JSON.parse(json);
            }
        } catch (ex) {
            advblocker.console.error("Error retrieve whitelist domains {0}, cause {1}", prop, ex);
        }
        return domains;
    }

    /**
     * Adds domain to whitelist
     * @param domain
     */
    function addToWhiteList(domain) {
        var rule = createWhiteListRule(domain);
        if (rule) {
            if (isDefaultWhiteListMode()) {
                getWhiteListFilter().addRule(rule);
            } else {
                getBlockListFilter().addRule(rule);
            }
            addDomainToWhiteList(domain);
            saveDomainsToLocalStorage();
            notifyWhiteListUpdated();
        }
    }

    /**
     * Search for whitelist rule by url.
     */
    var findWhiteListRule = function (url) {

        if (!url) {
            return null;
        }

        var host = advblocker.utils.url.getHost(url);

        if (isDefaultWhiteListMode()) {
            return getWhiteListFilter().isFiltered(url, host, advblocker.RequestTypes.DOCUMENT, false);
        } else {
            var rule = getBlockListFilter().isFiltered(url, host, advblocker.RequestTypes.DOCUMENT, false);
            if (rule) {
                //filtering is enabled on this website
                return null;
            } else {
                return allowAllWhiteListRule;
            }
        }
    };

    /**
     * Changes whitelist mode
     * @param defaultMode
     */
    var changeDefaultWhiteListMode = function (defaultMode) {
        advblocker.settings.changeDefaultWhiteListMode(defaultMode);
        notifyWhiteListUpdated();
    };

    /**
     * Stop (or start in case of inverted mode) filtration for url
     * @param url
     */
    var whiteListUrl = function (url) {
        var domain = advblocker.utils.url.getHost(url);
        if (isDefaultWhiteListMode()) {
            addToWhiteList(domain);
        } else {
            removeFromWhiteList(domain);
        }
    };

    /**
     * Start (or stop in case of inverted mode) filtration for url
     * @param url
     */
    var unWhiteListUrl = function (url) {
        var domain = advblocker.utils.url.getHost(url);
        if (isDefaultWhiteListMode()) {
            removeFromWhiteList(domain);
        } else {
            addToWhiteList(domain);
        }
    };

    /**
     * Updates domains in whitelist
     * @param domains
     */
    var updateWhiteListDomains = function (domains) {
        domains = domains || [];
        if (isDefaultWhiteListMode()) {
            clearWhiteListed();
            addWhiteListed(domains);
        } else {
            clearBlockListed();
            addBlockListed(domains);
        }
        notifyWhiteListUpdated();
    };

    /**
     * Add domains to whitelist
     * @param domains
     */
    var addWhiteListed = function (domains) {
        if (!domains) {
            return;
        }
        for (var i = 0; i < domains.length; i++) {
            var domain = domains[i];
            whiteListDomainsHolder.add(domain);
            var rule = createWhiteListRule(domain);
            if (rule) {
                whiteListFilter.addRule(rule);
            }
        }
        saveDomainsToLocalStorage();
    };

    /**
     * Add domains to blocklist
     * @param domains
     */
    var addBlockListed = function (domains) {
        if (!domains) {
            return;
        }
        for (var i = 0; i < domains.length; i++) {
            var domain = domains[i];
            blockListDomainsHolder.add(domain);
            var rule = createWhiteListRule(domain);
            if (rule) {
                blockListFilter.addRule(rule);
            }
        }
        saveDomainsToLocalStorage();
    };

    /**
     * Clear whitelisted only
     */
    var clearWhiteListed = function () {
        advblocker.localStorage.removeItem(WHITE_LIST_DOMAINS_LS_PROP);
        advblocker.lazyGetClear(whiteListDomainsHolder, 'domains');
        whiteListFilter = new advblocker.rules.UrlFilter();
    };

    /**
     * Clear blocklisted only
     */
    var clearBlockListed = function () {
        advblocker.localStorage.removeItem(BLOCK_LIST_DOMAINS_LS_PROP);
        advblocker.lazyGetClear(blockListDomainsHolder, 'domains');
        blockListFilter = new advblocker.rules.UrlFilter();
    };

    /**
     * Configures whitelist service
     * @param whitelist Whitelist domains
     * @param blocklist Blocklist domains
     * @param whiteListMode Whitelist mode
     * @param options
     */
    var configure = function (whitelist, blocklist, whiteListMode, options) {
        clearWhiteListed();
        clearBlockListed();
        addWhiteListed(whitelist || []);
        addBlockListed(blocklist || []);
        advblocker.settings.changeDefaultWhiteListMode(whiteListMode);
        notifyWhiteListUpdated(options);
    };

    /**
     * Returns the array of whitelist domains
     */
    var getWhiteListDomains = function () {
        if (isDefaultWhiteListMode()) {
            return whiteListDomainsHolder.domains;
        } else {
            return blockListDomainsHolder.domains;
        }
    };

    /**
     * Returns the array of whitelisted domains
     */
    var getWhiteListedDomains = function () {
        return whiteListDomainsHolder.domains;
    };

    /**
     * Returns the array of blocklisted domains, inverted mode
     */
    var getBlockListedDomains = function () {
        return blockListDomainsHolder.domains;
    };

    /**
     * Returns the array of loaded rules
     */
    var getRules = function () {
        //TODO: blockListFilter

        return getWhiteListFilter().getRules();
    };

    /**
     * Initializes whitelist filter
     */
    var init = function () {
        /**
         * Access to whitelist/blacklist domains before the proper initialization of localStorage leads to wrong caching of its values
         * To prevent it we should clear cached values
         * https://github.com/advblockerTeam/advblockerBrowserExtension/issues/933
         */
        advblocker.lazyGetClear(whiteListDomainsHolder, 'domains');
        advblocker.lazyGetClear(blockListDomainsHolder, 'domains');
    };

    return {

        init: init,
        getRules: getRules,
        getWhiteListDomains: getWhiteListDomains,

        getWhiteListedDomains: getWhiteListedDomains,
        getBlockListedDomains: getBlockListedDomains,

        findWhiteListRule: findWhiteListRule,

        whiteListUrl: whiteListUrl,
        unWhiteListUrl: unWhiteListUrl,

        updateWhiteListDomains: updateWhiteListDomains,

        configure: configure,

        isDefaultMode: isDefaultWhiteListMode,
        changeDefaultWhiteListMode: changeDefaultWhiteListMode
    };

})(advblocker);

