/// <reference types="vite/client" />

/**
 * Type declarations for Vite-specific imports.
 */

// CSS inline imports — returns CSS as a string
declare module '*.css?inline' {
  const css: string;
  export default css;
}

// Asset imports
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
