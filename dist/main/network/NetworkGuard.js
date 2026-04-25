"use strict";
/**
 * NetworkGuard — Outbound connection filter for SnapBack.
 *
 * Wraps Node.js http/https modules to enforce an allowlist of permitted
 * outbound endpoints. Any connection attempt to a non-allowlisted URL is
 * blocked and logged to the Local Store audit log.
 *
 * Requirements: 9.2, 9.5
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkGuardBlockedError = exports.NetworkGuard = void 0;
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const node_crypto_1 = require("node:crypto");
/** Google Calendar API hostname — the only permitted external endpoint. */
const GOOGLE_CALENDAR_HOST = 'www.googleapis.com';
const GOOGLE_CALENDAR_PATH_PREFIX = '/calendar/';
class NetworkGuard {
    allowlist = new Set();
    store;
    installed = false;
    // Stash originals so we can restore them
    originalHttpRequest = null;
    originalHttpGet = null;
    originalHttpsRequest = null;
    originalHttpsGet = null;
    constructor(store) {
        this.store = store;
    }
    addAllowedHost(hostname) {
        this.allowlist.add(hostname.toLowerCase());
    }
    removeAllowedHost(hostname) {
        this.allowlist.delete(hostname.toLowerCase());
    }
    isAllowed(url) {
        try {
            const parsed = new URL(url);
            return this.allowlist.has(parsed.hostname.toLowerCase());
        }
        catch {
            // Malformed URL — block it
            return false;
        }
    }
    /**
     * Check whether a hostname (extracted from request options) is permitted.
     * Returns true if allowed, false if blocked.
     */
    checkAndLog(hostname, fullUrl) {
        const host = (hostname ?? '').toLowerCase();
        if (this.allowlist.has(host)) {
            return true;
        }
        // Block and log
        const entry = {
            id: (0, node_crypto_1.randomUUID)(),
            timestamp: Date.now(),
            eventType: 'blocked_connection',
            detail: fullUrl,
        };
        try {
            this.store.insertAuditLog(entry);
        }
        catch {
            // If audit logging itself fails, still block the connection.
            // Swallow the error to avoid crashing the app.
        }
        return false;
    }
    /**
     * Extract hostname and a reconstructed URL string from http.request-style arguments.
     */
    static extractHostInfo(args) {
        const first = args[0];
        if (typeof first === 'string') {
            try {
                const parsed = new URL(first);
                return { hostname: parsed.hostname, url: first };
            }
            catch {
                return { hostname: undefined, url: String(first) };
            }
        }
        if (first instanceof URL) {
            return { hostname: first.hostname, url: first.toString() };
        }
        // Options object
        if (first && typeof first === 'object') {
            const opts = first;
            const hostname = (opts['hostname'] ?? opts['host'] ?? '');
            // Strip port from host if present (e.g. "example.com:443")
            const cleanHost = hostname.split(':')[0];
            const protocol = (opts['protocol'] ?? 'https:');
            const path = (opts['path'] ?? '/');
            const port = opts['port'] ? `:${opts['port']}` : '';
            return {
                hostname: cleanHost,
                url: `${protocol}//${cleanHost}${port}${path}`,
            };
        }
        return { hostname: undefined, url: 'unknown' };
    }
    install() {
        if (this.installed)
            return;
        // Save originals
        this.originalHttpRequest = node_http_1.default.request;
        this.originalHttpGet = node_http_1.default.get;
        this.originalHttpsRequest = node_https_1.default.request;
        this.originalHttpsGet = node_https_1.default.get;
        const guard = this;
        // Patch https.request
        const origHttpsRequest = this.originalHttpsRequest;
        node_https_1.default.request = function patchedHttpsRequest(...args) {
            const { hostname, url } = NetworkGuard.extractHostInfo(args);
            if (!guard.checkAndLog(hostname, url)) {
                throw new NetworkGuardBlockedError(url);
            }
            return origHttpsRequest.apply(node_https_1.default, args);
        };
        // Patch https.get
        const origHttpsGet = this.originalHttpsGet;
        node_https_1.default.get = function patchedHttpsGet(...args) {
            const { hostname, url } = NetworkGuard.extractHostInfo(args);
            if (!guard.checkAndLog(hostname, url)) {
                throw new NetworkGuardBlockedError(url);
            }
            return origHttpsGet.apply(node_https_1.default, args);
        };
        // Patch http.request
        const origHttpRequest = this.originalHttpRequest;
        node_http_1.default.request = function patchedHttpRequest(...args) {
            const { hostname, url } = NetworkGuard.extractHostInfo(args);
            if (!guard.checkAndLog(hostname, url)) {
                throw new NetworkGuardBlockedError(url);
            }
            return origHttpRequest.apply(node_http_1.default, args);
        };
        // Patch http.get
        const origHttpGet = this.originalHttpGet;
        node_http_1.default.get = function patchedHttpGet(...args) {
            const { hostname, url } = NetworkGuard.extractHostInfo(args);
            if (!guard.checkAndLog(hostname, url)) {
                throw new NetworkGuardBlockedError(url);
            }
            return origHttpGet.apply(node_http_1.default, args);
        };
        this.installed = true;
    }
    uninstall() {
        if (!this.installed)
            return;
        if (this.originalHttpRequest)
            node_http_1.default.request = this.originalHttpRequest;
        if (this.originalHttpGet)
            node_http_1.default.get = this.originalHttpGet;
        if (this.originalHttpsRequest)
            node_https_1.default.request = this.originalHttpsRequest;
        if (this.originalHttpsGet)
            node_https_1.default.get = this.originalHttpsGet;
        this.originalHttpRequest = null;
        this.originalHttpGet = null;
        this.originalHttpsRequest = null;
        this.originalHttpsGet = null;
        this.installed = false;
    }
    /** Convenience: authorize Google Calendar API endpoint. */
    authorizeCalendar() {
        this.addAllowedHost(GOOGLE_CALENDAR_HOST);
    }
    /** Convenience: revoke Google Calendar API endpoint. */
    revokeCalendar() {
        this.removeAllowedHost(GOOGLE_CALENDAR_HOST);
    }
    /** Get a copy of the current allowlist (for testing). */
    getAllowlist() {
        return new Set(this.allowlist);
    }
}
exports.NetworkGuard = NetworkGuard;
/**
 * Custom error thrown when the NetworkGuard blocks an outbound connection.
 */
class NetworkGuardBlockedError extends Error {
    blockedUrl;
    constructor(url) {
        super(`NetworkGuard: blocked outbound connection to ${url}`);
        this.name = 'NetworkGuardBlockedError';
        this.blockedUrl = url;
    }
}
exports.NetworkGuardBlockedError = NetworkGuardBlockedError;
