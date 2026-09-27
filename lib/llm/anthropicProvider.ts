import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider, SqlGeneration, HistoryTurn } from './provider';
import { withTransientRetry } from './retry';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const SQL_TOOL = {
  name: 'submit_sql',
  description: 'Submit the final SQLite query that answers the user question.',
  input_schema: {
    type: 'object' as const,
    properties: {
      sql: {
        type: 'string',
        description:
          'A single valid SQLite SELECT statement (or INSERT/UPDATE/DELETE if explicitly requested). No trailing semicolon needed, no markdown fences.',
      },
      explanation: {
        type: 'string',
        description: 'One or two sentences explaining what the query does and any assumptions made about the schema.',
      },
    },
    required: ['sql', 'explanation'],
  },
};

function buildSystemPrompt(schema: string, history: HistoryTurn[]): string {
  let prompt = `You are a SQLite expert. Convert the user's natural language question into a single correct SQLite query against the schema below.

SCHEMA:
${schema}

Rules:
- Return exactly one statement via the submit_sql tool.
- Default to read-only SELECT unless the user explicitly asks to modify data.
- Note: unit_price_cents is stored in CENTS. Convert to dollars in output columns when the user asks about price/cost/revenue in dollars.
- Dates are stored as TEXT in 'YYYY-MM-DD' format.
- Never invent column or table names that are not in the schema above.`;

  if (history.length > 0) {
    prompt += `\n\nPRIOR FAILED ATTEMPTS (fix these mistakes, do not repeat them):\n`;
    history.forEach((h, i) => {
      prompt += `\nAttempt ${i + 1} SQL:\n${h.attemptSql}\nAttempt ${i + 1} ERROR:\n${h.error}\n`;
    });
  }
  return prompt;
}

export class AnthropicProvider implements LlmProvider {
  async generateSql(question: string, schema: string, history: HistoryTurn[] = []): Promise<SqlGeneration> {
    return withTransientRetry(
      async () => {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: buildSystemPrompt(schema, history),
          tools: [SQL_TOOL],
          tool_choice: { type: 'tool', name: 'submit_sql' },
          messages: [{ role: 'user', content: question }],
        });

        const toolUse = response.content.find((b) => b.type === 'tool_use');
        if (!toolUse || toolUse.type !== 'tool_use') {
          throw new Error('Model did not return a structured SQL tool call.');
        }

        const input = toolUse.input as SqlGeneration;
        return { sql: input.sql.trim(), explanation: input.explanation.trim() };
      },
      { label: 'anthropic' }
    );
  }
}