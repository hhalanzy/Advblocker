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

/* global advblockerContent */

(function (advblocker, self) {
    'use strict';

    /**
     * https://bugs.chromium.org/p/project-zero/issues/detail?id=1225&desc=6
     * Page script can inject global variables into the DOM,
     * so content script isolation doesn't work as expected
     * So we have to make additional check before accessing a global variable.
     */
    function isDefined(property) {
        return Object.prototype.hasOwnProperty.call(self, property);
    }

    const browserApi = isDefined('browser') && self.browser !== undefined ? self.browser : self.chrome;

    advblocker.i18n = browserApi.i18n;

    advblocker.runtimeImpl = (function () {
        const onMessage = (function () {
            if (browserApi.runtime && browserApi.runtime.onMessage) {
                // Chromium, Edge, Firefox WebExtensions
                return browserApi.runtime.onMessage;
            }
            // Old Chromium
            return browserApi.extension.onMessage || browserApi.extension.onRequest;
        })();

        const sendMessage = (function () {
            if (browserApi.runtime && browserApi.runtime.sendMessage) {
                // Chromium, Edge, Firefox WebExtensions
                return browserApi.runtime.sendMessage;
            }
            // Old Chromium
            return browserApi.extension.sendMessage || browserApi.extension.sendRequest;
        })();

        return {
            onMessage,
            sendMessage,
        };
    })();
})(typeof advblockerContent !== 'undefined' ? advblockerContent : advblocker, this); // jshint ignore:line
