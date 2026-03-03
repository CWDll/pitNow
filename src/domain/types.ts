export type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

export interface Reservation {
  id: string;
  userId: string;
  bayId: string;
  startTime: string;
  endTime: string;
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

export interface CreateReservationPayload {
  bayId: string;
  startTime: string;
  endTime: string;
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
