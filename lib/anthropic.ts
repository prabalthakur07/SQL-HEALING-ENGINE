import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export interface SqlGeneration {
  sql: string;
  explanation: string;
}

const SQL_TOOL = {
  name: 'submit_sql',
  description: 'Submit the final SQLite query that answers the user question.',
  input_schema: {
    type: 'object' as const,
    properties: {
      sql: {
        type: 'string',
        description: 'A single valid SQLite SELECT statement (or INSERT/UPDATE/DELETE if explicitly requested). No trailing semicolon needed, no markdown fences.',
      },
      explanation: {
        type: 'string',
        description: 'One or two sentences explaining what the query does and any assumptions made about the schema.',
      },
    },
    required: ['sql', 'explanation'],
  },
};

interface HistoryTurn {
  attemptSql: string;
  error: string;
}

/**
 * Generates SQL for a natural-language question. On retry, `history`
 * contains prior failed attempts + their exact error messages, which is
 * the core feedback signal that drives the self-healing loop.
 */
export async function generateSql(
  question: string,
  schema: string,
  history: HistoryTurn[] = []
): Promise<SqlGeneration> {
  let systemPrompt = `You are a SQLite expert. Convert the user's natural language question into a single correct SQLite query against the schema below.

SCHEMA:
${schema}

Rules:
- Return exactly one statement via the submit_sql tool.
- Default to read-only SELECT unless the user explicitly asks to modify data.
- Note: unit_price_cents is stored in CENTS. Convert to dollars in output columns when the user asks about price/cost/revenue in dollars.
- Dates are stored as TEXT in 'YYYY-MM-DD' format.
- Never invent column or table names that are not in the schema above.`;

  if (history.length > 0) {
    systemPrompt += `\n\nPRIOR FAILED ATTEMPTS (fix these mistakes, do not repeat them):\n`;
    history.forEach((h, i) => {
      systemPrompt += `\nAttempt ${i + 1} SQL:\n${h.attemptSql}\nAttempt ${i + 1} ERROR:\n${h.error}\n`;
    });
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
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
}
