"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Globe,
  Moon,
  Sun,
  Mic,
  ChevronDown,
  Menu,
  X,
  Stethoscope,
  User,
  LogOut,
  Lock,
} from "lucide-react";
import { useLanguage, LANGUAGES } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentLanguage, setLanguageByCode } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, role, profile, logout } = useAuth();
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeHash, setActiveHash] = useState<string>("");
  const langDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setLangDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.location.hash) {
      setActiveHash(window.location.hash);
    }

    const handleHashChange = () => {
      setActiveHash(window.location.hash);
    };

    window.addEventListener("hashchange", handleHashChange);

    // If on home page, observe intersection of #features and #how-it-works sections
    if (pathname === "/") {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveHash(`#${entry.target.id}`);
            }
          });
        },
        { threshold: 0.3 }
      );

      const featuresEl = document.getElementById("features");
      const howItWorksEl = document.getElementById("how-it-works");

      if (featuresEl) observer.observe(featuresEl);
      if (howItWorksEl) observer.observe(howItWorksEl);

      return () => {
        window.removeEventListener("hashchange", handleHashChange);
        observer.disconnect();
      };
    }

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [pathname]);

  const checkIsActive = (link: { href: string; label: string }) => {
    if (link.label === "Doctors") {
      return pathname.startsWith("/doctors");
    }
    if (link.label === "My Appointments") {
      return pathname.startsWith("/appointments");
    }
    if (link.label === "Chat") {
      return pathname.startsWith("/chat");
    }
    if (link.label === "Features") {
      return pathname === "/" && activeHash === "#features";
    }
    if (link.label === "How it Works") {
      return pathname === "/" && activeHash === "#how-it-works";
    }
    return false;
  };

  const openAgent = (mode: "voice" | "typing" = "voice") => {
    if (!isAuthenticated) {
      router.push("/patient/login?redirect=/chat");
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-agent-modal", { detail: { mode } }));
    }
  };

  const navLinks = [
    { href: "/#features", label: "Features", locked: false },
    { href: "/#how-it-works", label: "How it Works", locked: false },
    { href: "/doctors", label: "Doctors", locked: false },
    {
      href: isAuthenticated ? "/appointments" : "/patient/login?redirect=/appointments",
      label: "My Appointments",
      locked: !isAuthenticated,
    },
    {
      href: isAuthenticated ? "/chat" : "/patient/login?redirect=/chat",
      label: "Chat",
      locked: !isAuthenticated,
    },
  ];


  return (
    <header className="sticky top-0 z-[100] bg-white/90 dark:bg-[#090d16]/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo matching Screenshot 1 */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 via-sky-500 to-cyan-400 p-[1.5px] shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full rounded-full bg-slate-50 dark:bg-[#0d1322] flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Stethoscope className="w-5 h-5" />
              </div>
            </div>
            <span className="font-bold text-xl text-slate-900 dark:text-white tracking-tight">
              ClinicPilot
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => {
              const active = checkIsActive(link);
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => {
                    if (link.href.includes("#")) {
                      setActiveHash(link.href.substring(link.href.indexOf("#")));
                    }
                  }}
                  className={`relative py-1.5 text-sm transition-all duration-200 flex items-center gap-1.5 ${
                    active
                      ? "text-blue-600 dark:text-cyan-400 font-semibold"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-medium"
                  }`}
                >
                  <span>{link.label}</span>
                  {link.locked && (
                    <Lock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                  )}
                  {active && (
                    <span className="absolute -bottom-1.5 left-0 right-0 h-[2.5px] bg-gradient-to-r from-blue-600 via-sky-400 to-cyan-400 rounded-full shadow-[0_0_8px_rgba(56,189,248,0.6)] animate-in fade-in duration-200" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Header Actions */}
          <div className="hidden md:flex items-center gap-4">
            {/* Dark/Light Mode Toggle Button */}
            <button
              suppressHydrationWarning
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 dark:bg-slate-900/90 dark:border-slate-800 text-amber-500 dark:text-amber-400 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>

            {/* Role-based Auth Display or Sign In buttons */}
            {isAuthenticated && role === "PATIENT" ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/appointments"
                  className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-slate-700 hover:text-blue-600 dark:text-slate-200 dark:hover:text-cyan-400 transition-colors"
                  title="View Appointments"
                >
                  <User className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                  <span className="max-w-[130px] truncate font-semibold">{profile?.name || "My Account"}</span>
                </Link>
                <button
                  onClick={logout}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : isAuthenticated && role === "DOCTOR" ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/doctor/dashboard"
                  className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-slate-700 hover:text-blue-600 dark:text-slate-200 dark:hover:text-cyan-400 transition-colors"
                  title="Doctor Dashboard"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                  <span className="max-w-[130px] truncate font-semibold">{profile?.name || "Dr. Dashboard"}</span>
                </Link>
                <button
                  onClick={logout}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/patient/login"
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-300 hover:border-blue-300 dark:hover:border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <User className="w-3.5 h-3.5 text-blue-500" />
                  <span>Sign In</span>
                </Link>
                <Link
                  href="/doctor/dashboard"
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors hidden lg:flex items-center gap-1"
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>Doctor</span>
                </Link>
              </div>
            )}

            {/* Primary CTA: "Try the Agent" */}
            <button
              onClick={() => openAgent("voice")}
              className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Talk to Agent</span>
            </button>
          </div>

          {/* Mobile hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <button
              suppressHydrationWarning
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-amber-500 dark:text-amber-400 cursor-pointer"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>
            <Link
              href={isAuthenticated ? (role === "DOCTOR" ? "/doctor/dashboard" : "/appointments") : "/patient/login"}
              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-blue-600 dark:text-cyan-400 text-xs font-semibold"
            >
              {isAuthenticated ? "Account" : "Sign In"}
            </Link>
            <button
              onClick={() => openAgent("voice")}
              className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer"
            >
              <Mic className="w-3 h-3" />
              <span>Agent</span>
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090d16] px-4 py-4 space-y-2">
          {navLinks.map((link) => {
            const active = checkIsActive(link);
            return (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => {
                  if (link.href.includes("#")) {
                    setActiveHash(link.href.substring(link.href.indexOf("#")));
                  }
                  setMobileMenuOpen(false);
                }}
                className={`text-sm font-medium py-2 px-3 rounded-xl flex items-center justify-between transition-colors ${
                  active
                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-cyan-400 font-semibold border-l-4 border-blue-600 dark:border-cyan-400"
                    : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <span>{link.label}</span>
                {link.locked && (
                  <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                )}
              </Link>
            );
          })}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            {!isAuthenticated ? (
              <div className="flex gap-2 pt-1">
                <Link
                  href="/patient/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 text-center py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold shadow-sm"
                >
                  Patient Sign In
                </Link>
                <Link
                  href="/doctor/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 text-center py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold"
                >
                  Doctor Sign In
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between py-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Logged in as {profile?.name || role}
                </span>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="text-xs text-rose-500 font-semibold cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </header>
  );
}
