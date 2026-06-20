export type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

export type ReservationType = "SELF_SERVICE" | "SHOP_SERVICE";

export type PaymentProvider = "TOSS" | "FAKE";

export type PaymentProviderMode = "FAKE" | "TOSS_TEST" | "TOSS_LIVE";

export type PaymentMethod = "CARD" | "KAKAO_PAY" | "NAVER_PAY" | "TOSS_PAY";

export type PaymentStatus =
  | "READY"
  | "APPROVED"
  | "RESERVATION_CONFIRMED"
  | "SETTLEMENT_CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "REFUNDED";

export type PaymentPurpose = "RESERVATION" | "CHECKOUT_SETTLEMENT";

export interface Reservation {
  id: string;
  userId: string;
  partnerId: string;
  bayId: string;
  reservationType: ReservationType;
  packageId: string | null;
  startTime: string;
  endTime: string;
  reservedEndTime: string;
  status: ReservationStatus;
  totalPrice: number;
  createdAt: string;
}

export interface CheckIn {
  id: string;
  reservationId: string;
  frontImg: string;
  rearImg: string;
  leftImg: string;
  rightImg: string;
  checkedInAt: string;
}

export interface CheckOut {
  id: string;
  reservationId: string;
  basePrice: number;
  extraFee: number;
  helperVerifyRequested: boolean;
  helperVerifyFee: number;
  totalSettlement: number;
  toolCheckCompleted: boolean;
  cleaningCompleted: boolean;
  wasteDisposalCompleted: boolean;
  checkoutPhoto1: string | null;
  checkoutPhoto2: string | null;
  completedAt: string;
}

export interface Review {
  id: string;
  reservationId: string;
  partnerId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  userId: string;
  plateNumber: string;
  model: string;
  year: number;
  typeLabel: string;
  isActive: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  userId: string;
  reservationId: string | null;
  checkoutId: string | null;
  paymentPurpose: PaymentPurpose;
  provider: PaymentProvider;
  providerPaymentKey: string | null;
  providerOrderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  currency: "KRW";
  reservationSnapshot: CreateReservationPayload & {
    amount: number;
  };
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
}

export interface CreateReservationPayload {
  reservationType: ReservationType;
  bayId: string;
  vehicleId: string;
  packageId?: string;
  taskIds?: string[];
  agreeOnlySelectedTasks?: boolean;
  consentMethod?: "CHECKBOX" | "SIGNATURE";
  helperVerifyRequested?: boolean;
  signatureImageUrl?: string;
  startTime: string;
  endTime: string;
}

export interface PreparePaymentPayload {
  method: PaymentMethod;
  reservation: CreateReservationPayload;
}

export interface ConfirmPaymentPayload {
  paymentId: string;
  providerPaymentKey?: string;
  providerOrderId: string;
  amount: number;
}

export interface FailPaymentPayload {
  paymentId: string;
  code?: string;
  message?: string;
  cancelled?: boolean;
}

export interface PrepareSettlementPaymentPayload {
  reservationId: string;
  method: PaymentMethod;
}

export interface CheckInPayload {
  reservationId: string;
  frontImg: string;
  rearImg: string;
  leftImg: string;
  rightImg: string;
}

export interface CheckOutPayload {
  reservationId: string;
  helperVerifyRequested?: boolean;
  toolCheckCompleted?: boolean;
  cleaningCompleted?: boolean;
  wasteDisposalCompleted?: boolean;
  checkoutPhoto1?: string;
  checkoutPhoto2?: string;
}

export interface CreateReviewPayload {
  reservationId: string;
  rating: number;
  comment?: string;
}

export type ApiSuccess<
  T extends Record<string, unknown> = Record<string, never>,
> = {
  success: true;
} & T;

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
