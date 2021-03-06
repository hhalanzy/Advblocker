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

    'use strict';

    /**
     * Filter for cookie filter rules
     * https://github.com/advblockerTeam/advblockerBrowserExtension/issues/961
     */
    api.CookieFilter = function (rules) {

        var cookieWhiteFilter = new api.UrlFilterRuleLookupTable();
        var cookieBlockFilter = new api.UrlFilterRuleLookupTable();

        /**
         * Add rules to filter
         * @param rules Collection of rules
         */
        function addRules(rules) {
            for (var i = 0; i < rules.length; i++) {
                addRule(rules[i]);
            }
        }

        /**
         * Add rule to filter
         * @param rule Rule object
         */
        function addRule(rule) {
            if (rule.whiteListRule) {
                cookieWhiteFilter.addRule(rule);
            } else {
                cookieBlockFilter.addRule(rule);
            }
        }

        /**
         * Removes from filter
         * @param rule Rule to remove
         */
        function removeRule(rule) {
            if (rule.whiteListRule) {
                cookieWhiteFilter.removeRule(rule);
            } else {
                cookieBlockFilter.removeRule(rule);
            }
        }

        /**
         * All rules in filter
         *
         * @returns {*|Array.<T>|string|Buffer}
         */
        function getRules() {
            var rules = cookieWhiteFilter.getRules();
            return rules.concat(cookieBlockFilter.getRules());
        }

        /**
         * Finds exception rule for blocking rule
         *
         * @param {object} blockRule Blocking rule
         * @param {Array} whiteListRules Whitelist rules
         * @return {object} Found whitelist rule or null
         */
        function findWhiteListRule(blockRule, whiteListRules) {

            for (let i = 0; i < whiteListRules.length; i++) {

                const whiteRule = whiteListRules[i];
                const whiteCookieOption = whiteRule.getCookieOption();

                const blockCookieOption = blockRule.getCookieOption();
                const blockCookieName = blockCookieOption.cookieName;
                const blockCookieRegex = blockCookieOption.regex;

                // Matches by cookie name
                if (whiteCookieOption.matches(blockCookieName)) {
                    return whiteRule;
                }

                // Rules have the same regex
                if (blockCookieRegex && whiteCookieOption.regex &&
                    String(blockCookieRegex) === String(whiteCookieOption.regex)) {

                    return whiteRule;
                }

                // Blocking rule with empty $cookie option value will be unblocked by @@$cookie rule
            }

            return null;
        }

        /**
         * Searches for rules matching specified request.
         *
         * @param url           URL
         * @param documentHost  Document Host
         * @param thirdParty    true if request is third-party
         * @param requestType   Request content type
         * @returns             Matching rules
         */
        function findCookieRules(url, documentHost, thirdParty, requestType) {

            const blockRules = cookieBlockFilter.findRules(url, documentHost, thirdParty, requestType);
            if (!blockRules || blockRules.length === 0) {
                return null;
            }

            const whiteRules = cookieWhiteFilter.findRules(url, documentHost, thirdParty, requestType);
            if (!whiteRules || whiteRules.length === 0) {
                return blockRules;
            }

            // Try to find whitelist rule with empty $cookie option => unblock all
            const commonWhiteRule = whiteRules.filter(r => r.getCookieOption().isEmpty())[0];
            if (commonWhiteRule) {
                return [commonWhiteRule];
            }

            const rulesToApply = blockRules.map(blockRule => {
                const whiteRule = findWhiteListRule(blockRule, whiteRules);
                return whiteRule || blockRule;
            });
            return rulesToApply.length > 0 ? rulesToApply : null;
        }

        if (rules) {
            addRules(rules);
        }

        return {
            addRules: addRules,
            addRule: addRule,
            removeRule: removeRule,
            getRules: getRules,
            findCookieRules: findCookieRules
        };
    };

})(advblocker, advblocker.rules);
