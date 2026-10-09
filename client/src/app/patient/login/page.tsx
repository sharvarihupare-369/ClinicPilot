"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User,
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  Stethoscope,
  HeartPulse,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function PatientLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PatientLoginForm />
    </Suspense>
  );
}

function PatientLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [touched, setTouched] = useState({
    email: false,
    password: false,
  });

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const isEmailValid = emailRegex.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setError(null);

    if (!email.trim() || !isEmailValid) {
      setError("Please provide a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await login(email.trim(), password);
      if (redirectUrl) {
        router.push(redirectUrl);
      } else if (res.role === "PATIENT") {
        router.push("/appointments");
      } else if (res.role === "DOCTOR") {
        router.push("/doctor/dashboard");
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Invalid email or password. Please verify your credentials.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-slate-50 dark:bg-[#070b14] py-12 px-4 sm:px-6 lg:px-8 text-slate-800 dark:text-slate-100 flex items-center justify-center relative overflow-hidden transition-colors">
      {/* Background Decorative Glows */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10 space-y-6">
        {/* Header Branding */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 via-sky-500 to-cyan-400 p-[1.5px] shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
              <div className="w-full h-full rounded-2xl bg-white dark:bg-[#0d1322] flex items-center justify-center text-blue-600 dark:text-cyan-400">
                <HeartPulse className="w-6 h-6" />
              </div>
            </div>
            <span className="font-bold text-2xl tracking-tight text-slate-900 dark:text-white">
              ClinicPilot
            </span>
          </Link>

          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Patient Sign In
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Access your confirmed clinic visits, manage bookings, and chat with your AI assistant.
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-blue-900/5 transition-colors">
          {redirectUrl && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-start gap-3 text-amber-800 dark:text-amber-200 text-xs shadow-sm">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-bold">Sign In Required</p>
                <p className="mt-0.5 opacity-90">
                  Please log in with your patient account to access the AI booking agent and manage your clinic appointments.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/80 flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-xs">Sign in failed</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                  placeholder="name@example.com"
                  className={`w-full bg-slate-50 dark:bg-slate-900/90 border rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition-colors ${
                    touched.email && (!email.trim() || !isEmailValid)
                      ? "border-rose-400 focus:border-rose-500 ring-1 ring-rose-400/20"
                      : "border-slate-200 dark:border-slate-800 focus:border-blue-500"
                  }`}
                />
              </div>
              {touched.email && !email.trim() && (
                <p className="text-[11px] text-rose-500 mt-1 pl-1">Email is required</p>
              )}
              {touched.email && email.trim() && !isEmailValid && (
                <p className="text-[11px] text-rose-500 mt-1 pl-1">Please enter a valid email address</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                  placeholder="••••••••"
                  className={`w-full bg-slate-50 dark:bg-slate-900/90 border rounded-2xl pl-10 pr-11 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition-colors ${
                    touched.password && !password
                      ? "border-rose-400 focus:border-rose-500 ring-1 ring-rose-400/20"
                      : "border-slate-200 dark:border-slate-800 focus:border-blue-500"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {touched.password && !password && (
                <p className="text-[11px] text-rose-500 mt-1 pl-1">Password is required</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-semibold py-3 px-4 rounded-2xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-50"
            >
              {isLoading ? (
                <span className="text-xs">Signing in...</span>
              ) : (
                <>
                  <span className="text-sm">Sign In as Patient</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-center space-y-3 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              New to ClinicPilot?{" "}
              <Link
                href={`/patient/register${redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : ""}`}
                className="font-bold text-blue-600 dark:text-cyan-400 hover:underline"
              >
                Create a Patient Account
              </Link>
            </p>

            <div className="pt-1">
              <Link
                href="/doctor/login"
                className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <Stethoscope className="w-3.5 h-3.5 text-blue-500" />
                <span>Are you a doctor? Sign in to Doctor Portal</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
