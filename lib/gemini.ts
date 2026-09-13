import { GoogleGenerativeAI, SchemaType, Tool } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

export interface SqlGeneration {
  sql: string;
  explanation: string;
}

interface HistoryTurn {
  attemptSql: string;
  error: string;
}

const SQL_TOOL = {
  functionDeclarations: [
    {
      name: 'submit_sql',
      description: 'Submit the final SQLite query that answers the user question.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          sql: {
            type: SchemaType.STRING,
            description:
              'A single valid SQLite SELECT statement (or INSERT/UPDATE/DELETE if explicitly requested). No trailing semicolon, no markdown fences.',
          },
          explanation: {
            type: SchemaType.STRING,
            description: 'One or two sentences explaining what the query does and any assumptions made.',
          },
        },
        required: ['sql', 'explanation'],
      },
    },
  ],
};

export async function generateSql(
  question: string,
  schema: string,
  history: HistoryTurn[] = []
): Promise<SqlGeneration> {
  let systemInstruction = `You are a SQLite expert. Convert the user's natural language question into a single correct SQLite query against the schema below.

SCHEMA:
${schema}

Rules:
- Return exactly one statement via the submit_sql function.
- Default to read-only SELECT unless the user explicitly asks to modify data.
- Note: unit_price_cents is stored in CENTS. Convert to dollars in output columns when the user asks about price/cost/revenue in dollars.
- Dates are stored as TEXT in 'YYYY-MM-DD' format.
- Never invent column or table names that are not in the schema above.`;

  if (history.length > 0) {
    systemInstruction += `\n\nPRIOR FAILED ATTEMPTS (fix these mistakes, do not repeat them):\n`;
    history.forEach((h, i) => {
      systemInstruction += `\nAttempt ${i + 1} SQL:\n${h.attemptSql}\nAttempt ${i + 1} ERROR:\n${h.error}\n`;
    });
  }

  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction,
    tools: [SQL_TOOL],
    toolConfig: { functionCallingConfig: { mode: 'ANY' as any } },
  });

  const result = await model.generateContent(question);
  const call = result.response.functionCalls()?.[0];

  if (!call || call.name !== 'submit_sql') {
    throw new Error('Model did not return a structured SQL function call.');
  }

  const args = call.args as SqlGeneration;
  return { sql: args.sql.trim(), explanation: args.explanation.trim() };
}