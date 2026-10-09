"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  Keyboard,
  Play,
  ShieldCheck,
  Database,
  RotateCcw,
  Globe2,
  Clock,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  Lock,
} from "lucide-react";
import { LANGUAGES } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import HeroAnimatedTerminal from "@/components/hero/HeroAnimatedTerminal";

export default function OnePageApp() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const openAgent = (mode: "voice" | "typing" = "voice") => {
    if (!isAuthenticated) {
      router.push("/patient/login?redirect=/chat");
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-agent-modal", { detail: { mode } }));
    }
  };

  // ── FAQ Accordion State ────────────────────────────────────────────────────
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "How does the AI ensure it never double-books an appointment?",
      a: "ClinicPilot uses atomic database transactions with row-level slot locking. The agent directly accesses real-time clinic schedules, confirming and reserving your slot with zero risk of overlap.",
    },
    {
      q: "Can the agent speak and understand Indian regional languages?",
      a: "Yes! ClinicPilot natively supports English, Hindi, Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, and Punjabi with conversational and voice transcription support.",
    },
    {
      q: "What if I change my mind during the conversation?",
      a: "Our agent features full state rollback and hesitation detection. If you say 'never mind', 'wait', or change doctors midway, previous confirmations are invalidated cleanly before any booking is committed.",
    },
    {
      q: "Can I manage, reschedule, or cancel my appointment later?",
      a: "Yes! You can view and manage all your scheduled appointments under My Appointments, or speak with the agent anytime to reschedule or release your slot with immediate confirmation.",
    },
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-[#080b14] text-slate-900 dark:text-slate-100 overflow-x-hidden selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* ── SECTION 1: HERO (Matching Screenshot 1) ────────────────────── */}
      <section className="relative pt-10 pb-20 md:pt-16 md:pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full isolate">
        {/* Soft background ambient radial glow matching screenshot */}
        <div className="absolute top-1/2 left-[58%] -translate-x-1/2 -translate-y-1/2 w-[750px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(79,70,229,0.14)_0%,rgba(37,99,235,0.08)_45%,transparent_75%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(79,70,229,0.28)_0%,rgba(37,99,235,0.18)_45%,transparent_75%)] blur-3xl pointer-events-none z-0" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center relative z-10">
          {/* Left Column: Headline & Controls matching Screenshot 1 */}
          <div className="lg:col-span-6 space-y-6">
            {/* Top pill tag: • Safe AI scheduling • Self-improving */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50/80 dark:bg-[#0e1424] border border-blue-200 dark:border-cyan-500/25 text-blue-700 dark:text-cyan-300 text-xs font-semibold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
              <span>Safe AI scheduling • Self-improving</span>
            </div>

            {/* Giant Title matching screenshot */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.12]">
              Book smarter. <br />
              <span className="bg-gradient-to-r from-[#6366f1] via-[#3b82f6] to-[#0ea5e9] dark:from-[#818cf8] dark:via-[#60a5fa] dark:to-[#38bdf8] bg-clip-text text-transparent">
                Never book <br />
                wrong.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              An AI scheduling agent for clinics, with deterministic safety
              guardrails and a closed-loop evaluation engine that finds its own
              failures and fixes them.
            </p>

            {/* Primary Action Buttons matching Screenshot */}
            <div className="flex flex-wrap items-center gap-3.5 pt-1">
              {/* Talk to the Agent Button */}
              <button
                type="button"
                onClick={() => openAgent("voice")}
                className="bg-gradient-to-r from-[#6366f1] via-[#3b82f6] to-[#06b6d4] hover:opacity-95 text-white font-medium text-sm px-6 py-3.5 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
              >
                {!isAuthenticated ? (
                  <Lock className="w-4 h-4 text-cyan-200" />
                ) : (
                  <Mic className="w-4 h-4 text-white" />
                )}
                <span>Talk to the Agent</span>
              </button>

              {/* Try Typing Button */}
              <button
                type="button"
                onClick={() => openAgent("typing")}
                className="bg-white hover:bg-slate-100 dark:bg-[#121624] dark:hover:bg-[#181f33] text-slate-700 dark:text-slate-200 font-medium text-sm px-6 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
              >
                {!isAuthenticated ? (
                  <Lock className="w-4 h-4 text-slate-400" />
                ) : (
                  <Keyboard className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                )}
                <span>Try typing</span>
              </button>
            </div>

            {/* Link: Browse Doctors */}
            <div>
              <a
                href="/doctors"
                className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <Play className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 fill-slate-500 dark:fill-slate-400" />
                <span>Browse Available Doctors & Cities</span>
              </a>
            </div>

            {/* Trust Badges matching Screenshot */}
            <div className="grid grid-cols-2 gap-2.5 pt-4 max-w-lg">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#0f1524] border border-slate-200 dark:border-[#1e2638] text-xs text-slate-700 dark:text-slate-300 shadow-sm">
                <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span>Confirms before booking</span>
              </div>
              {/* <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#0f1524] border border-slate-200 dark:border-[#1e2638] text-xs text-slate-700 dark:text-slate-300 shadow-sm">
                <Database className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span>Database-verified outcomes</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#0f1524] border border-slate-200 dark:border-[#1e2638] text-xs text-slate-700 dark:text-slate-300 shadow-sm">
                <RotateCcw className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span>Zero-regression improvements</span>
              </div> */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#0f1524] border border-slate-200 dark:border-[#1e2638] text-xs text-slate-700 dark:text-slate-300 shadow-sm">
                <Globe2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span>Speaks your language</span>
              </div>
            </div>
          </div>

          {/* Right Column: Animated Live Agent Card matching Screenshot exactly */}
          <div className="lg:col-span-6 relative flex justify-center items-center" id="hero-agent">
            <HeroAnimatedTerminal />
          </div>
        </div>
      </section>

      {/* ── SECTION 2: MULTILINGUAL SECTION (Matching Screenshot 2) ───── */}
      <section className="py-20 bg-slate-100/70 dark:bg-[#06080f] border-t border-slate-200 dark:border-slate-800/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Multilingual Pill */}
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-blue-50 dark:bg-[#11172a] border border-blue-200 dark:border-cyan-500/30 text-blue-700 dark:text-cyan-400 text-xs font-semibold mb-4 shadow-sm">
            Multilingual
          </div>

          {/* Heading */}
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Speak in Your Language
          </h2>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-2 max-w-2xl mx-auto">
            The agent understands, replies, and books in your language — with voice.
          </p>

          {/* 10 Language Showcase Cards (Non-interactive) */}
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mt-12 max-w-5xl mx-auto">
            {LANGUAGES.map((lang) => (
              <div
                key={lang.code}
                className="w-full sm:w-48 p-6 sm:p-7 rounded-3xl border text-center flex flex-col items-center justify-center gap-1.5 bg-white dark:bg-[#0d1222] border-slate-200 dark:border-slate-800/90 shadow-sm"
              >
                <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {lang.nativeName}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {lang.englishName}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: FEATURES & SAFETY GUARDRAILS (#features) ───────── */}
      <section id="features" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full border-t border-slate-200 dark:border-slate-800/80 transition-colors">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center px-3.5 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-3 shadow-sm">
            Deterministic Reliability
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Clinical Safety Built Into the Architecture
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Why hospitals and clinics trust ClinicPilot: four strict guardrails enforce clinical correctness regardless of model variations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-600/15 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Pre-Booking Consent</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              The agent will never execute a booking tool call without first presenting doctor, date, time, and clinic location for explicit patient approval.
            </p>
          </div>

          <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-600/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Database Authority</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              LLMs are notorious for hallucinating appointment times. ClinicPilot queries SQL slots directly and strictly blocks non-existent openings.
            </p>
          </div>

          <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-600/15 border border-purple-200 dark:border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Smart Disambiguation</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              When a patient holds multiple bookings and says &ldquo;cancel my appointment&rdquo;, the agent actively lists options and asks which one to modify.
            </p>
          </div>

          <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-600/15 border border-cyan-200 dark:border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Past-Time Prevention</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Rejects any attempt to book past dates or hours. Synchronizes seamlessly with reference calendar dates and regional clinic hours.
            </p>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: HOW IT WORKS (#how-it-works) ───────────────────── */}
      <section id="how-it-works" className="py-20 bg-slate-100/70 dark:bg-[#06080f] border-t border-slate-200 dark:border-slate-800/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-xs font-semibold uppercase text-cyan-600 dark:text-cyan-400 tracking-wider mb-2">
              Workflow
            </h2>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Three Simple Steps to Confirmed Care
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-7 border border-slate-200 dark:border-slate-800 space-y-3 relative shadow-sm">
              <div className="text-2xl font-black text-blue-600 dark:text-blue-500">01</div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">Speak Naturally</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Tell the agent what symptom you have, what doctor you want, or your preferred time. It automatically maps colloquial terms to certified specialties.
              </p>
            </div>

            <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-7 border border-slate-200 dark:border-slate-800 space-y-3 relative shadow-sm">
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-500">02</div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">Real-Time Verification</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                The agent invokes SQL repository tools to query doctors, inspect open slots, and filter out conflicts instantaneously.
              </p>
            </div>

            <div className="bg-white dark:bg-[#0c1222] rounded-2xl p-7 border border-slate-200 dark:border-slate-800 space-y-3 relative shadow-sm">
              <div className="text-2xl font-black text-cyan-600 dark:text-cyan-500">03</div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">Atomic Slot Reservation</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                You review a structured confirmation card. Upon your confirmation, the slot status is locked to BOOKED, and your visit is logged.
              </p>
            </div>
          </div>
        </div>
      </section>



      {/* ── SECTION 7: FAQ ACCORDION (#faq) ────────────────────────────── */}
      <section id="faq" className="py-20 bg-white dark:bg-[#06080f] border-t border-slate-200 dark:border-slate-800/80 transition-colors">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-xs font-semibold uppercase text-cyan-600 dark:text-cyan-400 tracking-wider mb-2">
              Questions
            </h2>
            <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Frequently Asked Questions
            </h3>
          </div>

          <div className="space-y-3.5">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="bg-slate-50/80 dark:bg-[#0c1222] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors shadow-sm"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full text-left p-5 flex items-center justify-between gap-4"
                  >
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-200/80 dark:border-slate-800/60 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

    </div>
  );
}
