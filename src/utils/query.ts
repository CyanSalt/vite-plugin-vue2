export interface VueQuery {
  vue?: boolean,
  src?: string,
  type?: 'script' | 'template' | 'style' | 'custom',
  index?: number,
  lang?: string,
  raw?: boolean,
  scoped?: boolean,
}

export function parseVueRequest(id: string): {
  filename: string,
  query: VueQuery,
} {
  const [filename, rawQuery] = id.split(`?`, 2)
  const query = Object.fromEntries(new URLSearchParams(rawQuery)) as VueQuery
  if (query.vue !== undefined) {
    query.vue = true
  }
  if (query.index !== undefined) {
    query.index = Number(query.index)
  }
  if (query.raw !== undefined) {
    query.raw = true
  }
  if (query.scoped !== undefined) {
    query.scoped = true
  }
  return {
    filename,
    query,
  }
}
