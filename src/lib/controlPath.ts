/**
 * Operator desks live under `/control/...`.
 * Exact `/control` is the public player join page (code entry only).
 */
export function isControlDeskPath(pathname = window.location.pathname) {
  return pathname.startsWith('/control/')
}
