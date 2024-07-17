// extend the descriptor so we can store the scopeId on it
import * as compilerSFC from '@legacy-vue/compiler-sfc'

declare module '@legacy-vue/compiler-sfc' {
  interface SFCDescriptor {
    id: string,
  }
}

export function resolveCompiler(root: string): typeof compilerSFC {
  return compilerSFC
}
