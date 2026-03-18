export type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

export type ReservationType = "SELF_SERVICE" | "SHOP_SERVICE";

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
  extraFee: number;
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

export type CreateReservationPayload =
  | {
      reservationType: "SELF_SERVICE";
      partnerId: string;
      bayId: string;
      startTime: string;
      durationMinutes: number;
    }
  | {
      reservationType: "SHOP_SERVICE";
      partnerId: string;
      packageId: string;
      startTime: string;
    };

export interface CheckInPayload {
  reservationId: string;
  frontImg: string;
  rearImg: string;
  leftImg: string;
  rightImg: string;
}

export interface CheckOutPayload {
  reservationId: string;
}

export interface CreateReviewPayload {
  reservationId: string;
  rating: number;
  comment?: string;
}

export type ApiSuccess<T extends Record<string, unknown> = Record<string, never>> = {
  success: true;
} & T;

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
