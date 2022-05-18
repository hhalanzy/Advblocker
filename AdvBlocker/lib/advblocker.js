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
 * Global advblocker object
 */
var advblocker = (function () { // eslint-disable-line
    /**
     * This function allows cache property in object. Use with javascript getter.
     *
     * var Object = {
     *
     *      get someProperty(){
     *          return advblocker.lazyGet(Object, 'someProperty', function() {
     *              return calculateSomeProperty();
     *          });
     *      }
     * }
     *
     * @param object Object
     * @param prop Original property name
     * @param calculateFunc Calculation function
     * @returns {*}
     */
    const lazyGet = function (object, prop, calculateFunc) {
        const cachedProp = `_${prop}`;
        if (cachedProp in object) {
            return object[cachedProp];
        }
        const value = calculateFunc.apply(object);
        object[cachedProp] = value;
        return value;
    };

    /**
     * Clear cached property
     * @param object Object
     * @param prop Original property name
     */
    const lazyGetClear = function (object, prop) {
        delete object[`_${prop}`];
    };

    function notImplemented() {
        return false;
    }

    const hitStatsModule = {
        addRuleHit: notImplemented,
        addDomainView: notImplemented,
        cleanup: notImplemented,
    };

    const filteringLogModule = {
        addHttpRequestEvent: notImplemented,
        clearEventsByTabId: notImplemented,
        isOpen: notImplemented,
    };

    const safebrowsingModule = {
        checkSafebrowsingFilter: notImplemented,
    };

    const integrationModule = {
        isSupported: notImplemented,
        isEnabled: notImplemented,
        isIntegrationRequest: notImplemented,
        shouldOverrideReferrer: notImplemented,
    };

    const syncModule = {
        syncService: notImplemented(),
        settingsProvider: notImplemented(),
    };

    return {
        lazyGet,
        lazyGetClear,

        /**
         * Define dummy modules.
         * In case of simple advblocker API, some modules aren't supported
         */
        hitStats: hitStatsModule,
        filteringLog: filteringLogModule,
        safebrowsing: safebrowsingModule,
        integration: integrationModule,
        sync: syncModule,
    };
})();
