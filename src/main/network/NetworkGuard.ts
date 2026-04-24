/**
 * NetworkGuard — Outbound connection filter for SnapBack.
 *
 * Wraps Node.js http/https modules to enforce an allowlist of permitted
 * outbound endpoints. Any connection attempt to a non-allowlisted URL is
 * blocked and logged to the Local Store audit log.
 *
 * Requirements: 9.2, 9.5
 */

import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import type { ILocalStore, AuditLogEntry } from '../types.js';

/** Google Calendar API hostname — the only permitted external endpoint. */
const GOOGLE_CALENDAR_HOST = 'www.googleapis.com';
const GOOGLE_CALENDAR_PATH_PREFIX = '/calendar/';

export interface INetworkGuard {
  /** Add a hostname to the allowlist (called when Calendar Sync is authorized). */
  addAllowedHost(hostname: string): void;
  /** Remove a hostname from the allowlist (called on Calendar Sync revocation). */
  removeAllowedHost(hostname: string): void;
  /** Check whether a given URL would be allowed through the guard. */
  isAllowed(url: string): boolean;
  /** Install monkey-patches on http/https request methods. */
  install(): void;
  /** Remove monkey-patches, restoring original http/https request methods. */
  uninstall(): void;
}

export class NetworkGuard implements INetworkGuard {
  private allowlist: Set<string> = new Set();
  private store: ILocalStore;
  private installed = false;

  // Stash originals so we can restore them
  private originalHttpRequest: typeof http.request | null = null;
  private originalHttpGet: typeof http.get | null = null;
  private originalHttpsRequest: typeof https.request | null = null;
  private originalHttpsGet: typeof https.get | null = null;

  constructor(store: ILocalStore) {
    this.store = store;
  }

  addAllowedHost(hostname: string): void {
    this.allowlist.add(hostname.toLowerCase());
  }

  removeAllowedHost(hostname: string): void {
    this.allowlist.delete(hostname.toLowerCase());
  }

  isAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      return this.allowlist.has(parsed.hostname.toLowerCase());
    } catch {
      // Malformed URL — block it
      return false;
    }
  }

  /**
   * Check whether a hostname (extracted from request options) is permitted.
   * Returns true if allowed, false if blocked.
   */
  private checkAndLog(hostname: string | undefined, fullUrl: string): boolean {
    const host = (hostname ?? '').toLowerCase();
    if (this.allowlist.has(host)) {
      return true;
    }

    // Block and log
    const entry: AuditLogEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      eventType: 'blocked_connection',
      detail: fullUrl,
    };

    try {
      this.store.insertAuditLog(entry);
    } catch {
      // If audit logging itself fails, still block the connection.
      // Swallow the error to avoid crashing the app.
    }

    return false;
  }

  /**
   * Extract hostname and a reconstructed URL string from http.request-style arguments.
   */
  private static extractHostInfo(
    args: unknown[]
  ): { hostname: string | undefined; url: string } {
    const first = args[0];

    if (typeof first === 'string') {
      try {
        const parsed = new URL(first);
        return { hostname: parsed.hostname, url: first };
      } catch {
        return { hostname: undefined, url: String(first) };
      }
    }

    if (first instanceof URL) {
      return { hostname: first.hostname, url: first.toString() };
    }

    // Options object
    if (first && typeof first === 'object') {
      const opts = first as Record<string, unknown>;
      const hostname = (opts['hostname'] ?? opts['host'] ?? '') as string;
      // Strip port from host if present (e.g. "example.com:443")
      const cleanHost = hostname.split(':')[0];
      const protocol = (opts['protocol'] ?? 'https:') as string;
      const path = (opts['path'] ?? '/') as string;
      const port = opts['port'] ? `:${opts['port']}` : '';
      return {
        hostname: cleanHost,
        url: `${protocol}//${cleanHost}${port}${path}`,
      };
    }

    return { hostname: undefined, url: 'unknown' };
  }

  install(): void {
    if (this.installed) return;

    // Save originals
    this.originalHttpRequest = http.request;
    this.originalHttpGet = http.get;
    this.originalHttpsRequest = https.request;
    this.originalHttpsGet = https.get;

    const guard = this;

    // Patch https.request
    const origHttpsRequest = this.originalHttpsRequest;
    (https as any).request = function patchedHttpsRequest(...args: any[]) {
      const { hostname, url } = NetworkGuard.extractHostInfo(args);
      if (!guard.checkAndLog(hostname, url)) {
        throw new NetworkGuardBlockedError(url);
      }
      return origHttpsRequest.apply(https, args as any);
    };

    // Patch https.get
    const origHttpsGet = this.originalHttpsGet;
    (https as any).get = function patchedHttpsGet(...args: any[]) {
      const { hostname, url } = NetworkGuard.extractHostInfo(args);
      if (!guard.checkAndLog(hostname, url)) {
        throw new NetworkGuardBlockedError(url);
      }
      return origHttpsGet.apply(https, args as any);
    };

    // Patch http.request
    const origHttpRequest = this.originalHttpRequest;
    (http as any).request = function patchedHttpRequest(...args: any[]) {
      const { hostname, url } = NetworkGuard.extractHostInfo(args);
      if (!guard.checkAndLog(hostname, url)) {
        throw new NetworkGuardBlockedError(url);
      }
      return origHttpRequest.apply(http, args as any);
    };

    // Patch http.get
    const origHttpGet = this.originalHttpGet;
    (http as any).get = function patchedHttpGet(...args: any[]) {
      const { hostname, url } = NetworkGuard.extractHostInfo(args);
      if (!guard.checkAndLog(hostname, url)) {
        throw new NetworkGuardBlockedError(url);
      }
      return origHttpGet.apply(http, args as any);
    };

    this.installed = true;
  }

  uninstall(): void {
    if (!this.installed) return;

    if (this.originalHttpRequest) (http as any).request = this.originalHttpRequest;
    if (this.originalHttpGet) (http as any).get = this.originalHttpGet;
    if (this.originalHttpsRequest) (https as any).request = this.originalHttpsRequest;
    if (this.originalHttpsGet) (https as any).get = this.originalHttpsGet;

    this.originalHttpRequest = null;
    this.originalHttpGet = null;
    this.originalHttpsRequest = null;
    this.originalHttpsGet = null;
    this.installed = false;
  }

  /** Convenience: authorize Google Calendar API endpoint. */
  authorizeCalendar(): void {
    this.addAllowedHost(GOOGLE_CALENDAR_HOST);
  }

  /** Convenience: revoke Google Calendar API endpoint. */
  revokeCalendar(): void {
    this.removeAllowedHost(GOOGLE_CALENDAR_HOST);
  }

  /** Get a copy of the current allowlist (for testing). */
  getAllowlist(): ReadonlySet<string> {
    return new Set(this.allowlist);
  }
}

/**
 * Custom error thrown when the NetworkGuard blocks an outbound connection.
 */
export class NetworkGuardBlockedError extends Error {
  public readonly blockedUrl: string;

  constructor(url: string) {
    super(`NetworkGuard: blocked outbound connection to ${url}`);
    this.name = 'NetworkGuardBlockedError';
    this.blockedUrl = url;
  }
}
