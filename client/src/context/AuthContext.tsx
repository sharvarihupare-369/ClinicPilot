"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authLogin, authRegister, authMe } from "@/lib/api";
import type { UserResponse, AuthProfile, TokenResponse } from "@/lib/types";

interface AuthContextType {
  user: UserResponse | null;
  profile: AuthProfile | null;
  token: string | null;
  role: "DOCTOR" | "PATIENT" | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<TokenResponse>;
  registerDoctor: (payload: {
    name: string;
    email: string;
    password: string;
    specialty: string;
    location: string;
    qualification?: string;
    experience_years?: number;
    bio?: string;
    consultation_fee?: number;
  }) => Promise<TokenResponse>;
  registerPatient: (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<TokenResponse>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<"DOCTOR" | "PATIENT" | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync token, user, and profile from localStorage on client load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedToken = localStorage.getItem("clinicpilot_token");
      const savedRole = localStorage.getItem("clinicpilot_role") as "DOCTOR" | "PATIENT" | null;
      const savedUserStr = localStorage.getItem("clinicpilot_user");
      const savedProfileStr = localStorage.getItem("clinicpilot_profile");

      if (savedUserStr) {
        try {
          setUser(JSON.parse(savedUserStr));
        } catch {
          // ignore corrupted JSON
        }
      }
      if (savedProfileStr) {
        try {
          setProfile(JSON.parse(savedProfileStr));
        } catch {
          // ignore corrupted JSON
        }
      }

      if (savedToken) {
        setToken(savedToken);
        setRole(savedRole);
        // Verify token in background with backend
        authMe()
          .then((me) => {
            setUser(me);
            if (me.profile) setProfile(me.profile);
            localStorage.setItem("clinicpilot_user", JSON.stringify(me));
            if (me.profile) {
              localStorage.setItem("clinicpilot_profile", JSON.stringify(me.profile));
            }
          })
          .catch((err: unknown) => {
            // ONLY log out if backend explicitly returned 401 Unauthorized
            const axiosErr = err as { response?: { status?: number } };
            if (axiosErr?.response?.status === 401) {
              localStorage.removeItem("clinicpilot_token");
              localStorage.removeItem("clinicpilot_role");
              localStorage.removeItem("clinicpilot_user");
              localStorage.removeItem("clinicpilot_profile");
              setToken(null);
              setRole(null);
              setUser(null);
              setProfile(null);
            }
          })
          .finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  const handleAuthSuccess = (res: TokenResponse) => {
    setToken(res.access_token);
    setRole(res.role);
    if (res.profile) setProfile(res.profile);
    const userObj = {
      id: res.user_id,
      email: res.email,
      role: res.role,
      created_at: new Date().toISOString(),
      profile: res.profile,
    };
    setUser(userObj);
    if (typeof window !== "undefined") {
      localStorage.setItem("clinicpilot_token", res.access_token);
      localStorage.setItem("clinicpilot_role", res.role);
      localStorage.setItem("clinicpilot_user", JSON.stringify(userObj));
      if (res.profile) {
        localStorage.setItem("clinicpilot_profile", JSON.stringify(res.profile));
      }
    }
  };

  const login = async (email: string, password: string): Promise<TokenResponse> => {
    const res = await authLogin({ email, password });
    handleAuthSuccess(res);
    return res;
  };

  const registerDoctor = async (payload: {
    name: string;
    email: string;
    password: string;
    specialty: string;
    location: string;
    qualification?: string;
    experience_years?: number;
    bio?: string;
    consultation_fee?: number;
  }): Promise<TokenResponse> => {
    const res = await authRegister({
      ...payload,
      role: "DOCTOR",
    });
    handleAuthSuccess(res);
    return res;
  };

  const registerPatient = async (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<TokenResponse> => {
    const res = await authRegister({
      ...payload,
      role: "PATIENT",
    });
    handleAuthSuccess(res);
    return res;
  };

  const logout = useCallback(() => {
    setUser(null);
    setProfile(null);
    setToken(null);
    setRole(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("clinicpilot_token");
      localStorage.removeItem("clinicpilot_role");
      localStorage.removeItem("clinicpilot_user");
      localStorage.removeItem("clinicpilot_profile");
    }
  }, []);

  const refreshProfile = async () => {
    if (!token) return;
    try {
      const me = await authMe();
      setUser(me);
      if (me.profile) setProfile(me.profile);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        token,
        role,
        isAuthenticated: !!token,
        isLoading,
        login,
        registerDoctor,
        registerPatient,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
