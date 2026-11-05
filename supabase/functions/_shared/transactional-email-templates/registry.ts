/// <reference types="npm:@types/react@18.3.1" />
import type { ComponentType } from 'npm:react@18.3.1'

import { template as orderCreated } from './order-created.tsx'
import { template as orderPaid } from './order-paid.tsx'
import { template as orderInProduction } from './order-in-production.tsx'
import { template as orderShipped } from './order-shipped.tsx'
import { template as orderDelivered } from './order-delivered.tsx'
import { template as reviewRequest } from './review-request.tsx'
import { template as orderCancelled } from './order-cancelled.tsx'
import { template as orderRefunded } from './order-refunded.tsx'
import { template as orderReadyPickup } from './order-ready-pickup.tsx'
import { template as adminNewOrder } from './admin-new-order.tsx'
import { template as adminOrderCancelled } from './admin-order-cancelled.tsx'
import { template as adminContactMessage } from './admin-contact-message.tsx'
import { template as adminCancellationRequested } from './admin-cancellation-requested.tsx'
import { template as customerCancellationReceived } from './customer-cancellation-received.tsx'
import { template as customerCancellationRefused } from './customer-cancellation-refused.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, unknown>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'order-created': orderCreated,
  'order-paid': orderPaid,
  'order-in-production': orderInProduction,
  'order-shipped': orderShipped,
  'order-delivered': orderDelivered,
  'review-request': reviewRequest,
  'order-cancelled': orderCancelled,
  'order-refunded': orderRefunded,
  'order-ready-pickup': orderReadyPickup,
  'admin-new-order': adminNewOrder,
  'admin-order-cancelled': adminOrderCancelled,
  'admin-contact-message': adminContactMessage,
  'admin-cancellation-requested': adminCancellationRequested,
  'customer-cancellation-received': customerCancellationReceived,
  'customer-cancellation-refused': customerCancellationRefused,
}