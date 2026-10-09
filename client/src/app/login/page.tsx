"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Stethoscope,
  HeartPulse,
} from "lucide-react";
import PatientLoginPage from "@/app/patient/login/page";

export default function GeneralLoginPage() {
  return <PatientLoginPage />;
}
