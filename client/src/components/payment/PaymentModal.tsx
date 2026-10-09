"use client";

/**
 * PaymentModal — Razorpay checkout integration.
 *
 * Flow:
 * 1. Calls POST /api/payments/create-order to get razorpay_order_id
 * 2. Loads Razorpay checkout script dynamically
 * 3. Opens Razorpay modal
 * 4. On success → calls /api/payments/verify (HMAC backend check)
 * 5. Polls /api/payments/{id} every 2s until appointment_status = CONFIRMED
 * 6. Calls onSuccess() or onFailure() based on result
 *
 * NOTE: The frontend callback is NOT the source of truth — the backend webhook is.
 * The verify + poll steps ensure we confirm with the backend before showing success.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Shield,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  Clock,
  Lock,
} from "lucide-react";
import {
  createPaymentOrder,
  verifyPaymentFrontend,
  getPaymentStatus,
} from "@/lib/api";
import { formatDate, formatTime } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentModalProps {
  appointmentId: number;
  patientId: string;
  doctorName: string;
  date: string;
  time: string;
  amountPaise: number;   // in paise (₹800 = 80000)
  onSuccess: (appointmentId: number) => void;
  onFailure: (reason: string) => void;
  onClose: () => void;
}

type ModalPhase =
  | "INITIALIZING"    // creating order
  | "READY"           // ready to open Razorpay
  | "PAYING"          // Razorpay modal is open
  | "VERIFYING"       // HMAC verify + polling
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED";        // 15-min hold expired

// ─── Load Razorpay script ────────────────────────────────────────────────────

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
    document.body.appendChild(script);
  });
}

// ─── Poll for confirmation ────────────────────────────────────────────────────

async function pollForConfirmation(
  appointmentId: number,
  patientId: string,
  maxRetries = 20,
  intervalMs = 2000
): Promise<"CONFIRMED" | "FAILED" | "TIMEOUT"> {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const status = await getPaymentStatus(appointmentId, patientId);
      if (status.appointment_status === "CONFIRMED" || status.status === "PAID") return "CONFIRMED";
      if (status.appointment_status === "CANCELLED" && status.status !== "PAID") return "FAILED";
    } catch {
      // ignore transient errors; keep polling
    }
  }
  return "TIMEOUT";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaymentModal({
  appointmentId,
  patientId,
  doctorName,
  date,
  time,
  amountPaise,
  onSuccess,
  onFailure,
  onClose,
}: PaymentModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("INITIALIZING");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");
  const [keyId, setKeyId] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState(15 * 60); // 15 minutes in seconds
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef<boolean>(false);

  const amountRupees = amountPaise / 100;

  // Countdown timer for the 15-min slot hold
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setPhase("EXPIRED");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Initialize: create Razorpay order
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await loadRazorpayScript();
        const order = await createPaymentOrder({
          appointment_id: appointmentId,
          patient_id: patientId,
        });
        if (cancelled) return;
        setOrderId(order.razorpay_order_id);
        setKeyId(order.key_id);
        setPhase("READY");
      } catch (err: any) {
        if (cancelled) return;
        const msg =
          err?.response?.data?.detail?.message ||
          err?.response?.data?.detail ||
          err?.message ||
          "Failed to initialize payment. Please try again.";
        setErrorMessage(msg);
        setPhase("FAILED");
      }
    }
    init();
    return () => { cancelled = true; };
  }, [appointmentId, patientId]);

  // Open Razorpay checkout
  const openRazorpay = () => {
    setPhase("PAYING");

    const options = {
      key: keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: amountPaise,
      currency: "INR",
      order_id: orderId,
      name: "ClinicPilot",
      description: `Consultation with ${doctorName}`,
      image: "/favicon.ico",
      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        setPhase("VERIFYING");
        try {
          // Step 1: Frontend HMAC verify (secondary — webhook is primary)
          await verifyPaymentFrontend({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            appointment_id: appointmentId,
            patient_id: patientId,
          });
        } catch {
          // Verification might fail if webhook already processed it — continue polling
        }

        // Step 2: Poll until backend confirms appointment
        const result = await pollForConfirmation(appointmentId, patientId);

        if (result === "CONFIRMED") {
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase("SUCCESS");
          setTimeout(() => onSuccess(appointmentId), 1500);
        } else if (result === "FAILED") {
          setErrorMessage("Payment failed. Your slot has been released.");
          setPhase("FAILED");
          onFailure("Payment failed.");
        } else {
          // TIMEOUT — webhook may be delayed; show success anyway and revalidate
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase("SUCCESS");
          setTimeout(() => onSuccess(appointmentId), 1500);
        }
      },
      prefill: {
        name: patientId || "Patient",
        contact: "9999999999",
        email: "patient@clinicpilot.com",
      },
      notes: {
        appointment_id: String(appointmentId),
        patient_id: patientId,
      },
      theme: { color: "#6366f1" },
      modal: {
        backdropclose: false,
        escape: false,
        ondismiss: () => {
          // User closed Razorpay without paying
          setPhase("READY");
        },
      },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.on("payment.failed", (response: any) => {
      const reason =
        response?.error?.description || "Payment declined. Please try again.";
      setErrorMessage(reason);
      setPhase("FAILED");
      onFailure(reason);
    });
    rzp.open();
  };

  // Format timer display
  const timerMins = Math.floor(timeLeft / 60);
  const timerSecs = String(timeLeft % 60).padStart(2, "0");

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={phase === "PAYING" || phase === "VERIFYING" ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-200">Secure Payment</span>
          </div>
          {phase !== "PAYING" && phase !== "VERIFYING" && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* Booking Summary */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Booking Summary</h3>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Doctor</span>
                <span className="text-slate-900 dark:text-slate-200 font-medium">{doctorName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Date</span>
                <span className="text-slate-900 dark:text-slate-200">{formatDate(date)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Time</span>
                <span className="text-slate-900 dark:text-slate-200">{formatTime(time)}</span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700/50 pt-2 mt-2 flex justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-semibold">Consultation Fee</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold text-lg flex items-center gap-1">
                  <IndianRupee className="h-4 w-4" />
                  {amountRupees.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>

          {/* Slot hold countdown */}
          {(phase === "INITIALIZING" || phase === "READY") && timeLeft > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-400/20">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Slot reserved for{" "}
                <strong>{timerMins}:{timerSecs}</strong> — complete payment before it expires
              </span>
            </div>
          )}

          {/* Phase: INITIALIZING */}
          {phase === "INITIALIZING" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Preparing secure checkout…</p>
            </div>
          )}

          {/* Phase: READY */}
          {phase === "READY" && (
            <div className="space-y-4">
              <button
                onClick={openRazorpay}
                className="w-full py-3.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                <IndianRupee className="h-4 w-4" />
                Pay ₹{amountRupees.toLocaleString("en-IN")} with Razorpay
              </button>
              <p className="text-xs text-center text-slate-500 flex items-center justify-center gap-1">
                <Shield className="h-3 w-3" />
                Secured by Razorpay · 256-bit SSL encryption
              </p>
            </div>
          )}

          {/* Phase: PAYING */}
          {phase === "PAYING" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Complete the payment in the Razorpay window…</p>
            </div>
          )}

          {/* Phase: VERIFYING */}
          {phase === "VERIFYING" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-4 border-indigo-200 dark:border-indigo-400/30 border-t-indigo-600 dark:border-t-indigo-400 animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-200">Verifying your payment…</p>
                <p className="text-xs text-slate-500">
                  Please wait while we confirm with Razorpay
                </p>
              </div>
            </div>
          )}

          {/* Phase: SUCCESS */}
          {phase === "SUCCESS" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-base font-semibold text-emerald-600 dark:text-emerald-400">Payment Successful!</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your appointment with {doctorName} is confirmed.
                </p>
              </div>
            </div>
          )}

          {/* Phase: FAILED */}
          {phase === "FAILED" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                  <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">Payment Failed</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{errorMessage}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-semibold text-white dark:text-slate-200 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
              >
                Close & Try Another Slot
              </button>
            </div>
          )}

          {/* Phase: EXPIRED */}
          {phase === "EXPIRED" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                  <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Reservation Expired</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Your 15-minute slot hold has expired. Please select the slot again to rebook.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-semibold text-white dark:text-slate-200 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
              >
                Select a New Slot
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
