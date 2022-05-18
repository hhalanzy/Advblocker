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

/* global advblocker, Redirects */

(function (advblocker, api) {
    'use strict';

    let redirects;

    api.RedirectFilterService = (function RedirectFilterService() {
        function setRedirectSources(rawYaml) {
            redirects = new Redirects(rawYaml);
        }

        function buildRedirectUrl(title) {
            if (!title) {
                return null;
            }

            const redirectSource = redirects.getRedirect(title);
            if (!redirectSource) {
                advblocker.console.debug(`There is no redirect source with title: "${title}"`);
                return null;
            }
            let { content, contentType } = redirectSource;
            // if contentType does not include "base64" string we convert it to base64
            const BASE_64 = 'base64';
            if (!contentType.includes(BASE_64)) {
                content = window.btoa(content);
                contentType = `${contentType};${BASE_64}`;
            }

            return `data:${contentType},${content}`;
        }

        function hasRedirect(title) {
            return !!redirects.getRedirect(title);
        }

        return {
            setRedirectSources,
            hasRedirect,
            buildRedirectUrl,
        };
    })();
})(advblocker, advblocker.rules);
