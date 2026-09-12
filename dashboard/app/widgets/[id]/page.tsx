'use client';

import { use, useEffect, useState } from 'react';
import { fetchOwnerApi } from '@/lib/apiFetch';

type SubmissionRow = {
  id: string;
  payload: Record<string, unknown>;
  geo_country: string | null;
  geo_city: string | null;
  created_at: string;
};

export default function WidgetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: widgetId } = use(params);
  const [submissionRows, setSubmissionRows] = useState<SubmissionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [embedSnippet, setEmbedSnippet] = useState('');
  const [detailError, setDetailError] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy');

  async function loadSubmissions(cursor: string | null) {
    const queryString = cursor !== null ? `?limit=20&cursor=${cursor}` : '?limit=20';
    const listBody = (await fetchOwnerApi(
      `/api/widgets/${widgetId}/submissions${queryString}`
    )) as { data: SubmissionRow[]; nextCursor: string | null };
    setSubmissionRows((previousRows) =>
      cursor === null ? listBody.data : [...previousRows, ...listBody.data]
    );
    setNextCursor(listBody.nextCursor);
  }

  useEffect(() => {
    Promise.all([
      fetchOwnerApi(`/api/widgets/${widgetId}/embed`) as Promise<{ snippet: string }>,
      loadSubmissions(null),
    ])
      .then(([embedBody]) => setEmbedSnippet(embedBody.snippet))
      .catch((loadError: Error) => setDetailError(loadError.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetId]);

  async function copySnippet() {
    await navigator.clipboard.writeText(embedSnippet);
    setCopyLabel('Copied');
  }

  return (
    <main>
      <h1>Widget submissions</h1>
      {detailError !== '' && <p className="error">{detailError}</p>}
      {embedSnippet !== '' && (
        <section>
          <h2>Embed snippet</h2>
          <code>{embedSnippet}</code>
          <button type="button" onClick={copySnippet}>
            {copyLabel}
          </button>
        </section>
      )}
      <table>
        <thead>
          <tr>
            <th>Submitted</th>
            <th>Payload</th>
            <th>Geo</th>
          </tr>
        </thead>
        <tbody>
          {submissionRows.map((submissionRow) => (
            <tr key={submissionRow.id}>
              <td>{new Date(submissionRow.created_at).toLocaleString()}</td>
              <td>{JSON.stringify(submissionRow.payload)}</td>
              <td>
                {[submissionRow.geo_city, submissionRow.geo_country]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {nextCursor !== null && (
        <button type="button" onClick={() => loadSubmissions(nextCursor)}>
          Load more
        </button>
      )}
    </main>
  );
}
