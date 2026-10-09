"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  Mail,
  Lock,
  MapPin,
  Award,
  Clock,
  IndianRupee,
  FileText,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Check,
  X,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const POPULAR_SPECIALTIES = [
  "General Physician",
  "Cardiologist",
  "Dermatologist",
  "Pediatrician",
  "Neurologist",
  "Orthopedic",
  "Gynecologist",
  "Psychiatrist",
  "ENT Specialist",
];

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export default function DoctorRegisterPage() {
  const router = useRouter();
  const { registerDoctor } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    specialty: "General Physician",
    customSpecialty: "",
    location: "",
    qualification: "",
    experience: "",
    consultation_fee: "",
    bio: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    customSpecialty: false,
    location: false,
    experience: false,
    consultation_fee: false,
  });

  const markTouched = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // Password Validation Rules
  const passwordCriteria = useMemo(() => {
    const pwd = formData.password;
    return {
      minLength: pwd.length >= 8,
      hasUpper: /[A-Z]/.test(pwd),
      hasLower: /[a-z]/.test(pwd),
      hasNumber: /[0-9]/.test(pwd),
      hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
    };
  }, [formData.password]);

  const isPasswordStrong =
    passwordCriteria.minLength &&
    passwordCriteria.hasUpper &&
    passwordCriteria.hasLower &&
    passwordCriteria.hasNumber &&
    passwordCriteria.hasSpecial;

  const passwordStrengthScore = useMemo(() => {
    let score = 0;
    if (passwordCriteria.minLength) score++;
    if (passwordCriteria.hasUpper) score++;
    if (passwordCriteria.hasLower) score++;
    if (passwordCriteria.hasNumber) score++;
    if (passwordCriteria.hasSpecial) score++;
    return score;
  }, [passwordCriteria]);

  const isEmailValid = EMAIL_REGEX.test(formData.email.trim());

  // Field-level Error Calculations
  const cleanRawName = formData.name.replace(/^dr\.?\s*/i, "").trim();

  const nameError = useMemo(() => {
    if (!formData.name && !cleanRawName) return "Full name is required.";
    if (cleanRawName.length < 2) return "Please enter a valid full name (at least 2 letters).";
    return null;
  }, [formData.name, cleanRawName]);

  const emailError = useMemo(() => {
    if (!formData.email.trim()) return "Email address is required.";
    if (!isEmailValid) return "Please enter a valid email address (e.g. doctor@example.com).";
    return null;
  }, [formData.email, isEmailValid]);

  const passwordError = useMemo(() => {
    if (!formData.password) return "Password is required.";
    if (!isPasswordStrong) return "Password must satisfy all 5 security requirements above.";
    return null;
  }, [formData.password, isPasswordStrong]);

  const customSpecialtyError = useMemo(() => {
    if (formData.specialty === "Other" && !formData.customSpecialty.trim()) {
      return "Please specify your medical specialty.";
    }
    return null;
  }, [formData.specialty, formData.customSpecialty]);

  const locationError = useMemo(() => {
    if (!formData.location.trim()) return "Clinic or hospital location is required.";
    if (formData.location.trim().length < 3) return "Please enter a complete location (e.g. Bandra, Mumbai).";
    return null;
  }, [formData.location]);

  const expMatch = formData.experience.match(/\d+/);
  const experienceError = useMemo(() => {
    if (!formData.experience.trim()) return "Years of experience is required.";
    if (!expMatch) return "Please enter a valid number of years (e.g. 5 or 8 years).";
    const num = parseInt(expMatch[0], 10);
    if (num < 0 || num > 70) return "Please enter a realistic experience between 0 and 70 years.";
    return null;
  }, [formData.experience, expMatch]);

  const feeMatch = formData.consultation_fee.match(/\d+/);
  const feeError = useMemo(() => {
    if (!formData.consultation_fee.trim()) return "Consultation fee is required.";
    if (!feeMatch) return "Please enter a valid consultation fee amount (e.g. 500).";
    const num = parseInt(feeMatch[0], 10);
    if (num < 0) return "Consultation fee cannot be negative.";
    return null;
  }, [formData.consultation_fee, feeMatch]);

  const shouldShow = (field: keyof typeof touched) => {
    return hasSubmitted || touched[field];
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    setError(null);

    // Validate all fields
    if (
      nameError ||
      emailError ||
      passwordError ||
      customSpecialtyError ||
      locationError ||
      experienceError ||
      feeError
    ) {
      setError("Please fix the highlighted errors below before submitting.");
      return;
    }

    const parsedExp = expMatch ? parseInt(expMatch[0], 10) : 0;
    const parsedFee = feeMatch ? parseInt(feeMatch[0], 10) : 500;

    setIsLoading(true);

    try {
      const selectedSpecialty =
        formData.specialty === "Other"
          ? formData.customSpecialty.trim() || "General Physician"
          : formData.specialty;

      // Always prefix with "Dr. "
      const finalDoctorName = `Dr. ${cleanRawName}`;

      await registerDoctor({
        name: finalDoctorName,
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        specialty: selectedSpecialty,
        location: formData.location.trim(),
        qualification: formData.qualification.trim() || undefined,
        experience_years: parsedExp,
        consultation_fee: parsedFee,
        bio: formData.bio.trim() || undefined,
      });

      router.push("/doctor/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Registration failed. Please verify your details and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] py-12 px-4 sm:px-6 lg:px-8 text-slate-800 dark:text-slate-100 flex items-center justify-center relative overflow-hidden transition-colors">
      {/* Background Decorative Glows */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl w-full relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 via-sky-500 to-cyan-400 p-[1.5px] shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
              <div className="w-full h-full rounded-2xl bg-white dark:bg-[#0d1322] flex items-center justify-center text-blue-600 dark:text-cyan-400">
                <Stethoscope className="w-6 h-6" />
              </div>
            </div>
            <span className="font-bold text-2xl tracking-tight text-slate-900 dark:text-white">
              ClinicPilot
            </span>
          </Link>
          {/* <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80 text-blue-600 dark:text-blue-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Doctor Provider Portal</span>
          </div> */}
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Register as a Doctor
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Publish your schedule to MediAI's live booking network and receive automated appointments from patients.
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-white/90 dark:bg-[#0f172a]/90 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800/90 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-blue-900/10 transition-colors">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/80 flex items-start gap-3 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to register</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* Account Credentials */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Account Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Doctor Name with locked "Dr." prefix */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Full Name *
                  </label>
                  <div className="flex rounded-xl shadow-sm">
                    <span
                      className={`inline-flex items-center px-3 rounded-l-xl border border-r-0 text-xs font-bold select-none transition ${shouldShow("name") && nameError
                          ? "border-red-400 bg-red-50 dark:bg-red-950/40 text-red-600"
                          : "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-cyan-400"
                        }`}
                    >
                      Dr.
                    </span>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Rajesh Mehta"
                        value={formData.name.replace(/^dr\.?\s*/i, "")}
                        onBlur={() => markTouched("name")}
                        onChange={(e) => {
                          setFormData({ ...formData, name: e.target.value });
                        }}
                        className={`w-full pl-3 pr-3 py-2.5 rounded-r-xl border text-sm focus:outline-none focus:ring-2 transition ${shouldShow("name") && nameError
                            ? "border-red-400 dark:border-red-500 bg-red-50/20 dark:bg-red-950/20 focus:ring-red-400"
                            : shouldShow("name") && !nameError
                              ? "border-emerald-400 dark:border-emerald-500 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-emerald-400"
                              : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-blue-500 dark:focus:ring-blue-400"
                          }`}
                      />
                    </div>
                  </div>
                  {shouldShow("name") && nameError ? (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 dark:text-red-400 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{nameError}</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      "Dr." prefix is added automatically to your profile.
                    </p>
                  )}
                </div>

                {/* Email Address with validation check */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      placeholder="doctor@example.com"
                      value={formData.email}
                      onBlur={() => markTouched("email")}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className={`w-full pl-10 pr-9 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition ${shouldShow("email") && emailError
                          ? "border-red-400 dark:border-red-500 bg-red-50/20 dark:bg-red-950/20 focus:ring-red-400"
                          : shouldShow("email") && !emailError
                            ? "border-emerald-400 dark:border-emerald-500 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-emerald-400"
                            : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-blue-500 dark:focus:ring-blue-400"
                        }`}
                    />
                    {formData.email.length > 0 && (
                      <span className="absolute right-3 top-3">
                        {isEmailValid ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <X className="w-4 h-4 text-red-400" />
                        )}
                      </span>
                    )}
                  </div>
                  {shouldShow("email") && emailError && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 dark:text-red-400 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{emailError}</span>
                    </div>
                  )}
                </div>

                {/* Strong Password Field with live strength criteria */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Password *
                    </label>
                    {formData.password.length > 0 && (
                      <span
                        className={`text-[11px] font-semibold ${isPasswordStrong
                            ? "text-emerald-500"
                            : passwordStrengthScore >= 3
                              ? "text-amber-500"
                              : "text-red-400"
                          }`}
                      >
                        {isPasswordStrong
                          ? "Strong Password ✓"
                          : passwordStrengthScore >= 3
                            ? "Moderate Password"
                            : "Weak Password"}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a strong password"
                      value={formData.password}
                      onBlur={() => markTouched("password")}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className={`w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition ${shouldShow("password") && passwordError
                          ? "border-red-400 dark:border-red-500 bg-red-50/20 dark:bg-red-950/20 focus:ring-red-400"
                          : shouldShow("password") && isPasswordStrong
                            ? "border-emerald-400 dark:border-emerald-500 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-emerald-400"
                            : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-blue-500 dark:focus:ring-blue-400"
                        }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password Strength Meter Bar */}
                  {formData.password.length > 0 && (
                    <div className="mt-2 w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${passwordStrengthScore <= 2
                            ? "w-1/3 bg-red-500"
                            : passwordStrengthScore <= 4
                              ? "w-2/3 bg-amber-500"
                              : "w-full bg-emerald-500"
                          }`}
                      />
                    </div>
                  )}

                  {/* Password Requirements Checklist */}
                  <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div
                      className={`flex items-center gap-1.5 ${passwordCriteria.minLength
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-slate-400 dark:text-slate-500"
                        }`}
                    >
                      {passwordCriteria.minLength ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <span className="w-3.5 h-3.5 text-center leading-none text-slate-300">•</span>
                      )}
                      <span>At least 8 characters</span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 ${passwordCriteria.hasUpper
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-slate-400 dark:text-slate-500"
                        }`}
                    >
                      {passwordCriteria.hasUpper ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <span className="w-3.5 h-3.5 text-center leading-none text-slate-300">•</span>
                      )}
                      <span>One uppercase letter (A-Z)</span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 ${passwordCriteria.hasLower
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-slate-400 dark:text-slate-500"
                        }`}
                    >
                      {passwordCriteria.hasLower ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <span className="w-3.5 h-3.5 text-center leading-none text-slate-300">•</span>
                      )}
                      <span>One lowercase letter (a-z)</span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 ${passwordCriteria.hasNumber
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-slate-400 dark:text-slate-500"
                        }`}
                    >
                      {passwordCriteria.hasNumber ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <span className="w-3.5 h-3.5 text-center leading-none text-slate-300">•</span>
                      )}
                      <span>One number (0-9)</span>
                    </div>

                    <div
                      className={`flex items-center gap-1.5 sm:col-span-2 ${passwordCriteria.hasSpecial
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-slate-400 dark:text-slate-500"
                        }`}
                    >
                      {passwordCriteria.hasSpecial ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <span className="w-3.5 h-3.5 text-center leading-none text-slate-300">•</span>
                      )}
                      <span>One special character (e.g. !@#$%^&*)</span>
                    </div>
                  </div>

                  {shouldShow("password") && passwordError && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 dark:text-red-400 mt-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{passwordError}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Medical Credentials */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Professional Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Specialty *
                  </label>
                  <div className="relative">
                    <Stethoscope className="absolute left-3.5 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                    <select
                      value={formData.specialty}
                      onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                      className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition appearance-none cursor-pointer"
                    >
                      {POPULAR_SPECIALTIES.map((spec) => (
                        <option key={spec} value={spec} className="dark:bg-slate-900">
                          {spec}
                        </option>
                      ))}
                      <option value="Other" className="dark:bg-slate-900">
                        Other (Custom)
                      </option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {formData.specialty === "Other" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Specify Specialty *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Oncologist"
                      value={formData.customSpecialty}
                      onBlur={() => markTouched("customSpecialty")}
                      onChange={(e) =>
                        setFormData({ ...formData, customSpecialty: e.target.value })
                      }
                      className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition ${shouldShow("customSpecialty") && customSpecialtyError
                          ? "border-red-400 dark:border-red-500 bg-red-50/20 dark:bg-red-950/20 focus:ring-red-400"
                          : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-blue-500 dark:focus:ring-blue-400"
                        }`}
                    />
                    {shouldShow("customSpecialty") && customSpecialtyError && (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 dark:text-red-400 mt-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{customSpecialtyError}</span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Clinic / Hospital City & Location *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. Bandra West, Mumbai"
                      value={formData.location}
                      onBlur={() => markTouched("location")}
                      onChange={(e) =>
                        setFormData({ ...formData, location: e.target.value })
                      }
                      className={`w-full pl-10 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition ${shouldShow("location") && locationError
                          ? "border-red-400 dark:border-red-500 bg-red-50/20 dark:bg-red-950/20 focus:ring-red-400"
                          : shouldShow("location") && !locationError
                            ? "border-emerald-400 dark:border-emerald-500 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-emerald-400"
                            : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-blue-500 dark:focus:ring-blue-400"
                        }`}
                    />
                  </div>
                  {shouldShow("location") && locationError && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 dark:text-red-400 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{locationError}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Qualifications (Optional)
                  </label>
                  <div className="relative">
                    <Award className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="MBBS, MD, DM"
                      value={formData.qualification}
                      onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition"
                    />
                  </div>
                </div>

                {/* Experience text field without up/down spinner arrows */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Experience (Years) *
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 5 or 8 years"
                      value={formData.experience}
                      onBlur={() => markTouched("experience")}
                      onChange={(e) =>
                        setFormData({ ...formData, experience: e.target.value })
                      }
                      className={`w-full pl-10 pr-3 py-2.5 rounded-xl border text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-2 transition ${shouldShow("experience") && experienceError
                          ? "border-red-400 dark:border-red-500 bg-red-50/20 dark:bg-red-950/20 focus:ring-red-400"
                          : shouldShow("experience") && !experienceError
                            ? "border-emerald-400 dark:border-emerald-500 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-emerald-400"
                            : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-blue-500 dark:focus:ring-blue-400"
                        }`}
                    />
                  </div>
                  {shouldShow("experience") && experienceError ? (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 dark:text-red-400 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{experienceError}</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      Enter years of clinical practice (e.g. 5, 10, or 12 years).
                    </p>
                  )}
                </div>

                {/* Consultation Fee without up/down spinner arrows */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Consultation Fee (₹ INR) *
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 500"
                      value={formData.consultation_fee}
                      onBlur={() => markTouched("consultation_fee")}
                      onChange={(e) =>
                        setFormData({ ...formData, consultation_fee: e.target.value })
                      }
                      className={`w-full pl-10 pr-3 py-2.5 rounded-xl border text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-2 transition ${shouldShow("consultation_fee") && feeError
                          ? "border-red-400 dark:border-red-500 bg-red-50/20 dark:bg-red-950/20 focus:ring-red-400"
                          : shouldShow("consultation_fee") && !feeError
                            ? "border-emerald-400 dark:border-emerald-500 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-emerald-400"
                            : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 focus:ring-blue-500 dark:focus:ring-blue-400"
                        }`}
                    />
                  </div>
                  {shouldShow("consultation_fee") && feeError && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 dark:text-red-400 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{feeError}</span>
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Bio / Short Profile (Optional)
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <textarea
                      rows={3}
                      placeholder="Brief background on clinical expertise, clinic hours, or patient care philosophy..."
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Activation notice */}
            <div className="p-3.5 rounded-2xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Instant Profile Activation</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Your medical profile will be activated immediately upon registration. You can manage your consultation hours and availability in your doctor workspace next.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white font-semibold text-sm shadow-xl shadow-blue-500/25 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <span>Registering Doctor Profile...</span>
              ) : (
                <>
                  <span>Create Doctor Account & Open Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer switch */}
          <div className="mt-6 pt-6 border-t border-slate-200/80 dark:border-slate-800/80 text-center text-xs text-slate-500 dark:text-slate-400">
            Already registered as a doctor?{" "}
            <Link
              href="/doctor/login"
              className="font-semibold text-blue-600 dark:text-cyan-400 hover:underline"
            >
              Sign In to Doctor Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
