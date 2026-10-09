"use client";

import React, { useState, use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Bot,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Star,
  Lock,
  IndianRupee,
  CreditCard,
} from "lucide-react";
import { getDoctorById, getDoctorSlots, holdSlot, getDoctorReviews, createReview } from "@/lib/api";
import type { HoldSlotResponse } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/utils";
import type { Slot, Review } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import PaymentModal from "@/components/payment/PaymentModal";

import { Suspense } from "react";

export default function DoctorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-16 text-center animate-pulse space-y-4">
          <div className="h-10 bg-slate-800 rounded-xl w-1/3 mx-auto" />
          <div className="h-48 bg-slate-800 rounded-2xl w-full" />
        </div>
      }
    >
      <DoctorProfileContent params={params} />
    </Suspense>
  );
}

function DoctorProfileContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const doctorId = parseInt(resolvedParams.id, 10);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, profile, isAuthenticated } = useAuth();

  const formatLocalDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Payment flow state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [holdData, setHoldData] = useState<HoldSlotResponse | null>(null);
  const [isHolding, setIsHolding] = useState(false);

  const patientId = profile?.patient_code || (user ? `pat_${user.id}` : "");

  const handleBookWithAI = () => {
    if (!isAuthenticated) {
      router.push("/patient/login?redirect=/chat");
    } else {
      router.push("/chat");
    }
  };

  // Helper to check if a slot's time on a date has already passed
  const isSlotInPast = (slotDate: string, slotTime: string): boolean => {
    const now = new Date();
    const todayStr = formatLocalDate(now);
    if (slotDate < todayStr) return true;
    if (slotDate > todayStr) return false;
    // For today, compare time strictly against current local hours & minutes
    const [h, m] = slotTime.split(":").map((v) => parseInt(v, 10));
    const nowH = now.getHours();
    const nowM = now.getMinutes();
    if (h < nowH) return true;
    if (h === nowH && m <= nowM) return true;
    return false;
  };

  const handleSelectSlot = (slot: Slot) => {
    if (!isAuthenticated) {
      router.push(`/patient/login?redirect=${encodeURIComponent(`/doctors/${doctorId}`)}`);
      return;
    }
    if (isSlotInPast(slot.date, slot.time) || slot.status === "PAST") {
      setBookingError(`The slot at ${formatTime(slot.time)} on ${formatDate(slot.date)} has already passed and cannot be booked.`);
      return;
    }
    if (slot.status !== "AVAILABLE") {
      setBookingError(`Slot at ${formatTime(slot.time)} is currently ${slot.status.toLowerCase()} and cannot be reserved.`);
      return;
    }
    setBookingError(null);
    setBookingSuccess(null);
    setSelectedSlot(slot);
  };

  // Query doctor detail
  const {
    data: doctor,
    isLoading: isDocLoading,
    isError: isDocError,
  } = useQuery({
    queryKey: ["doctor", doctorId],
    queryFn: () => getDoctorById(doctorId),
  });

  const {
    data: slots = [],
    isLoading: isSlotsLoading,
  } = useQuery({
    queryKey: ["slots", doctorId, selectedDate],
    queryFn: () => getDoctorSlots(doctorId, selectedDate),
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", doctorId],
    queryFn: () => getDoctorReviews(doctorId),
  });

  const availableSlots = useMemo(() => {
    return slots.filter(
      (s) => s.status === "AVAILABLE" && !isSlotInPast(s.date, s.time)
    );
  }, [slots, selectedDate]);

  const passedSlotsCount = useMemo(() => {
    return slots.filter(
      (s) => s.status === "PAST" || isSlotInPast(s.date, s.time)
    ).length;
  }, [slots, selectedDate]);

  // Hold slot mutation (replaces direct book)
  const holdMutation = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !patientId) {
        router.push(`/patient/login?redirect=${encodeURIComponent(`/doctors/${doctorId}`)}`);
        throw new Error("Patient authentication required.");
      }
      if (!selectedSlot) {
        throw new Error("No slot selected.");
      }
      if (isSlotInPast(selectedSlot.date, selectedSlot.time) || selectedSlot.status === "PAST") {
        throw new Error("Cannot reserve a time slot that has already passed.");
      }
      return holdSlot({
        patient_id: patientId,
        doctor_id: doctorId,
        date: selectedSlot.date,
        time: selectedSlot.time,
      });
    },
    onSuccess: (data) => {
      setHoldData(data);
      setPaymentModalOpen(true);
      setBookingError(null);
      // Invalidate slots — the slot will now show as HELD
      queryClient.invalidateQueries({ queryKey: ["slots", doctorId] });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["slots", doctorId] });
      const serverMsg =
        err?.response?.data?.detail?.message ||
        err?.response?.data?.detail ||
        err?.message ||
        "This slot was just reserved by another patient. Please choose a different slot.";
      setBookingError(serverMsg);
      setSelectedSlot(null);
    },
  });

  // Quick next 6 days list dynamically computed from Today
  const sampleDates = useMemo(() => {
    const today = new Date();
    const weekdayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const days = [];
    for (let i = 0; i < 6; i++) {
      const cur = new Date(today);
      cur.setDate(today.getDate() + i);
      const dateStr = formatLocalDate(cur);
      let label = weekdayNames[cur.getDay()];
      if (i === 0) label = "Today";
      else if (i === 1) label = "Tomorrow";
      days.push({ label, date: dateStr });
    }
    return days;
  }, []);

  if (isDocLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center animate-pulse space-y-4">
        <div className="h-10 bg-slate-800 rounded-xl w-1/3 mx-auto" />
        <div className="h-48 bg-slate-800 rounded-2xl w-full" />
      </div>
    );
  }

  if (isDocError || !doctor) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Doctor Not Found</h2>
        <p className="text-xs text-slate-400">
          The requested physician profile could not be located in the clinic system.
        </p>
        <Link
          href="/doctors"
          className="inline-flex items-center gap-2 gradient-primary text-white text-xs font-semibold px-4 py-2.5 rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Doctor Directory</span>
        </Link>
      </div>
    );
  }

  return (
    <>
    <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Back button */}
      <div>
        <Link
          href="/doctors"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Doctors Directory</span>
        </Link>
      </div>

      {/* Doctor Hero Card */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 relative overflow-hidden shadow-sm dark:shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/20">
              {doctor.name.replace("Dr. ", "").charAt(0)}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  {doctor.name}
                </h1>
                <span className="text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 rounded-full">
                  Verified
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-500/25">
                  {doctor.specialty}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1 border border-slate-200 dark:border-slate-700">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  {doctor.location} Clinic
                </span>
                <span className="px-2.5 py-1 rounded-md bg-amber-50 dark:bg-slate-800 text-amber-700 dark:text-amber-400 flex items-center gap-1 border border-amber-200 dark:border-slate-700">
                  <Star className="w-3.5 h-3.5 fill-amber-500 dark:fill-amber-400" />
                  {doctor.average_rating ? `${doctor.average_rating.toFixed(1)} Rating (${doctor.total_reviews} reviews)` : "New Doctor"}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center gap-1 border border-emerald-200 dark:border-emerald-500/25 font-bold">
                  <IndianRupee className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{doctor.consultation_fee || 500} / visit</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleBookWithAI}
              className="w-full sm:w-auto bg-blue-50/80 hover:bg-blue-100/90 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-700 dark:text-slate-100 border border-blue-200/80 dark:border-slate-700 text-xs font-semibold px-5 py-3 rounded-xl shadow-xs active:scale-95 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {!isAuthenticated && <Lock className="w-4 h-4 text-blue-400 dark:text-slate-400" />}
              <Bot className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              <span>Book with AI Assistant</span>
            </button>
          </div>
        </div>
      </div>



      {/* Success banner if booked */}
      {bookingSuccess && (
        <div className="rounded-2xl p-4 border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 flex items-start justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-emerald-900 dark:text-white">Booking Confirmed!</h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-200">{bookingSuccess}</p>
            </div>
          </div>
          <Link
            href="/appointments"
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-white underline shrink-0"
          >
            View in My Appointments
          </Link>
        </div>
      )}

      {/* Schedule & Slot Picker Section */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Select Date & Time Slot</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Choose a date to view authoritative real-time openings directly from the clinic schedule.
          </p>
        </div>

        {/* Date Selector Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {sampleDates.map((item) => {
            const isSelected = selectedDate === item.date;
            return (
              <button
                key={item.date}
                onClick={() => {
                  setSelectedDate(item.date);
                  setSelectedSlot(null);
                }}
                className={`p-3 rounded-xl border text-center transition-all ${
                  isSelected
                    ? "bg-blue-600/10 border-blue-500 text-blue-700 dark:bg-blue-600/20 dark:border-blue-500 dark:text-white shadow-sm"
                    : "bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <span className="text-[11px] block font-medium opacity-80">
                  {item.label}
                </span>
                <span className="text-xs font-bold block mt-1">
                  {item.date.slice(5)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Available Time Slots Grid */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Openings for {formatDate(selectedDate)}
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-200">
                {availableSlots.length}
              </span>{" "}
              slot{availableSlots.length === 1 ? "" : "s"} available
              {passedSlotsCount > 0 && (
                <span className="text-slate-400 dark:text-slate-500 ml-1">
                  ({passedSlotsCount} passed)
                </span>
              )}
            </span>
          </div>

          {availableSlots.length === 0 && slots.length > 0 && (
            <div className="mb-4 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                All consultation slots for today have already passed. Please select tomorrow or another upcoming date to book an appointment.
              </span>
            </div>
          )}

          {isSlotsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-12 bg-slate-200 dark:bg-slate-800/80 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <Clock className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto" />
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                No slots available on this date.
              </p>
              <p className="text-[11px] text-slate-500">
                Please select another day or consult the AI assistant to find neighboring openings.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {slots.map((slot) => {
                const isPast = slot.status === "PAST" || isSlotInPast(slot.date, slot.time);
                const isHeld = slot.status === "HELD";
                const isBooked = slot.status === "BOOKED";
                const isSelected = selectedSlot?.id === slot.id;

                if (isPast) {
                  return (
                    <button
                      key={slot.id}
                      disabled
                      type="button"
                      title="This time slot has already passed today and cannot be booked."
                      className="py-3 px-2 rounded-xl text-xs font-mono font-medium border bg-slate-100/70 dark:bg-slate-900/40 text-slate-400 dark:text-slate-600 border-slate-200/60 dark:border-slate-800/50 cursor-not-allowed opacity-60 flex flex-col items-center justify-center gap-1 transition-none select-none"
                    >
                      <span className="line-through decoration-slate-400 dark:decoration-slate-600">
                        {formatTime(slot.time)}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-sans flex items-center gap-1 font-medium">
                        <Clock className="w-2.5 h-2.5 opacity-70" />
                        <span>Passed</span>
                      </span>
                    </button>
                  );
                }

                if (isHeld) {
                  return (
                    <button
                      key={slot.id}
                      disabled
                      type="button"
                      title="Temporarily reserved by another patient completing checkout."
                      className="py-3 px-2 rounded-xl text-xs font-mono font-medium border bg-amber-50/70 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 cursor-not-allowed flex flex-col items-center justify-center gap-1 select-none"
                    >
                      <span>{formatTime(slot.time)}</span>
                      <span className="text-[9px] uppercase tracking-wider font-sans flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                        <Clock className="w-2.5 h-2.5" />
                        <span>Reserved</span>
                      </span>
                    </button>
                  );
                }

                if (isBooked) {
                  return (
                    <button
                      key={slot.id}
                      disabled
                      type="button"
                      title="This slot is already booked."
                      className="py-3 px-2 rounded-xl text-xs font-mono font-medium border bg-slate-100 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-75 flex flex-col items-center justify-center gap-1 select-none"
                    >
                      <span>{formatTime(slot.time)}</span>
                      <span className="text-[9px] uppercase tracking-wider font-sans font-medium">
                        Booked
                      </span>
                    </button>
                  );
                }

                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => handleSelectSlot(slot)}
                    className={`py-3 px-2 rounded-xl text-xs font-mono font-semibold border transition-all flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20 scale-[1.02]"
                        : "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/90 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm"
                    }`}
                  >
                    <span>{formatTime(slot.time)}</span>
                    <span className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-sans flex items-center gap-1">
                      {!isAuthenticated && <Lock className="w-2.5 h-2.5 text-cyan-500 dark:text-cyan-300" />}
                      <span>Available</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Slot Booking Drawer / Confirmation */}
        {selectedSlot && (
          <div className="mt-6 p-5 rounded-2xl bg-blue-50/80 dark:bg-slate-950/90 border border-blue-200 dark:border-blue-500/30 space-y-4 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Ready to reserve slot
                </span>
                <h4 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {doctor.name} • {formatDate(selectedSlot.date)} at{" "}
                  <span className="text-blue-600 dark:text-blue-400">{formatTime(selectedSlot.time)}</span>
                </h4>
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Booking for:</span>
                  <span className="font-semibold text-slate-900 dark:text-white px-2.5 py-1 rounded-lg bg-blue-100/70 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30 text-xs">
                    {profile?.name || user?.email || "Authenticated Patient"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedSlot(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => holdMutation.mutate()}
                  disabled={holdMutation.isPending}
                  className="gradient-primary text-white text-xs font-semibold px-5 py-2.5 rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {holdMutation.isPending ? (
                    <span>Reserving slot…</span>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Reserve &amp; Pay ₹{doctor.consultation_fee?.toLocaleString("en-IN")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {bookingError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1">
                  <p className="font-semibold text-rose-200">Slot Already Booked</p>
                  <p className="mt-0.5 leading-relaxed">{bookingError}</p>
                </div>
              </div>
            )}
          </div>
        )}
        {bookingError && !selectedSlot && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs animate-in fade-in mt-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1">
              <p className="font-semibold text-rose-200">Slot Not Available</p>
              <p className="mt-0.5 leading-relaxed">{bookingError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Reviews Section */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
            <span>Verified Patient Reviews</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real feedback from patients who completed an appointment with {doctor.name}.
          </p>
        </div>
        
        {reviews.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <Star className="w-6 h-6 text-slate-400 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No reviews yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {reviews.map((review: Review) => (
              <div key={review.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 space-y-3 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{review.patient_name}</span>
                    <div className="flex items-center gap-0.5 mt-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? "fill-amber-500 text-amber-500" : "fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700"}`} />
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">{new Date(review.created_at).toLocaleDateString()}</span>
                </div>
                {review.review_text && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 italic">"{review.review_text}"</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Payment Modal */}
    {paymentModalOpen && holdData && (
      <PaymentModal
        appointmentId={holdData.appointment_id}
        patientId={patientId}
        doctorName={doctor.name}
        date={holdData.date}
        time={holdData.time}
        amountPaise={holdData.amount}
        onSuccess={(confirmedId) => {
          setPaymentModalOpen(false);
          setHoldData(null);
          setSelectedSlot(null);
          setBookingSuccess(
            `Appointment confirmed with ${doctor.name} on ${formatDate(holdData.date)} at ${formatTime(holdData.time)}! (ID: #${confirmedId})`
          );
          queryClient.invalidateQueries({ queryKey: ["slots", doctorId] });
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("appointment-changed"));
          }
        }}
        onFailure={(reason) => {
          setPaymentModalOpen(false);
          setHoldData(null);
          setSelectedSlot(null);
          setBookingError(reason);
          queryClient.invalidateQueries({ queryKey: ["slots", doctorId] });
        }}
        onClose={() => {
          setPaymentModalOpen(false);
          setHoldData(null);
          setSelectedSlot(null);
          queryClient.invalidateQueries({ queryKey: ["slots", doctorId] });
        }}
      />
    )}
    </>
  );
}
