'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchOwnerApi } from '@/lib/apiFetch';

type WidgetRow = {
  id: string;
  type: string;
  title: string;
  config_version: number;
  updated_at: string;
};

export default function WidgetListPage() {
  const [widgetRows, setWidgetRows] = useState<WidgetRow[]>([]);
  const [listError, setListError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOwnerApi('/api/widgets')
      .then((listBody) => {
        setWidgetRows((listBody as { data: WidgetRow[] }).data);
      })
      .catch((loadError: Error) => setListError(loadError.message))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <main>Loading widgets…</main>;

  return (
    <main>
      <h1>Widgets</h1>
      {listError !== '' && <p className="error">{listError}</p>}
      {widgetRows.length === 0 && listError === '' && <p>No widgets yet.</p>}
      {widgetRows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Config version</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {widgetRows.map((widgetRow) => (
              <tr key={widgetRow.id}>
                <td>
                  <Link href={`/widgets/${widgetRow.id}`}>{widgetRow.title}</Link>
                </td>
                <td>{widgetRow.type}</td>
                <td>{widgetRow.config_version}</td>
                <td>{new Date(widgetRow.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
