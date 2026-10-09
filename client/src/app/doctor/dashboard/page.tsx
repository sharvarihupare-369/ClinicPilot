"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Stethoscope,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  Trash2,
  Plus,
  RefreshCw,
  LogOut,
  MapPin,
  Award,
  IndianRupee,
  AlertCircle,
  Save,
  Check,
  ChevronRight,
  TrendingUp,
  Star,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  getDoctorMe,
  updateDoctorMe,
  getDoctorAllAvailability,
  createDoctorAvailability,
  deleteDoctorAvailability,
  getDoctorAppointments,
} from "@/lib/api";
import type { Doctor, DoctorMetrics, Slot, Appointment } from "@/lib/types";

const STANDARD_SLOTS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
];

export default function DoctorDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [metrics, setMetrics] = useState<DoctorMetrics | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"slots" | "appointments" | "profile">("slots");

  // Slot Management State
  const [todayStr, setTodayStr] = useState<string>("");
  const [tomorrowStr, setTomorrowStr] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTimesToPublish, setSelectedTimesToPublish] = useState<string[]>([]);
  const [customTimeInput, setCustomTimeInput] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [slotActionError, setSlotActionError] = useState<string | null>(null);
  const [slotSuccessMsg, setSlotSuccessMsg] = useState<string | null>(null);

  // Set today and tomorrow dates on mount
  useEffect(() => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const tom = new Date(now);
    tom.setDate(tom.getDate() + 1);
    const tomorrow = tom.toISOString().split("T")[0];
    setTodayStr(today);
    setTomorrowStr(tomorrow);
    setSelectedDate(today);
  }, []);

  // Profile Edit State
  const [profileForm, setProfileForm] = useState({
    name: "",
    specialty: "",
    location: "",
    qualification: "",
    experience_years: 0,
    consultation_fee: 0,
    bio: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);

  // Auth redirect check
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/doctor/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Load Doctor Data
  const loadDashboardData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [doctorData, apptsData] = await Promise.all([
        getDoctorMe(),
        getDoctorAppointments(),
      ]);

      setDoctor(doctorData.profile);
      setMetrics(doctorData.metrics);
      setAppointments(apptsData);

      setProfileForm({
        name: doctorData.profile.name || "",
        specialty: doctorData.profile.specialty || "",
        location: doctorData.profile.location || "",
        qualification: doctorData.profile.qualification || "",
        experience_years: doctorData.profile.experience_years || 0,
        consultation_fee: doctorData.profile.consultation_fee || 0,
        bio: doctorData.profile.bio || "",
      });

      // Load slots for selected date
      if (selectedDate) {
        const slotsData = await getDoctorAllAvailability(selectedDate);
        setSlots(slotsData);
      }
    } catch (err) {
      console.error("Failed to load doctor dashboard data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadDashboardData();

    // Auto-refresh interval so newly booked appointments reflect live
    const interval = setInterval(() => {
      Promise.all([
        getDoctorMe(),
        getDoctorAppointments(),
        selectedDate ? getDoctorAllAvailability(selectedDate) : Promise.resolve([]),
      ])
        .then(([doctorData, apptsData, slotsData]) => {
          setDoctor(doctorData.profile);
          setMetrics(doctorData.metrics);
          setAppointments(apptsData);
          if (selectedDate && slotsData.length > 0) {
            setSlots(slotsData);
          }
        })
        .catch(() => {});
    }, 4000);

    const handleAptChanged = () => {
      loadDashboardData();
    };
    window.addEventListener("appointment-changed", handleAptChanged);

    return () => {
      clearInterval(interval);
      window.removeEventListener("appointment-changed", handleAptChanged);
    };
  }, [isAuthenticated, loadDashboardData, selectedDate]);

  // Date change handler for slots
  const handleDateChange = async (newDate: string) => {
    setSelectedDate(newDate);
    setSlotActionError(null);
    setSlotSuccessMsg(null);
    try {
      const slotsData = await getDoctorAllAvailability(newDate);
      setSlots(slotsData);
    } catch (err) {
      console.error("Error fetching slots for date:", err);
    }
  };

  // Toggle standard slot selection
  const toggleSlotSelection = (time: string) => {
    setSelectedTimesToPublish((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time]
    );
  };

  const handleSelectAllMorning = () => {
    const morning = STANDARD_SLOTS.filter((s) => parseInt(s.split(":")[0]) < 12);
    setSelectedTimesToPublish((prev) => Array.from(new Set([...prev, ...morning])));
  };

  const handleSelectAllAfternoon = () => {
    const afternoon = STANDARD_SLOTS.filter((s) => parseInt(s.split(":")[0]) >= 12);
    setSelectedTimesToPublish((prev) => Array.from(new Set([...prev, ...afternoon])));
  };

  const handleClearSelected = () => {
    setSelectedTimesToPublish([]);
  };

  const handleAddCustomTime = () => {
    if (!customTimeInput) return;
    if (!selectedTimesToPublish.includes(customTimeInput)) {
      setSelectedTimesToPublish([...selectedTimesToPublish, customTimeInput]);
    }
    setCustomTimeInput("");
  };

  // Publish slots
  const handlePublishSlots = async () => {
    if (selectedTimesToPublish.length === 0) {
      setSlotActionError("Please select at least one time slot to publish.");
      return;
    }

    setPublishing(true);
    setSlotActionError(null);
    setSlotSuccessMsg(null);

    try {
      const updatedSlots = await createDoctorAvailability(selectedDate, selectedTimesToPublish);
      setSlots(updatedSlots);
      setSelectedTimesToPublish([]);
      setSlotSuccessMsg(
        `Successfully published ${selectedTimesToPublish.length} slot(s) for ${selectedDate}!`
      );
      // Refresh metrics
      const doctorData = await getDoctorMe();
      setMetrics(doctorData.metrics);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSlotActionError(err.message);
      } else {
        setSlotActionError("Failed to publish availability slots.");
      }
    } finally {
      setPublishing(false);
    }
  };

  // Delete slot
  const handleDeleteSlot = async (slotId: number | string) => {
    try {
      await deleteDoctorAvailability(slotId);
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      // Refresh metrics
      const doctorData = await getDoctorMe();
      setMetrics(doctorData.metrics);
      setSlotSuccessMsg("Slot removed successfully.");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSlotActionError(err.message);
      } else {
        setSlotActionError("Failed to delete slot.");
      }
    }
  };

  // Save profile updates
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccessMsg(null);
    try {
      const updated = await updateDoctorMe(profileForm);
      setDoctor(updated);
      setProfileSuccessMsg("Doctor profile updated successfully!");
    } catch (err: unknown) {
      console.error(err);
      alert("Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  if (authLoading || (loading && !doctor)) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] flex items-center justify-center text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 dark:text-cyan-400" />
          <p className="text-sm font-medium">Connecting to Doctor Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] text-slate-800 dark:text-slate-100 transition-colors">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#0a0f1d]/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-sky-500 to-cyan-400 p-[1.5px] shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full rounded-xl bg-white dark:bg-[#0d1322] flex items-center justify-center text-blue-600 dark:text-cyan-400">
                <Stethoscope className="w-5 h-5" />
              </div>
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">
              ClinicPilot
            </span>
          </Link>
          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-cyan-300 font-semibold border border-blue-200 dark:border-blue-800/80">
            Doctor Workspace
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadDashboardData}
            disabled={refreshing}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs flex items-center gap-1.5 transition"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-blue-500" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />

          <button
            onClick={() => {
              logout();
              router.push("/doctor/login");
            }}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-100 text-xs flex items-center gap-1.5 transition"
            title="Sign out of doctor portal"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Doctor Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white p-6 sm:p-8 shadow-xl shadow-blue-900/20">
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-md">
                  Active Provider
                </span>
                <span className="text-xs text-blue-100 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {doctor?.location || "India"}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {doctor?.name || "Doctor"}
              </h1>
              <p className="text-blue-100 text-sm mt-1 max-w-xl">
                {doctor?.specialty} {doctor?.qualification && `• ${doctor?.qualification}`} •{" "}
                {doctor?.experience_years} years experience
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 text-center border border-white/20 min-w-[120px]">
                <div className="text-xs uppercase tracking-wider text-blue-200 font-medium">Fee</div>
                <div className="text-2xl font-bold mt-0.5">₹{doctor?.consultation_fee || 500}</div>
              </div>
              <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 text-center border border-white/20 min-w-[120px]">
                <div className="text-xs uppercase tracking-wider text-blue-200 font-medium">Rating</div>
                <div className="text-xl font-bold mt-0.5 text-amber-300 flex items-center justify-center gap-1">
                  <Star className="w-5 h-5 fill-amber-300" />
                  {doctor?.average_rating ? doctor.average_rating.toFixed(1) : "New"}
                </div>
              </div>
              <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 text-center border border-white/20 min-w-[120px]">
                <div className="text-xs uppercase tracking-wider text-blue-200 font-medium">Status</div>
                <div className="text-sm font-semibold mt-1 text-emerald-300 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Verified
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Open Openings */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Open Slots Available
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 dark:text-white">
                {metrics?.available_slots ?? 0}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                Live on MediAI
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Ready to be booked by patients instantly
            </p>
          </div>

          {/* Card 2: Booked Appointments */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Booked Appointments
              </span>
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 dark:text-white">
                {metrics?.booked_appointments ?? appointments.length}
              </span>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                Confirmed
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Booked automatically via conversational agent
            </p>
          </div>

          {/* Card 3: Total Slots */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Published
              </span>
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 dark:text-white">
                {metrics?.total_slots ?? 0}
              </span>
              <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                Total Inventory
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              All consultation openings published for patients
            </p>
          </div>

          {/* Card 4: Estimated Revenue */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Confirmed Revenue
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 dark:text-white">
                ₹{((metrics?.booked_appointments ?? appointments.length) * (doctor?.consultation_fee || 500)).toLocaleString()}
              </span>
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Est. Total
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Based on ₹{doctor?.consultation_fee || 500} / consultation
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab("slots")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2 cursor-pointer ${
              activeTab === "slots"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Publish & Manage Availability</span>
          </button>

          <button
            onClick={() => setActiveTab("appointments")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2 cursor-pointer ${
              activeTab === "appointments"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Patient Appointments ({appointments.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2 cursor-pointer ${
              activeTab === "profile"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Doctor Profile</span>
          </button>
        </div>

        {/* TAB 1: Availability Slot Manager */}
        {activeTab === "slots" && (
          <div className="space-y-6">
            {slotSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-3 text-emerald-800 dark:text-emerald-200 text-sm">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="font-semibold">Availability Synced</p>
                  <p className="text-xs mt-0.5">{slotSuccessMsg}</p>
                </div>
              </div>
            )}

            {slotActionError && (
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-start gap-3 text-red-800 dark:text-red-200 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-semibold">Action Failed</p>
                  <p className="text-xs mt-0.5">{slotActionError}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Slot Builder */}
              <div className="lg:col-span-7 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                      <span>Select Date & Add Openings</span>
                    </h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Active Calendar
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Select a date below, choose available time slots, and publish them so the MediAI agent can offer them to patients.
                  </p>
                </div>

                {/* Date Picker row */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Consultation Date
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      min={todayStr || undefined}
                      value={selectedDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    {todayStr && (
                      <button
                        type="button"
                        onClick={() => handleDateChange(todayStr)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition ${
                          selectedDate === todayStr
                            ? "bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-cyan-300"
                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900"
                        }`}
                      >
                        Today
                      </button>
                    )}
                    {tomorrowStr && (
                      <button
                        type="button"
                        onClick={() => handleDateChange(tomorrowStr)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition ${
                          selectedDate === tomorrowStr
                            ? "bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-cyan-300"
                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900"
                        }`}
                      >
                        Tomorrow
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Selection shortcuts */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Standard Time Slots
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={handleSelectAllMorning}
                        className="text-blue-600 dark:text-cyan-400 hover:underline"
                      >
                        + All Morning
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={handleSelectAllAfternoon}
                        className="text-blue-600 dark:text-cyan-400 hover:underline"
                      >
                        + All Afternoon
                      </button>
                      {selectedTimesToPublish.length > 0 && (
                        <>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={handleClearSelected}
                            className="text-red-500 hover:underline"
                          >
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {STANDARD_SLOTS.map((time) => {
                      const isSelected = selectedTimesToPublish.includes(time);
                      const alreadyInDb = slots.some((s) => s.time === time);

                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() => toggleSlotSelection(time)}
                          className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition flex items-center justify-center gap-1 cursor-pointer ${
                            isSelected
                              ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                              : alreadyInDb
                              ? "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 line-through"
                              : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-blue-400 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                          <span>{time}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Time Adder */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Add Custom Time
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={customTimeInput}
                      onChange={(e) => setCustomTimeInput(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTime}
                      disabled={!customTimeInput}
                      className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1 disabled:opacity-50 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Slot</span>
                    </button>
                  </div>
                </div>

                {/* Publish Action Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handlePublishSlots}
                    disabled={publishing || selectedTimesToPublish.length === 0}
                    className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {publishing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Publishing Slots...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          Publish {selectedTimesToPublish.length} Selected Slot(s) for {selectedDate}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column: Existing Slots */}
              <div className="lg:col-span-5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Slots on {selectedDate}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Real-time availability status
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold font-mono">
                    {slots.length} Total
                  </span>
                </div>

                {slots.length === 0 ? (
                  <div className="py-12 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
                    <Clock className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      No availability published yet for {selectedDate}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                      Use the slot builder on the left to select time slots and publish them for patient bookings.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {slots.map((slot) => {
                      const isBooked = slot.status === "BOOKED";
                      const isHeld = slot.status === "HELD";

                      return (
                        <div
                          key={slot.id}
                          className={`p-3 rounded-2xl border transition flex items-center justify-between ${
                            isBooked
                              ? "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60"
                              : isHeld
                              ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60"
                              : "bg-slate-50/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-2.5 h-2.5 rounded-full ${
                                isBooked
                                  ? "bg-blue-600 animate-pulse"
                                  : isHeld
                                  ? "bg-amber-500 animate-ping"
                                  : "bg-emerald-500"
                              }`}
                            />
                            <div>
                              <div className="text-sm font-bold text-slate-900 dark:text-white">
                                {slot.time}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                {slot.date}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                isBooked
                                  ? "bg-blue-600 text-white"
                                  : isHeld
                                  ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                                  : "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                              }`}
                            >
                              {isHeld ? "HELD (IN CHECKOUT)" : slot.status}
                            </span>

                            {!isBooked && !isHeld && (
                              <button
                                type="button"
                                onClick={() => handleDeleteSlot(slot.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                                title="Remove slot"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Patient Appointments Booked by AI */}
        {activeTab === "appointments" && (
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                  <span>Patient Visits Booked via MediAI</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Confirmed consultations scheduled by patients through the MediAI assistant.
                </p>
              </div>

              <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-cyan-300 border border-blue-200 dark:border-blue-800">
                {appointments.length} Total Bookings
              </span>
            </div>

            {appointments.length === 0 ? (
              <div className="py-16 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3">
                <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  No patient visits booked yet
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Once patients interact with MediAI and book one of your published consultation slots, their confirmed booking will immediately appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4">Booking ID</th>
                      <th className="py-3 px-4">Patient Code / ID</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Time Slot</th>
                      <th className="py-3 px-4">Consultation Fee</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Booked At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {appointments.map((appt) => (
                      <tr key={appt.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-600 dark:text-cyan-400">
                          #{appt.id}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {appt.patient_name || "Guest Patient"}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {appt.patient_id} {appt.patient_phone ? `• ${appt.patient_phone}` : ""}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-medium">
                          {appt.date}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {appt.time}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-emerald-600 dark:text-emerald-400">
                          ₹{doctor?.consultation_fee || 500}
                        </td>
                        <td className="py-3.5 px-4">
                          {appt.status === "CONFIRMED" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              CONFIRMED
                            </span>
                          ) : appt.status === "PENDING_PAYMENT" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              <Clock className="w-3 h-3 animate-spin" />
                              PAYMENT PENDING
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              {appt.status}
                            </span>
                          )}
                        </td>
                        <td
                          suppressHydrationWarning
                          className="py-3.5 px-4 text-slate-400 dark:text-slate-500 font-mono text-[11px]"
                        >
                          {appt.created_at ? new Date(appt.created_at).toLocaleString() : "Just now"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Doctor Profile & Clinical Details */}
        {activeTab === "profile" && (
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                <span>Doctor Profile Settings</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Keep your credentials, location, and fee up to date. MediAI uses this data when recommending you to patients.
              </p>
            </div>

            {profileSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-3 text-emerald-800 dark:text-emerald-200 text-sm">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="font-semibold">Profile Saved</p>
                  <p className="text-xs mt-0.5">{profileSuccessMsg}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Doctor Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Medical Specialty *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.specialty}
                    onChange={(e) => setProfileForm({ ...profileForm, specialty: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Clinic / Hospital City & Location *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.location}
                    onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Qualifications
                  </label>
                  <input
                    type="text"
                    value={profileForm.qualification}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, qualification: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Experience (Years)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={profileForm.experience_years}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, experience_years: Number(e.target.value) })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Consultation Fee (₹ INR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={profileForm.consultation_fee}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, consultation_fee: Number(e.target.value) })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Clinical Bio / Philosophy
                  </label>
                  <textarea
                    rows={3}
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-2 shadow-md shadow-blue-500/20 disabled:opacity-50 transition cursor-pointer"
                >
                  {savingProfile ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>Save Profile Changes</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
