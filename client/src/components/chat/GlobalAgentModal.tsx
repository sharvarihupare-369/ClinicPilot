"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AgentConnectionModal from "./AgentConnectionModal";
import { useAuth } from "@/context/AuthContext";

export default function GlobalAgentModal() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"voice" | "typing">("voice");

  useEffect(() => {
    const handleOpen = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!isAuthenticated) {
        router.push("/patient/login?redirect=/chat");
        return;
      }
      const targetMode = e.detail?.mode || "voice";
      setMode(targetMode);
      setIsOpen(true);
    };
    window.addEventListener("open-agent-modal", handleOpen);
    return () => window.removeEventListener("open-agent-modal", handleOpen);
  }, [isAuthenticated, router]);

  return (
    <AgentConnectionModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      initialMode={mode}
    />
  );
}
