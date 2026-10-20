/** Joins class names, dropping empty values. Under bun test a CSS module import is a plain string, so
 * its keys are undefined; avoid class names that are String.prototype members (sub, search, link, big,
 * small, bold, length...), which resolve to functions or numbers there and make React warn. */
export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')
