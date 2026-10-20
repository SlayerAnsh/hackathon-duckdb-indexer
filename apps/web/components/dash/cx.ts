/** Joins class names, dropping empty values (CSS module keys are undefined under the test runner). */
export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')
