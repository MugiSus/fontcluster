declare module '@fontsource-variable/*' {
  const content: string;
  export default content;
}

// Vite's own `*.woff` wildcard does not cover specifiers carrying the
// `?inline` suffix (the pattern must match the end of the string).
declare module '*.woff?inline' {
  /** The asset inlined as a base64 `data:` URI. */
  const dataUri: string;
  export default dataUri;
}
