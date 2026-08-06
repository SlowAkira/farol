// Uma linha por evento, e nada alem de JSON nela: o coletor de log da Vercel
// quebra a saida por quebra de linha, entao objeto impresso em varias linhas
// chega la como varios registros truncados que nenhuma query junta de volta.
export function formatLogLine(event: string, fields: Record<string, unknown>): string {
  return JSON.stringify({ event, ...fields });
}

export function logJson(event: string, fields: Record<string, unknown>): void {
  console.log(formatLogLine(event, fields));
}
