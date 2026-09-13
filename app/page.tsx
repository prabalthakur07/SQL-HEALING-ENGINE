'use client';

import { useState } from 'react';

interface Attempt {
  attemptNumber: number;
  sql: string;
  explanation: string;
  status: 'success' | 'guardrail_blocked' | 'execution_error';
  error?: string;
  durationMs: number;
}

interface HealingResult {
  success: boolean;
  attempts: Attempt[];
  finalSql?: string;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  question: string;
}

const EXAMPLE_QUESTIONS = [
  'Which customers have spent the most in total, in dollars?',
  'List every order with the customer name, order date, and status.',
  'What is the average order value by region?',
  'Show me products that have never been ordered.',
];

export default function Home() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>🩹 Self-Healing SQL Engine</h1>
      <p className="subtitle">
        Ask a question in plain English. If the generated SQL fails, the agent reads the exact
        error, refactors, and retries automatically — watch the attempt trail below.
      </p>

      <form
        className="query-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <textarea
          placeholder="e.g. Which customers have spent the most, in dollars?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Thinking…' : 'Run'}
        </button>
      </form>

      <div className="options">
        Try:
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            style={{ background: 'transparent', color: '#6ea8fe', padding: '2px 8px', fontWeight: 400 }}
            onClick={() => {
              setQuestion(q);
              submit(q);
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {error && <div className="final-banner fail">⚠ {error}</div>}

      {result && (
        <div>
          <h3 style={{ fontSize: '1rem', color: '#8a90a0', marginBottom: 10 }}>
            Attempt trail ({result.attempts.length} attempt{result.attempts.length > 1 ? 's' : ''})
          </h3>

          {result.attempts.map((a) => (
            <div key={a.attemptNumber} className={`attempt ${a.status}`}>
              <div className="attempt-header">
                <span>Attempt {a.attemptNumber} · {a.durationMs}ms</span>
                <span className={`badge ${a.status}`}>{a.status.replace('_', ' ')}</span>
              </div>
              <pre>{a.sql}</pre>
              <div className="explanation">{a.explanation}</div>
              {a.error && <div className="error-text">↳ {a.error}</div>}
            </div>
          ))}

          {result.success ? (
            <div className="final-banner success">
              ✅ Healed and succeeded after {result.attempts.length} attempt
              {result.attempts.length > 1 ? 's' : ''}. {result.rowCount} row
              {result.rowCount === 1 ? '' : 's'} returned.
            </div>
          ) : (
            <div className="final-banner fail">
              ❌ Could not produce a working query after {result.attempts.length} attempts.
              This is reported honestly rather than faked.
            </div>
          )}

          {result.success && result.rows && result.rows.length > 0 && (
            <table>
              <thead>
                <tr>
                  {Object.keys(result.rows[0]).map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val, j) => (
                      <td key={j}>{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
