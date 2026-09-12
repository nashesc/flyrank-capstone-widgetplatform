import { countWidgetsForTenant, countSubmissionsForTenant, summarizeWidgetForTenant } from './dashboard.repository.js';

export async function getDashboardStats({ tenantId, widgetId }) {
  if (widgetId) {
    const summary = await summarizeWidgetForTenant({ widgetId, tenantId });
    if (!summary) return { outcome: 'WIDGET_NOT_FOUND' };
    return { outcome: 'FOUND', stats: summary };
  }
  const [totalWidgets, totalSubmissions] = await Promise.all([
    countWidgetsForTenant({ tenantId }),
    countSubmissionsForTenant({ tenantId }),
  ]);
  return { outcome: 'FOUND', stats: { totalWidgets, totalSubmissions } };
}
