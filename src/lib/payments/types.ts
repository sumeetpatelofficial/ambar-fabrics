/** What the shop needs from a payment provider. Razorpay is the real one; the mock is for development and tests. */
export type GatewayName = "razorpay" | "mock"

export type GatewayPayment = {
  id: string
  gatewayOrderId: string
  amountPaise: number
  status: "created" | "authorized" | "captured" | "failed" | "refunded"
}

export interface PaymentGateway {
  readonly name: GatewayName
  /** The public key the browser needs to open the payment window. */
  readonly publicKey: string
  createOrder(input: {
    amountPaise: number
    receipt: string
    notes?: Record<string, string>
  }): Promise<{ gatewayOrderId: string }>
  /** Checks the signature the browser got back after paying. Never trust the browser without it. */
  verifyPaymentSignature(input: {
    gatewayOrderId: string
    paymentId: string
    signature: string
  }): boolean
  verifyWebhookSignature(rawBody: string, signature: string): boolean
  fetchPayment(paymentId: string): Promise<GatewayPayment>
  /** Payments attempted against an order, used to find a payment whose webhook never arrived. */
  fetchOrderPayments(gatewayOrderId: string): Promise<GatewayPayment[]>
  refund(input: {
    paymentId: string
    amountPaise: number
    idempotencyKey: string
    notes?: Record<string, string>
  }): Promise<{ gatewayRefundId: string; status: "processed" | "pending" }>
}
