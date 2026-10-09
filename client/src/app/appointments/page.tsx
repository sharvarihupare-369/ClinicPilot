"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  MapPin,
  Bot,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  RefreshCw,
  Trash2,
  Stethoscope,
  User,
  ArrowRight,
  Search,
  Lock,
  IndianRupee,
  CreditCard,
  Star,
} from "lucide-react";
import {
  getAppointments,
  cancelAppointment,
  rescheduleAppointment,
} from "@/lib/api";
import { formatDate, formatTime } from "@/lib/utils";
import type { Appointment } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import PaymentModal from "@/components/payment/PaymentModal";
import ReviewModal from "@/components/ReviewModal";

export default function AppointmentsPage() {
  const router = useRouter();
  const { user, profile, isAuthenticated, role, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/patient/login?redirect=/appointments");
    }
  }, [authLoading, isAuthenticated, router]);

  // Directly identify the patient from authenticated profile
  const patientId =
    (isAuthenticated && (profile?.patient_code || (user ? `pat_${user.id}` : null))) || "";

  const [selectedStatusTab, setSelectedStatusTab] = useState<"ALL" | "CONFIRMED" | "PENDING_PAYMENT" | "CANCELLED" | "COMPLETED">("ALL");

  // Payment Modal State
  const [payingApt, setPayingApt] = useState<Appointment | null>(null);

  // Reschedule Modal State
  const [reschedulingApt, setReschedulingApt] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState("2026-10-08");
  const [newTime, setNewTime] = useState("10:00");

  // Cancel Confirmation Modal State
  const [cancelingApt, setCancelingApt] = useState<Appointment | null>(null);

  // Review Modal State
  const [reviewingApt, setReviewingApt] = useState<Appointment | null>(null);

  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const queryClient = useQueryClient();

  // Query appointments
  const {
    data: appointments = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["appointments", patientId, selectedStatusTab],
    queryFn: () =>
      getAppointments(
        patientId,
        selectedStatusTab === "ALL" ? undefined : selectedStatusTab
      ),
    enabled: isAuthenticated && !!patientId,
    refetchInterval: 3000,
  });

  useEffect(() => {
    const handleAptChanged = () => {
      refetch();
    };
    window.addEventListener("appointment-changed", handleAptChanged);
    return () => {
      window.removeEventListener("appointment-changed", handleAptChanged);
    };
  }, [refetch]);

  // Calculate summary counts from fetched data or filtered view
  const confirmedCount = appointments.filter((a) => a.status === "CONFIRMED").length;
  const pendingCount = appointments.filter((a) => a.status === "PENDING_PAYMENT").length;
  const cancelledCount = appointments.filter((a) => a.status === "CANCELLED").length;

  const openAgentModal = (mode: "voice" | "typing" = "voice") => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-agent-modal", { detail: { mode } }));
    }
  };

  // Cancel Mutation
  const cancelMutation = useMutation({
    mutationFn: (aptId: number) =>
      cancelAppointment({ appointment_id: aptId, patient_id: patientId }),
    onSuccess: () => {
      setNotification({
        type: "success",
        text: "Appointment cancelled successfully. The slot has been released back to available.",
      });
      setCancelingApt(null);
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (err: unknown) => {
      setNotification({
        type: "error",
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Failed to cancel appointment.",
      });
    },
  });

  // Reschedule Mutation
  const rescheduleMutation = useMutation({
    mutationFn: () =>
      rescheduleAppointment({
        appointment_id: reschedulingApt!.id,
        patient_id: patientId,
        new_date: newDate,
        new_time: newTime,
      }),
    onSuccess: () => {
      setNotification({
        type: "success",
        text: `Appointment rescheduled to ${formatDate(newDate)} at ${formatTime(newTime)}.`,
      });
      setReschedulingApt(null);
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (err: unknown) => {
      setNotification({
        type: "error",
        text:
          (err as { response?: { data?: { detail?: { message?: string } } } })?.response?.data
            ?.detail?.message || "Failed to reschedule appointment. Slot may be unavailable.",
      });
    },
  });

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 bg-slate-50 dark:bg-[#070b14]">
        <div className="max-w-md w-full bg-white dark:bg-[#0f172a] rounded-3xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Appointments Locked
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              You must be signed in with a patient account to view your confirmed clinic visits, appointment schedules, and history. Redirecting to login...
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/patient/login?redirect=/appointments"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 active:scale-95 transition"
            >
              <span>Sign In to Access Appointments</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full space-y-8">
      {/* Top Header matching "My Confirmed Visits" */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-b border-slate-200 dark:border-slate-800/80 pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 text-blue-700 dark:text-cyan-300 text-xs font-semibold mb-2 shadow-sm">
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Patient Portal</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            My Confirmed Visits
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Review your upcoming consultations, change booking times, or cancel appointments. Real-time synchronization keeps your doctor&apos;s calendar accurate.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
          <button
            onClick={() => openAgentModal("voice")}
            className="bg-blue-50/80 hover:bg-blue-100/90 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-700 dark:text-slate-100 border border-blue-200/80 dark:border-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Bot className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            <span>Book with AI Agent</span>
          </button>
          <Link
            href="/doctors"
            className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-medium shadow-sm transition-colors"
          >
            Find Doctors
          </Link>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Visits</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {appointments.length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Confirmed & Active</span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
              {confirmedCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending Payment</span>
            <div className="text-2xl font-black text-amber-500 dark:text-amber-400 mt-0.5">
              {pendingCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Cancelled / Released</span>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
              {cancelledCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Patient Switcher */}
      <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/90 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs w-full sm:w-auto overflow-x-auto">
          {(["ALL", "CONFIRMED", "PENDING_PAYMENT", "COMPLETED", "CANCELLED"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedStatusTab(tab)}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 ${
                selectedStatusTab === tab
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <span>
                {tab === "ALL"
                  ? "All Visits"
                  : tab === "CONFIRMED"
                  ? "Confirmed"
                  : tab === "PENDING_PAYMENT"
                  ? "Pending Payment"
                  : tab === "COMPLETED"
                  ? "Completed"
                  : "Cancelled"}
              </span>
              {tab === "PENDING_PAYMENT" && pendingCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    selectedStatusTab === "PENDING_PAYMENT"
                      ? "bg-amber-300 text-slate-950"
                      : "bg-amber-500/20 text-amber-500"
                  }`}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Active Patient Identity Chip or Sign In prompt */}
        <div className="flex items-center gap-3 text-xs w-full sm:w-auto justify-between sm:justify-end">
          {isAuthenticated && role === "PATIENT" ? (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-500 dark:text-slate-400">Bookings for:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {profile?.name || user?.email}
              </span>
            </div>
          ) : (
            <Link
              href="/patient/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-cyan-300 text-xs font-semibold transition-colors"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In to Sync Bookings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Global Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs shadow-sm transition-all ${
            notification.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200"
              : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{notification.text}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 cursor-pointer"
            title="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Appointments List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse shadow-sm"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12 bg-white dark:bg-[#0c1222] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm p-8">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="font-bold text-slate-900 dark:text-white text-base">Unable to load appointments</h3>
          <p className="text-slate-600 dark:text-slate-400 text-xs max-w-md mx-auto">
            Could not retrieve your booked appointments. Please verify the backend connection and try again.
          </p>
          <button
            onClick={() => refetch()}
            className="gradient-primary text-white text-xs px-4 py-2 rounded-xl font-medium shadow-md cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0c1222] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm p-8">
          <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Calendar className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              No visits found
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              {isAuthenticated && role === "PATIENT"
                ? `You have no appointments booked under the ${selectedStatusTab.toLowerCase()} filter.`
                : `There are currently no visits found under the ${selectedStatusTab.toLowerCase()} filter.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => openAgentModal("voice")}
              className="inline-flex items-center gap-2 gradient-primary text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md cursor-pointer hover:brightness-110"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Book Appointment with AI</span>
            </button>
            <Link
              href="/doctors"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium border border-slate-200 dark:border-slate-700 transition"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Browse Doctors Directory</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((apt) => {
            const isConfirmed = apt.status === "CONFIRMED";
            const isPendingPayment = apt.status === "PENDING_PAYMENT";
            const isCompleted = apt.status === "COMPLETED";
            
            const aptDateTime = new Date(`${apt.date}T${apt.time}`);
            const isPast = aptDateTime <= new Date();
            const canReview = (isConfirmed || isCompleted) && isPast && !apt.has_reviewed_doctor;

            return (
              <div
                key={apt.id}
                className="bg-white dark:bg-[#0c1222] rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 hover:border-blue-400/50 dark:hover:border-slate-700 transition-all shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5"
              >
                {/* Doctor & Clinic Info */}
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold shadow-sm ${
                      isConfirmed
                        ? "gradient-primary text-white"
                        : isPendingPayment
                        ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                    }`}
                  >
                    <Stethoscope className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-slate-900 dark:text-white text-base">
                        {apt.doctor_name || `Doctor #${apt.doctor_id}`}
                      </h3>
                      {isConfirmed ? (
                        <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30">
                          CONFIRMED
                        </span>
                      ) : isPendingPayment ? (
                        <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 flex items-center gap-1">
                          <Clock className="w-3 h-3 animate-spin text-amber-500" />
                          PAYMENT PENDING
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700">
                          {apt.status}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                      {apt.specialty && (
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {apt.specialty}
                        </span>
                      )}
                      {apt.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {apt.location} Clinic
                        </span>
                      )}
                      <span className="font-mono text-slate-400 dark:text-slate-500 text-[11px]">
                        Ref: #{apt.id}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Date & Time Badges */}
                <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 self-stretch md:self-auto justify-between md:justify-start">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-white">
                      {formatDate(apt.date)}
                    </span>
                  </div>
                  <span className="text-slate-300 dark:text-slate-700 font-mono">|</span>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                    <span className="text-xs font-semibold text-blue-600 dark:text-cyan-300 font-mono">
                      {formatTime(apt.time)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                {isPendingPayment ? (
                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <button
                      onClick={() => setPayingApt(apt)}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <IndianRupee className="w-3.5 h-3.5" />
                      <span>Pay Now {apt.consultation_fee ? `(₹${apt.consultation_fee})` : ""}</span>
                    </button>
                    <button
                      onClick={() => setCancelingApt(apt)}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-medium border border-rose-200 dark:border-rose-500/25 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                      <span>Cancel</span>
                    </button>
                  </div>
                ) : isConfirmed ? (
                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <button
                      onClick={() => {
                        setReschedulingApt(apt);
                        setNewDate(apt.date);
                        setNewTime(apt.time);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Reschedule</span>
                    </button>
                    <button
                      onClick={() => setCancelingApt(apt)}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-medium border border-rose-200 dark:border-rose-500/25 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                      <span>Cancel</span>
                    </button>
                    {/* Write a Review Button */}
                    {canReview && (
                      <button
                        onClick={() => setReviewingApt(apt)}
                        className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium border border-amber-200 dark:border-amber-500/30 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm ml-2 md:ml-0"
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>Write Review</span>
                      </button>
                    )}
                  </div>
                ) : isCompleted ? (
                  <div className="flex items-center gap-2 self-end md:self-auto">
                    {/* Write a Review Button */}
                    {canReview && (
                      <button
                        onClick={() => setReviewingApt(apt)}
                        className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium border border-amber-200 dark:border-amber-500/30 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm ml-2 md:ml-0"
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>Write Review</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic self-end md:self-auto">
                    Visit slot released
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingApt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-700 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Reschedule Appointment</span>
              </h3>
              <button
                onClick={() => setReschedulingApt(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Moving appointment with{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {reschedulingApt.doctor_name || `Doctor #${reschedulingApt.doctor_id}`}
              </span>
              . Your existing slot will be released back to the calendar and the new date/time will be verified.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-700 dark:text-slate-300 font-medium block mb-1">
                  New Date (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-700 dark:text-slate-300 font-medium block mb-1">
                  New Time (e.g. 10:00, 11:30, 14:00)
                </label>
                <input
                  type="text"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  placeholder="10:00"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setReschedulingApt(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={() => rescheduleMutation.mutate()}
                disabled={rescheduleMutation.isPending}
                className="gradient-primary text-white text-xs font-semibold px-4 py-2 rounded-xl hover:brightness-110 disabled:opacity-50 cursor-pointer shadow-md"
              >
                {rescheduleMutation.isPending ? "Updating Slot..." : "Confirm Reschedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelingApt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl max-w-sm w-full p-6 border border-rose-200 dark:border-rose-500/30 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Confirm Cancellation</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Are you sure you want to cancel your visit with{" "}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {cancelingApt.doctor_name || `Doctor #${cancelingApt.doctor_id}`}
                </span>{" "}
                on <span className="font-medium text-slate-800 dark:text-slate-200">{formatDate(cancelingApt.date)}</span> at{" "}
                <span className="font-medium text-slate-800 dark:text-slate-200">{formatTime(cancelingApt.time)}</span>?
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium pt-1">
                This slot will be immediately made available to other patients.
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => setCancelingApt(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
              >
                Keep Visit
              </button>
              <button
                onClick={() => cancelMutation.mutate(cancelingApt.id)}
                disabled={cancelMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer shadow-md"
              >
                {cancelMutation.isPending ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Razorpay Payment Modal */}
      {payingApt && (
        <PaymentModal
          appointmentId={payingApt.id}
          patientId={patientId}
          doctorName={payingApt.doctor_name || `Doctor #${payingApt.doctor_id}`}
          date={payingApt.date}
          time={payingApt.time}
          amountPaise={(payingApt.consultation_fee || 500) * 100}
          onSuccess={() => {
            setPayingApt(null);
            setNotification({
              type: "success",
              text: "Payment confirmed! Your appointment is now secured and confirmed.",
            });
            queryClient.invalidateQueries({ queryKey: ["appointments"] });
            refetch();
          }}
          onFailure={(reason) => {
            setNotification({
              type: "error",
              text: `Payment could not be completed: ${reason}`,
            });
          }}
          onClose={() => setPayingApt(null)}
        />
      )}

      {/* Review Modal */}
      {reviewingApt && (
        <ReviewModal
          appointmentId={reviewingApt.id as number}
          doctorId={reviewingApt.doctor_id}
          doctorName={reviewingApt.doctor_name || "Doctor"}
          onClose={() => setReviewingApt(null)}
          onSuccess={() => {
            setReviewingApt(null);
            setNotification({ type: "success", text: "Thank you! Your review has been submitted successfully." });
          }}
        />
      )}
    </div>
  );
}
