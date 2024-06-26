// extend the descriptor so we can store the scopeId on it
import { createRequire } from 'node:module'
import type * as compilerSFC from 'vue/compiler-sfc'

declare module 'vue/compiler-sfc' {
  interface SFCDescriptor {
    id: string,
  }
}

export function resolveCompiler(root: string): typeof compilerSFC {
  // resolve from project root first, then fallback to peer dep (if any)
  const compiler = tryRequire('vue/compiler-sfc', root) || tryRequire('vue/compiler-sfc')

  if (!compiler) {
    throw new Error(
      `Failed to resolve vue/compiler-sfc.\n`
        + `@legacy-vue/vite-plugin-vue2 requires vue (>=2.7.0) `
        + `to be present in the dependency tree.`,
    )
  }

  return compiler
}

const $require = createRequire(import.meta.url)

function tryRequire(id: string, from?: string) {
  try {
    return from
      ? $require($require.resolve(id, { paths: [from] }))
      : $require(id)
  } catch {
    // ignore
  }
}
