"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  MapPin,
  Calendar,
  Bot,
  Stethoscope,
  Star,
  Clock,
  IndianRupee,
  Award,
  Sparkles,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  Lock,
} from "lucide-react";
import { getDoctors } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function DoctorsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleBookWithAI = () => {
    if (!isAuthenticated) {
      router.push("/patient/login?redirect=/chat");
    } else {
      router.push("/chat");
    }
  };

  const {
    data: doctors = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["doctors", selectedSpecialty, selectedLocation],
    queryFn: () =>
      getDoctors({
        specialty: selectedSpecialty || undefined,
        location: selectedLocation || undefined,
      }),
  });

  // Extract unique specialties and cities from live PostgreSQL data
  const availableSpecialties = useMemo(() => {
    const defaultList = [
      "Cardiologist",
      "Dermatologist",
      "Pediatrician",
      "General Physician",
      "Neurologist",
      "Orthopedic",
      "Gynecologist",
      "Psychiatrist",
      "ENT Specialist",
    ];
    const liveSpecialties = doctors.map((d) => d.specialty).filter(Boolean);
    return Array.from(new Set([...defaultList, ...liveSpecialties])).sort();
  }, [doctors]);

  const availableLocations = useMemo(() => {
    const defaultList = ["Pune", "Mumbai", "Bangalore", "Delhi", "Hyderabad"];
    const liveLocations = doctors
      .map((d) => {
        const parts = d.location.split(",");
        return parts[parts.length - 1].trim();
      })
      .filter(Boolean);
    return Array.from(new Set([...defaultList, ...liveLocations])).sort();
  }, [doctors]);

  // Client-side search filtering
  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      if (!debouncedSearchTerm.trim()) return true;
      const term = debouncedSearchTerm.toLowerCase();
      return (
        doc.name.toLowerCase().includes(term) ||
        doc.specialty.toLowerCase().includes(term) ||
        doc.location.toLowerCase().includes(term) ||
        (doc.qualification && doc.qualification.toLowerCase().includes(term)) ||
        (doc.bio && doc.bio.toLowerCase().includes(term))
      );
    });
  }, [doctors, debouncedSearchTerm]);

  // Client-side pagination
  const totalPages = Math.ceil(filteredDoctors.length / itemsPerPage);
  const paginatedDoctors = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredDoctors.slice(start, start + itemsPerPage);
  }, [filteredDoctors, currentPage, itemsPerPage]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] text-slate-800 dark:text-slate-100 transition-colors py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800/80">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-cyan-300 text-xs font-semibold mb-3 shadow-sm">
              <Stethoscope className="w-3.5 h-3.5" />
              <span>Certified Healthcare Providers</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Our Medical Doctors & Specialists
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-2xl leading-relaxed">
              Explore certified clinic doctors, review clinical qualifications and consultation fees, and schedule an appointment directly or via conversational AI.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleBookWithAI}
              className="px-4 py-2.5 rounded-xl bg-blue-50/80 hover:bg-blue-100/90 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-700 dark:text-slate-100 border border-blue-200/80 dark:border-slate-700 font-semibold text-xs shadow-xs active:scale-95 transition-colors flex items-center gap-2 cursor-pointer"
            >
              {!isAuthenticated && <Lock className="w-3.5 h-3.5 text-blue-400 dark:text-slate-400" />}
              <Bot className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              <span>Match Doctor with AI</span>
            </button>

            <Link
              href="/doctor/register"
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-400 text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span>Join as Doctor</span>
            </Link>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by doctor name, specialty, condition, or location..."
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
          </div>

          {/* Specialty Dropdown */}
          <div className="relative sm:w-52">
            <select
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
              className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-3.5 pr-9 py-2.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer"
            >
              <option value="">All Specialties</option>
              {availableSpecialties.map((spec) => (
                <option key={spec} value={spec} className="dark:bg-slate-900">
                  {spec}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Location Dropdown */}
          <div className="relative sm:w-48">
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-3.5 pr-9 py-2.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer"
            >
              <option value="">All Locations</option>
              {availableLocations.map((loc) => (
                <option key={loc} value={loc} className="dark:bg-slate-900">
                  {loc}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Clear Filters Button */}
          {(selectedSpecialty || selectedLocation || searchTerm) && (
            <button
              onClick={() => {
                setSelectedSpecialty("");
                setSelectedLocation("");
                setSearchTerm("");
                setCurrentPage(1);
              }}
              className="px-3.5 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-500 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 transition"
            >
              Clear
            </button>
          )}
        </div>

        {/* Results Metadata Bar */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 font-medium">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>
              Showing{" "}
              <strong className="text-slate-900 dark:text-white font-bold">
                {filteredDoctors.length}
              </strong>{" "}
              doctor{filteredDoctors.length !== 1 ? "s" : ""}
            </span>
          </div>

          <button
            onClick={() => refetch()}
            className="text-xs text-blue-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Doctors Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="bg-white dark:bg-[#0f172a] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 animate-pulse space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-12 bg-slate-200 dark:bg-slate-800 rounded-xl" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-16 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3 p-6">
            <Stethoscope className="w-10 h-10 text-red-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Unable to load doctor catalog
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Please check your connection to the clinic server and try again.
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
            >
              Retry
            </button>
          </div>
        ) : filteredDoctors.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 p-6 shadow-sm">
            <Stethoscope className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              No doctors found matching criteria
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {searchTerm || selectedSpecialty || selectedLocation
                ? "Try clearing your specialty or city filter to view other certified practitioners."
                : "No registered doctors are currently available in the database."}
            </p>
            {(selectedSpecialty || selectedLocation || searchTerm) && (
              <button
                onClick={() => {
                  setSelectedSpecialty("");
                  setSelectedLocation("");
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-cyan-400 border border-blue-200 dark:border-blue-800 text-xs font-semibold hover:bg-blue-100 transition"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedDoctors.map((doc) => {
                const experienceLabel = doc.experience_years
                ? `${doc.experience_years} Years Experience`
                : "Verified Practice";

              const feeAmount = doc.consultation_fee || 500;

              return (
                <div
                  key={doc.id}
                  className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500/40 transition-all flex flex-col justify-between group shadow-sm hover:shadow-xl hover:shadow-blue-500/5"
                >
                  <div className="space-y-4">
                    {/* Top Row: Doctor Avatar + Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform flex-shrink-0">
                          {doc.name.replace(/^dr\.?\s*/i, "").charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors">
                            {doc.name}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                            {doc.qualification || "Registered Medical Practitioner"}
                          </p>
                        </div>
                      </div>

                      {doc.average_rating ? (
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 px-2 py-0.5 rounded-full flex-shrink-0" title={`${doc.total_reviews} reviews`}>
                          <Star className="w-3 h-3 fill-amber-500 dark:fill-amber-400 text-amber-500 dark:text-amber-400" />
                          <span>{doc.average_rating.toFixed(1)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full flex-shrink-0">
                          <span>New</span>
                        </div>
                      )}
                    </div>

                    {/* Specialty & Location Badges */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-cyan-300 font-semibold border border-blue-200/80 dark:border-blue-800/80">
                        {doc.specialty}
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1 border border-slate-200 dark:border-slate-700 font-medium">
                        <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                        <span className="truncate max-w-[150px]">{doc.location}</span>
                      </span>
                    </div>

                    {/* Clinical Details */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{experienceLabel}</span>
                      </div>
                      <div className="flex items-center justify-end gap-1 font-bold text-slate-900 dark:text-white">
                        <IndianRupee className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>{feeAmount}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{"/ visit"}</span>
                      </div>
                    </div>

                    {/* Short Bio */}
                    {doc.bio && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {doc.bio}
                      </p>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2">
                    <Link
                      href={`/doctors/${doc.id}`}
                      className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold text-center border border-slate-200 dark:border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>View Slots</span>
                    </Link>

                    <button
                      onClick={handleBookWithAI}
                      className="py-2.5 px-3 rounded-xl bg-blue-50/80 hover:bg-blue-100/90 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-700 dark:text-slate-100 text-xs font-semibold text-center border border-blue-200/80 dark:border-slate-700 shadow-xs active:scale-95 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {!isAuthenticated && <Lock className="w-3.5 h-3.5 text-blue-400 dark:text-slate-400" />}
                      <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                      <span>Book with AI</span>
                    </button>
                  </div>
                </div>
              );
            })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Doctor Call-To-Action Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-slate-900/60 border border-blue-500/20 p-8 sm:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Are you a licensed doctor or clinic director?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl">
              Publish your schedule to ClinicPilot&apos;s live booking network. Patients chatting with our voice and text agent can automatically discover and reserve your consultation openings.
            </p>
          </div>

          <Link
            href="/doctor/register"
            className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-lg shadow-blue-500/25 active:scale-95 transition flex items-center gap-2 self-start md:self-auto cursor-pointer"
          >
            <span>Register as a Doctor</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
