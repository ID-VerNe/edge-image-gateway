/**
 * Ambient type declarations for static `.wasm` imports.
 *
 * wrangler's ESM `.wasm` rule turns each `import x from '...foo.wasm'`
 * into a pre-compiled `WebAssembly.Module` at build time. TypeScript has
 * no way to know this, so we declare the module shape here.
 *
 * NOTE: `@jsquash/png/codec/pkg/squoosh_png_bg.wasm` ships a sidecar
 * `.wasm.d.ts` (wasm-bindgen bindings, named exports only) that shadows
 * this wildcard for that exact file — the PNG import in `wasm.ts` uses
 * `@ts-expect-error` to bypass it, since at runtime wrangler still emits
 * a default `WebAssembly.Module`.
 */
declare module '*.wasm' {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
