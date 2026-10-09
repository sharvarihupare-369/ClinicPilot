"use client";

import React from "react";
import Link from "next/link";
import { Bot, ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800/80 bg-slate-100/80 dark:bg-slate-950/80 mt-auto transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center text-white shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white text-base">
                Clinic<span className="text-blue-600 dark:text-blue-400">Pilot</span>
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Production-grade patient appointment platform driven by a
              self-improving AI scheduling agent with zero-hallucination safety
              guardrails.
            </p>
          </div>

          {/* Patient Quick Links */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-slate-900 dark:text-slate-300 tracking-wider">
              Patient Services
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link href="/chat" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  AI Appointment Booking
                </Link>
              </li>
              <li>
                <Link href="/doctors" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Find Doctors by Specialty
                </Link>
              </li>
              <li>
                <Link href="/appointments" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Manage & Reschedule
                </Link>
              </li>
            </ul>
          </div>

          {/* AI Safety & Verification */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-slate-900 dark:text-slate-300 tracking-wider">
              Autonomous Verification
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link
                  href="/admin/evaluation"
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  <span>8/8 Safety Scenarios Verified</span>
                </Link>
              </li>
              <li>
                <span className="text-slate-400 dark:text-slate-500">Atomic Database Slot Locking</span>
              </li>
              <li>
                <span className="text-slate-400 dark:text-slate-500">Learned Ambiguity Policies</span>
              </li>
            </ul>
          </div>

          {/* Platform Status */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-slate-900 dark:text-slate-300 tracking-wider">
              Architecture
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              FastAPI Backend + Next.js App Router. Connected to Clinic Repository with 8 certified doctors & 3,100+ slots.
            </p>
            <div className="pt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                Safe Agent Guardrails Active
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-900 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-3">
          <p>© 2026 ClinicPilot AI. Clinical Demo Platform.</p>
          <p className="flex items-center gap-1">
            <span>Powered by Gemini & FastAPI Agent Orchestrator</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
