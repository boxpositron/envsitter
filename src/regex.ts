// RegExp#test advances lastIndex for global/sticky patterns, which makes repeated calls alternate.
export function regexTest(regex: RegExp, input: string): boolean {
  if (regex.global || regex.sticky) regex.lastIndex = 0;
  return regex.test(input);
}
