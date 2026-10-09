import axios from "axios";
import type {
  Doctor,
  Slot,
  Appointment,
  ChatResponse,
  EvaluationSummary,
  BeforeAfterResponse,
  TokenResponse,
  UserResponse,
  DoctorMeResponse,
  Review,
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// Attach Authorization bearer token from localStorage if present
apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("clinicpilot_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ── Authentication API ───────────────────────────────────────────────────────
export async function authRegister(payload: {
  email: string;
  password: string;
  role: "DOCTOR" | "PATIENT";
  name: string;
  specialty?: string;
  location?: string;
  qualification?: string;
  experience_years?: number;
  bio?: string;
  consultation_fee?: number;
  phone?: string;
}): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>("/auth/register", payload);
  return res.data;
}

export async function authLogin(payload: {
  email: string;
  password: string;
}): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>("/auth/login", payload);
  return res.data;
}

export async function authMe(): Promise<UserResponse> {
  const res = await apiClient.get<UserResponse>("/auth/me");
  return res.data;
}

// ── Doctor Portal API ────────────────────────────────────────────────────────
export async function getDoctorMe(): Promise<DoctorMeResponse> {
  const res = await apiClient.get<DoctorMeResponse>("/doctors/me");
  return res.data;
}

export async function updateDoctorMe(payload: {
  name?: string;
  specialty?: string;
  location?: string;
  qualification?: string;
  experience_years?: number;
  bio?: string;
  consultation_fee?: number;
}): Promise<Doctor> {
  const res = await apiClient.patch<Doctor>("/doctors/me", payload);
  return res.data;
}

export async function getDoctorAllAvailability(date?: string): Promise<Slot[]> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await apiClient.get<Slot[]>(`/doctors/me/availability${query}`);
  return res.data;
}

export async function createDoctorAvailability(
  date: string,
  slots: string[]
): Promise<Slot[]> {
  const res = await apiClient.post<Slot[]>("/doctors/me/availability", {
    date,
    slots,
  });
  return res.data;
}

export async function deleteDoctorAvailability(slotId: number | string): Promise<{ status: string; message: string }> {
  const res = await apiClient.delete<{ status: string; message: string }>(
    `/doctors/me/availability/${slotId}`
  );
  return res.data;
}

export async function getDoctorAppointments(): Promise<Appointment[]> {
  const res = await apiClient.get<Appointment[]>("/doctors/me/appointments");
  return res.data;
}

// ── Public Doctors API ─────────────────────────────────────────────────────
export async function getDoctors(params?: {
  specialty?: string;
  location?: string;
}): Promise<Doctor[]> {
  const query = new URLSearchParams();
  if (params?.specialty) query.append("specialty", params.specialty);
  if (params?.location) query.append("location", params.location);

  const res = await apiClient.get<Doctor[]>(
    `/doctors${query.toString() ? `?${query.toString()}` : ""}`
  );
  return res.data;
}

export async function getDoctorById(id: number): Promise<Doctor> {
  const res = await apiClient.get<Doctor>(`/doctors/${id}`);
  return res.data;
}

export async function getDoctorSlots(
  id: number,
  date?: string,
  includePast: boolean = true
): Promise<Slot[]> {
  const params = new URLSearchParams();
  if (date) params.append("date", date);
  if (includePast) params.append("include_past", "true");
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await apiClient.get<Slot[]>(`/doctors/${id}/slots${query}`);
  return res.data;
}

// ── Appointments API ────────────────────────────────────────────────────────
export async function getAppointments(
  patientId: string,
  status?: string
): Promise<Appointment[]> {
  const query = new URLSearchParams({ patient_id: patientId });
  if (status) query.append("status", status);

  const res = await apiClient.get<Appointment[]>(`/appointments?${query.toString()}`);
  return res.data;
}

export async function bookAppointment(params: {
  patient_id: string;
  doctor_id: number;
  date: string;
  time: string;
}): Promise<Appointment> {
  const res = await apiClient.post<Appointment>("/appointments", params);
  return res.data;
}

export async function rescheduleAppointment(params: {
  appointment_id: number;
  patient_id: string;
  new_date: string;
  new_time: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.patch<{ success: boolean; message: string }>(
    `/appointments/${params.appointment_id}`,
    {
      patient_id: params.patient_id,
      new_date: params.new_date,
      new_time: params.new_time,
    }
  );
  return res.data;
}

export async function cancelAppointment(params: {
  appointment_id: number;
  patient_id: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.delete<{ success: boolean; message: string }>(
    `/appointments/${params.appointment_id}?patient_id=${encodeURIComponent(
      params.patient_id
    )}`
  );
  return res.data;
}

// ── Chat API ────────────────────────────────────────────────────────────────
export async function sendChatMessage(params: {
  patient_id: string;
  message: string;
  session_id?: string;
  language?: string;
}): Promise<ChatResponse> {
  const res = await apiClient.post<ChatResponse>("/chat", params, {
    timeout: 45000,
  });
  return res.data;
}

// ── Evaluation API ──────────────────────────────────────────────────────────
export async function getEvaluationSummary(): Promise<EvaluationSummary> {
  const res = await apiClient.get<EvaluationSummary>("/evaluation/summary");
  return res.data;
}

export async function getBeforeAfterReport(): Promise<BeforeAfterResponse> {
  const res = await apiClient.get<BeforeAfterResponse>("/evaluation/before-after");
  return res.data;
}

export async function triggerEvaluationRun(): Promise<{ status: string; message: string }> {
  const res = await apiClient.post<{ status: string; message: string }>("/evaluation/run");
  return res.data;
}

// ── Payment API ─────────────────────────────────────────────────────────────

export interface HoldSlotResponse {
  appointment_id: number;
  slot_id: number;
  held_until: string;
  amount: number;       // in paise
  doctor_name: string;
  doctor_id: number;
  date: string;
  time: string;
}

export interface CreateOrderResponse {
  razorpay_order_id: string;
  amount: number;       // in paise
  currency: string;
  key_id: string;
  appointment_id: number;
  payment_id: number;
}

export interface PaymentStatusResponse {
  appointment_id: number;
  appointment_status: string;
  payment_id: number | null;
  status: string;       // PENDING | PAID | FAILED | CANCELLED | NO_PAYMENT
  amount: number | null;
  paid_at: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
}

export async function holdSlot(params: {
  patient_id: string;
  doctor_id: number;
  date: string;
  time: string;
}): Promise<HoldSlotResponse> {
  const res = await apiClient.post<HoldSlotResponse>("/payments/hold-slot", params);
  return res.data;
}

export async function createPaymentOrder(params: {
  appointment_id: number;
  patient_id: string;
}): Promise<CreateOrderResponse> {
  const res = await apiClient.post<CreateOrderResponse>("/payments/create-order", params);
  return res.data;
}

export async function verifyPaymentFrontend(params: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  appointment_id: number;
  patient_id: string;
}): Promise<PaymentStatusResponse> {
  const res = await apiClient.post<PaymentStatusResponse>("/payments/verify", params);
  return res.data;
}

export async function getPaymentStatus(
  appointmentId: number,
  patientId: string
): Promise<PaymentStatusResponse> {
  const res = await apiClient.get<PaymentStatusResponse>(
    `/payments/${appointmentId}?patient_id=${encodeURIComponent(patientId)}`
  );
  return res.data;
}

// ── Reviews API ─────────────────────────────────────────────────────────────
export async function getDoctorReviews(doctorId: number): Promise<Review[]> {
  const res = await apiClient.get<Review[]>(`/doctors/${doctorId}/reviews`);
  return res.data;
}

export async function createReview(
  doctorId: number,
  payload: { appointment_id: number; rating: number; review_text?: string }
): Promise<Review> {
  const res = await apiClient.post<Review>(`/doctors/${doctorId}/reviews`, payload);
  return res.data;
}
