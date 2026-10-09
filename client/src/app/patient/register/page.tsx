"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  HeartPulse,
  Stethoscope,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function PatientRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PatientRegisterForm />
    </Suspense>
  );
}

function PatientRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");
  const { registerPatient } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    password: false,
  });

  // Password validation rules
  const passwordRules = [
    { label: "At least 8 characters", valid: formData.password.length >= 8 },
    { label: "One uppercase letter", valid: /[A-Z]/.test(formData.password) },
    { label: "One lowercase letter", valid: /[a-z]/.test(formData.password) },
    { label: "One number (0-9)", valid: /[0-9]/.test(formData.password) },
    { label: "One special character (!@#$%^&*)", valid: /[^A-Za-z0-9]/.test(formData.password) },
  ];
  const isPasswordStrong = passwordRules.every((r) => r.valid);

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const isEmailValid = emailRegex.test(formData.email.trim());

  // Phone validation (optional or 10 digits)
  const isPhoneValid = !formData.phone.trim() || /^\+?[0-9]{10,14}$/.test(formData.phone.replace(/[\s-]/g, ""));

  const isFormValid =
    formData.name.trim().length >= 2 &&
    isEmailValid &&
    isPhoneValid &&
    isPasswordStrong;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      name: true,
      email: true,
      phone: true,
      password: true,
    });
    setError(null);

    if (!formData.name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!isEmailValid) {
      setError("Please provide a valid email address.");
      return;
    }
    if (!isPhoneValid) {
      setError("Please enter a valid 10-digit contact number.");
      return;
    }
    if (!isPasswordStrong) {
      setError("Please ensure your password satisfies all security criteria.");
      return;
    }

    setIsLoading(true);

    try {
      await registerPatient({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        phone: formData.phone.trim() || undefined,
      });

      if (redirectUrl) {
        router.push(redirectUrl);
      } else {
        router.push("/appointments");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create account. Email may already be registered.");
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
            Create Patient Account
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Sign up to track your clinic visits, book doctor consultations with AI, and keep your health schedule organized.
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-blue-900/5 transition-colors">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/80 flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-xs">Registration Error</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, name: e.target.value }));
                    if (error) setError(null);
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                  placeholder="e.g. Priya Sharma"
                  className={`w-full bg-slate-50 dark:bg-slate-900/90 border rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition-colors ${
                    touched.name && !formData.name.trim()
                      ? "border-rose-400 focus:border-rose-500 ring-1 ring-rose-400/20"
                      : "border-slate-200 dark:border-slate-800 focus:border-blue-500"
                  }`}
                />
              </div>
              {touched.name && !formData.name.trim() && (
                <p className="text-[11px] text-rose-500 mt-1 pl-1">Full name is required</p>
              )}
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, email: e.target.value }));
                    if (error) setError(null);
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                  placeholder="name@example.com"
                  className={`w-full bg-slate-50 dark:bg-slate-900/90 border rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition-colors ${
                    touched.email && (!formData.email.trim() || !isEmailValid)
                      ? "border-rose-400 focus:border-rose-500 ring-1 ring-rose-400/20"
                      : "border-slate-200 dark:border-slate-800 focus:border-blue-500"
                  }`}
                />
              </div>
              {touched.email && !formData.email.trim() && (
                <p className="text-[11px] text-rose-500 mt-1 pl-1">Email address is required</p>
              )}
              {touched.email && formData.email.trim() && !isEmailValid && (
                <p className="text-[11px] text-rose-500 mt-1 pl-1">Please enter a valid email format</p>
              )}
            </div>

            {/* Contact Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Contact Phone Number <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, phone: e.target.value }));
                    if (error) setError(null);
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                  placeholder="+91 98765 43210"
                  className={`w-full bg-slate-50 dark:bg-slate-900/90 border rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition-colors ${
                    touched.phone && !isPhoneValid
                      ? "border-rose-400 focus:border-rose-500 ring-1 ring-rose-400/20"
                      : "border-slate-200 dark:border-slate-800 focus:border-blue-500"
                  }`}
                />
              </div>
              {touched.phone && !isPhoneValid && (
                <p className="text-[11px] text-rose-500 mt-1 pl-1">Please enter a valid 10-digit phone number</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Create Strong Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, password: e.target.value }));
                    if (error) setError(null);
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                  placeholder="••••••••"
                  className={`w-full bg-slate-50 dark:bg-slate-900/90 border rounded-2xl pl-10 pr-11 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition-colors ${
                    touched.password && !isPasswordStrong
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

              {/* Password Rules Checklist */}
              {formData.password.length > 0 && (
                <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    Password Requirements:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
                    {passwordRules.map((rule, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-1.5 ${
                          rule.valid ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {rule.valid ? (
                          <Check className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <X className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-semibold py-3 px-4 rounded-2xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <span className="text-xs">Creating account...</span>
              ) : (
                <>
                  <span className="text-sm">Register as Patient</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-center space-y-3 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              Already have an account?{" "}
              <Link
                href={`/patient/login${redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : ""}`}
                className="font-bold text-blue-600 dark:text-cyan-400 hover:underline"
              >
                Sign In
              </Link>
            </p>

            <div className="pt-1">
              <Link
                href="/doctor/register"
                className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <Stethoscope className="w-3.5 h-3.5 text-blue-500" />
                <span>Are you a doctor? Register as a Doctor Provider</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
