import fs from 'node:fs'
// eslint-disable-next-line import-x/no-duplicates
import type * as compilerSFC from '@legacy-vue/compiler-sfc'
import type {
  SFCBlock,
  SFCScriptCompileOptions,
  SFCStyleCompileOptions,
  SFCTemplateCompileOptions,
  // eslint-disable-next-line import-x/no-duplicates
} from '@legacy-vue/compiler-sfc'
import type { RawSourceMap } from 'source-map'
import type { Plugin, ViteDevServer } from 'vite'
import { createFilter } from 'vite'

import { resolveCompiler } from './compiler'
import { handleHotUpdate } from './handle-hot-update'
import { transformMain } from './main'
import { getResolvedScript } from './script'
import { transformStyle } from './style'
import { transformTemplateAsModule } from './template'
import { NORMALIZER_ID, normalizerCode } from './utils/component-normalizer'
import { getDescriptor, getSrcDescriptor } from './utils/descriptor-cache'
import { HMR_RUNTIME_ID, hmrRuntimeCode } from './utils/hmr-runtime'
import { parseVueRequest } from './utils/query'

export { parseVueRequest } from './utils/query'
export type { VueQuery } from './utils/query'

export interface Options {
  include?: string | RegExp | (string | RegExp)[],
  exclude?: string | RegExp | (string | RegExp)[],

  isProduction?: boolean,

  // options to pass on to vue/compiler-sfc
  script?: Partial<Pick<SFCScriptCompileOptions, 'babelParserPlugins'>>,
  template?: Partial<
    Pick<
      SFCTemplateCompileOptions,
      | 'compiler'
      | 'compilerOptions'
      | 'preprocessOptions'
      | 'transpileOptions'
      | 'transformAssetUrls'
      | 'transformAssetUrlsOptions'
    >
  >,
  style?: Partial<Pick<SFCStyleCompileOptions, 'trim'>>,

  // customElement?: boolean | string | RegExp | (string | RegExp)[]
  // reactivityTransform?: boolean | string | RegExp | (string | RegExp)[]
  compiler?: typeof compilerSFC,
}

export interface ResolvedOptions extends Options {
  compiler: typeof compilerSFC,
  root: string,
  sourceMap: boolean,
  cssDevSourcemap: boolean,
  devServer?: ViteDevServer,
  devToolsEnabled?: boolean,
}

export default function vuePlugin(rawOptions: Options = {}): Plugin {
  const {
    include = /\.vue$/,
    exclude,
    // customElement = /\.ce\.vue$/,
    // reactivityTransform = false
  } = rawOptions

  const filter = createFilter(include, exclude)

  let options: ResolvedOptions = {
    isProduction: process.env.NODE_ENV === 'production',
    compiler: null as never, // to be set in buildStart
    ...rawOptions,
    include,
    exclude,
    // customElement,
    // reactivityTransform,
    root: process.cwd(),
    sourceMap: true,
    cssDevSourcemap: false,
    devToolsEnabled: process.env.NODE_ENV !== 'production',
  }

  return {
    name: 'vite:vue2',

    handleHotUpdate(ctx) {
      if (!filter(ctx.file)) {
        return
      }
      return handleHotUpdate(ctx, options)
    },

    configResolved(config) {
      options = {
        ...options,
        root: config.root,
        isProduction: config.isProduction,
        sourceMap: config.command === 'build' ? Boolean(config.build.sourcemap) : true,
        cssDevSourcemap: config.css.devSourcemap ?? false,
        devToolsEnabled: !config.isProduction,
      }
      if (!config.resolve.alias.some(({ find }) => find === 'vue')) {
        config.resolve.alias.push({
          find: 'vue',
          replacement: 'vue/dist/vue.runtime.esm.js',
        })
      }
    },

    configureServer(server) {
      options.devServer = server
    },

    buildStart() {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      options.compiler = options.compiler || resolveCompiler(options.root)
    },

    async resolveId(id) {
      // component export helper
      if (id === NORMALIZER_ID || id === HMR_RUNTIME_ID) {
        return id
      }
      // serve sub-part requests (*?vue) as virtual modules
      if (parseVueRequest(id).query.vue) {
        return id
      }
    },

    load(id, opt) {
      const ssr = opt?.ssr === true
      if (id === NORMALIZER_ID) {
        return normalizerCode
      }
      if (id === HMR_RUNTIME_ID) {
        return hmrRuntimeCode
      }

      const { filename, query } = parseVueRequest(id)
      // select corresponding block for sub-part virtual modules
      if (query.vue) {
        if (query.src) {
          return fs.readFileSync(filename, 'utf-8')
        }
        const descriptor = getDescriptor(filename, options)!
        let block: SFCBlock | null | undefined
        if (query.type === 'script') {
          // handle <scrip> + <script setup> merge via compileScript()
          block = getResolvedScript(descriptor, ssr)
        } else if (query.type === 'template') {
          block = descriptor.template!
        } else if (query.type === 'style') {
          block = descriptor.styles[query.index!]
        } else if (query.index !== undefined) {
          block = descriptor.customBlocks[query.index]
        }
        if (block) {
          return {
            code: block.content,
            map: block.map as RawSourceMap | undefined,
          }
        }
      }
    },

    async transform(code, id, opt) {
      const ssr = opt?.ssr === true
      const { filename, query } = parseVueRequest(id)
      if (query.raw) {
        return
      }
      if (!filter(filename) && !query.vue) {
        // if (
        //   !query.vue &&
        //   refTransformFilter(filename) &&
        //   options.compiler.shouldTransformRef(code)
        // ) {
        //   return options.compiler.transformRef(code, {
        //     filename,
        //     sourceMap: true
        //   })
        // }
        return
      }

      if (!query.vue) {
        // main request
        return transformMain(code, filename, options, this, ssr)
      } else {
        // sub block request
        const descriptor = query.src
          ? getSrcDescriptor(filename, query)
          : getDescriptor(filename, options)!

        if (query.type === 'template') {
          return {
            code: await transformTemplateAsModule(
              code,
              descriptor,
              options,
              this,
              ssr,
            ),
            map: {
              mappings: '',
            },
          }
        } else if (query.type === 'style') {
          return transformStyle(
            code,
            descriptor,
            Number(query.index),
            options,
            this,
            filename,
          )
        }
      }
    },
  }
}
