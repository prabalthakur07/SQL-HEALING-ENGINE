export interface SqlGeneration {
  sql: string;
  explanation: string;
}

export interface HistoryTurn {
  attemptSql: string;
  error: string;
}

export interface LlmProvider {
  generateSql(question: string, schema: string, history: HistoryTurn[]): Promise<SqlGeneration>;
}