import { insertWidget, listWidgetsByTenant, findWidgetByIdForTenant, patchWidgetForTenant, softDeleteWidgetForTenant } from './widgets.repository.js';

export function createWidgetForTenant({ tenantId, validatedBody }) {
   return insertWidget({
      tenantId,
      type: validatedBody.type,
      title: validatedBody.title,
      description: validatedBody.description,
      widgetFields: validatedBody.fields,
      buttonText: validatedBody.button_text,
      displayOptions: validatedBody.display_options,
   });
}

export function listWidgetsForTenant({ tenantId, listLimit, cursorWidgetId }) {
   return listWidgetsByTenant({ tenantId, listLimit, cursorWidgetId });
}

export function getWidgetForTenant({ widgetId, tenantId }) {
   return findWidgetByIdForTenant({ widgetId, tenantId });
}

export function updateWidgetForTenant({ widgetId, tenantId, patchValues }) {
   return patchWidgetForTenant({ widgetId, tenantId, patchValues });
}

export function removeWidgetForTenant({ widgetId, tenantId }) {
   return softDeleteWidgetForTenant({ widgetId, tenantId });
}