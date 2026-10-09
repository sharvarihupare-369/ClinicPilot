"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  X,
  Maximize2,
  RotateCcw,
  Bot,
  User,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  MapPin,
  Calendar,
  Clock,
  Activity,
  Keyboard,
  Radio,
  IndianRupee,
  Globe,
  ChevronDown,
} from "lucide-react";
import { sendChatMessage, holdSlot } from "@/lib/api";
import PaymentModal from "@/components/payment/PaymentModal";
import { useLanguage, LANGUAGES } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import type {
  ChatResponse,
  ActivityStep,
  ConfirmationCard,
  SessionStateSummary,
} from "@/lib/types";
import { formatDate, formatTime } from "@/lib/utils";

interface Message {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  activity_steps?: ActivityStep[];
  confirmation_card?: ConfirmationCard | null;
  tool_calls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: Record<string, unknown>;
  }>;
}

interface AgentConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "voice" | "typing";
}

export default function AgentConnectionModal({
  isOpen,
  onClose,
  initialMode = "typing",
}: AgentConnectionModalProps) {
  const { currentLanguage, setLanguageByCode } = useLanguage();
  const { user, profile } = useAuth();
  const [mode, setMode] = useState<"voice" | "typing">(initialMode);
  const patientId = profile?.patient_code || (user ? `pat_${user.id}` : "pat_user_101");
  const [sessionId, setSessionId] = useState("sess_active_patient");

  useEffect(() => {
    setSessionId(`sess_${profile?.patient_code || user?.id || "pat"}_${Date.now()}`);
  }, [profile, user]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechMuted, setSpeechMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const langDropdownRef = useRef<HTMLDivElement>(null);

  const idCounter = useRef(10);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Refs for bulletproof Speech Synthesis & state synchronization across turns
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const speakTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startListeningRef = useRef<(() => void) | null>(null);
  const modeRef = useRef(mode);
  const speechMutedRef = useRef(speechMuted);
  const isModalOpenRef = useRef(isOpen);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    speechMutedRef.current = speechMuted;
  }, [speechMuted]);

  useEffect(() => {
    isModalOpenRef.current = isOpen;
  }, [isOpen]);

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

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "agent_welcome",
      sender: "agent",
      text: "Hello! I am ClinicPilot AI, your clinical scheduling assistant. How can I assist you with your booking today?",
      timestamp: "Just now",
    },
  ]);
  const [, setCurrentState] = useState<SessionStateSummary | null>(null);

  // Razorpay payment checkout modal state
  const [paymentModalState, setPaymentModalState] = useState<{
    appointmentId: number;
    patientId: string;
    doctorName: string;
    date: string;
    time: string;
    amountPaise: number;
  } | null>(null);
  const [isHoldingSlot, setIsHoldingSlot] = useState(false);

  const handleInitiatePayment = async (card: ConfirmationCard) => {
    if (!card.doctor_id) {
      handleSendMessage("Yes, please confirm and book this appointment");
      return;
    }
    try {
      setIsHoldingSlot(true);
      const holdRes = await holdSlot({
        patient_id: patientId,
        doctor_id: card.doctor_id,
        date: card.date,
        time: card.time,
      });
      setPaymentModalState({
        appointmentId: holdRes.appointment_id,
        patientId: patientId,
        doctorName: card.doctor || card.doctor_name || holdRes.doctor_name,
        date: card.date,
        time: card.time,
        amountPaise: holdRes.amount,
      });
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: { message?: string }; message?: string } } })
          ?.response?.data?.detail?.message ||
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not reserve this slot. It may have already been booked or held by another patient.";
      alert(errorMsg);
    } finally {
      setIsHoldingSlot(false);
    }
  };

  // Audio & Recognition Cleanup helpers
  const stopSpeaking = useCallback(() => {
    if (speakTimeoutRef.current) {
      clearTimeout(speakTimeoutRef.current);
      speakTimeoutRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
      activeUtteranceRef.current = null;
      (window as any).__clinicpilot_utterance = null; // eslint-disable-line @typescript-eslint/no-explicit-any
      setIsSpeaking(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // Text to Speech with Chrome multi-turn fix and garbage-collection protection
  const speakText = useCallback(
    (text: string) => {
      if (speechMutedRef.current || typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      // Clear any pending speak timeout or active speech
      stopSpeaking();

      const cleaned = text
        .replace(/[*_#`[\]()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleaned) return;

      // Chrome/Safari Web Speech Bug Fix:
      // window.speechSynthesis.cancel() is asynchronous.
      // Calling speak() in the same event tick will cause the pending cancel()
      // to immediately kill the new utterance, causing silence on all turns after the 1st!
      // A 150ms delay lets cancel() settle and flushes the native audio engine.
      speakTimeoutRef.current = setTimeout(() => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        if (!isModalOpenRef.current) return;

        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }

          const utterance = new SpeechSynthesisUtterance(cleaned);
          utterance.rate = 0.92; // Slower rate gives the voice more natural pacing and pauses
          utterance.pitch = 1.05; // Slightly higher pitch reduces the flat robotic monotone
          utterance.lang = currentLanguage.locale || "en-US";

          // Select a premium or native voice to avoid robotic sounds
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            const langPrefix = utterance.lang.split("-")[0];
            let voice = voices.find(
              (v) => v.lang.startsWith(langPrefix) && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Online") || v.name.includes("Premium") || v.name.includes("Siri") || v.name.includes("Daniel") || v.name.includes("Samantha"))
            );
            if (!voice) {
              voice = voices.find((v) => v.lang.startsWith(langPrefix));
            }
            if (!voice) {
              voice = voices.find((v) => v.name.includes("Google US English") || v.name.includes("Samantha"));
            }
            if (voice) {
              utterance.voice = voice;
            }
          }

          // Prevent Chrome garbage-collection bug by pinning the utterance
          activeUtteranceRef.current = utterance;
          (window as any).__clinicpilot_utterance = utterance; // eslint-disable-line @typescript-eslint/no-explicit-any

          utterance.onstart = () => {
            setIsSpeaking(true);

            // Chrome heartbeat: keeps long responses alive beyond 15s limit
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            heartbeatRef.current = setInterval(() => {
              if (typeof window !== "undefined" && "speechSynthesis" in window) {
                if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
                  window.speechSynthesis.pause();
                  window.speechSynthesis.resume();
                }
              }
            }, 7000);
          };

          utterance.onend = () => {
            if (heartbeatRef.current) {
              clearInterval(heartbeatRef.current);
              heartbeatRef.current = null;
            }
            activeUtteranceRef.current = null;
            (window as any).__clinicpilot_utterance = null; // eslint-disable-line @typescript-eslint/no-explicit-any
            setIsSpeaking(false);

            // In voice mode: once agent finishes speaking, automatically resume listening for the patient's next question!
            if (modeRef.current === "voice" && isModalOpenRef.current) {
              setTimeout(() => {
                if (modeRef.current === "voice" && isModalOpenRef.current) {
                  startListeningRef.current?.();
                }
              }, 400);
            }
          };

          utterance.onerror = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (heartbeatRef.current) {
              clearInterval(heartbeatRef.current);
              heartbeatRef.current = null;
            }
            activeUtteranceRef.current = null;
            (window as any).__clinicpilot_utterance = null; // eslint-disable-line @typescript-eslint/no-explicit-any
            setIsSpeaking(false);

            if (event.error !== "canceled" && event.error !== "interrupted") {
              console.warn("TTS error:", event.error);
            }
          };

          window.speechSynthesis.speak(utterance);
        } catch (err) {
          console.warn("TTS execution failed:", err);
          setIsSpeaking(false);
        }
      }, 150);
    },
    [currentLanguage.locale, stopSpeaking]
  );

  // Send message to backend agent
  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      const text = (textToSend || inputMessage).trim();
      if (!text || isLoading) return;

      // Check if user is confirming an active appointment confirmation card
      const isConfirmPhrase =
        /^(yes,? please confirm|confirm and book|confirm appointment|yes,? please book|book it|confirm booking|please book|yes,? book it|yes please)/i.test(
          text
        );
      if (isConfirmPhrase) {
        const recentCard = [...messages]
          .reverse()
          .find((m) => m.confirmation_card)?.confirmation_card;
        if (recentCard && recentCard.doctor_id) {
          handleInitiatePayment(recentCard);
          setInputMessage("");
          setInterimTranscript("");
          return;
        }
      }

      stopSpeaking();
      const userCount = ++idCounter.current;
      const nowTime = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const userMsg: Message = {
        id: `user_${userCount}`,
        sender: "user",
        text,
        timestamp: nowTime,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputMessage("");
      setInterimTranscript("");
      setIsLoading(true);

      try {
        const res: ChatResponse = await sendChatMessage({
          patient_id: patientId,
          message: text,
          session_id: sessionId,
          language: currentLanguage.englishName,
        });

        if (res.state) {
          setCurrentState(res.state);
        }

        const agentCount = ++idCounter.current;
        const agentMsg: Message = {
          id: `agent_${agentCount}`,
          sender: "agent",
          text: res.response,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          activity_steps: res.activity_steps,
          confirmation_card: res.confirmation_card,
          tool_calls: res.tool_calls,
        };

        setMessages((prev) => [...prev, agentMsg]);

        if (
          res.tool_calls?.some(
            (tc) =>
              ["book_appointment", "cancel_appointment", "reschedule_appointment"].includes(tc.name) &&
              tc.result?.success
          ) ||
          res.response?.toLowerCase().includes("successfully booked") ||
          res.response?.toLowerCase().includes("successfully cancelled")
        ) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("appointment-changed"));
          }
        }

        if (modeRef.current === "voice" || !speechMutedRef.current) {
          speakText(res.response);
        }
      } catch {
        const errCount = ++idCounter.current;
        const errMsg: Message = {
          id: `error_${errCount}`,
          sender: "agent",
          text: "I couldn't connect with the AI agent. Please verify that the ClinicPilot backend server is running on port 8000.",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [inputMessage, isLoading, patientId, sessionId, speakText, stopSpeaking]
  );

  // Start listening (Speech-to-Text)
  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (!SpeechRec) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Safari, or switch to typing mode.");
      return;
    }

    stopSpeaking();
    stopListening();

    try {
      const recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = currentLanguage.locale || "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        setInterimTranscript("");
      };

      recognition.onresult = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (interim) {
          setInterimTranscript(interim);
        }

        if (final) {
          setInterimTranscript(final);
          stopListening();
          handleSendMessage(final);
        }
      };

      recognition.onerror = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        console.warn("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn("Speech recognition start failed:", err);
      setIsListening(false);
    }
  }, [currentLanguage.locale, stopSpeaking, stopListening, handleSendMessage]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Toggle voice recognition
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  // Handle mode activation on open
  useEffect(() => {
    if (!isOpen) return;

    if (initialMode === "voice") {
      const timer = setTimeout(() => {
        startListening();
      }, 300);
      return () => {
        clearTimeout(timer);
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {
            // ignore
          }
          recognitionRef.current = null;
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      };
    } else {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => {
        clearTimeout(timer);
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {
            // ignore
          }
          recognitionRef.current = null;
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      };
    }
  }, [isOpen, initialMode, startListening]);

  const handleResetSession = () => {
    stopListening();
    stopSpeaking();
    const count = ++idCounter.current;
    setSessionId(`sess_${count}`);
    setCurrentState(null);
    setMessages([
      {
        id: `agent_reset_${count}`,
        sender: "agent",
        text: "Session refreshed! How can I help you book, reschedule, or cancel a clinic appointment?",
        timestamp: "Just now",
      },
    ]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/75 dark:bg-black/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Dialog Box */}
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#0c101d] border border-slate-200 dark:border-blue-500/30 rounded-3xl shadow-[0_20px_70px_rgba(0,0,0,0.55),0_0_50px_rgba(59,130,246,0.2)] overflow-hidden flex flex-col max-h-[90vh] z-10 transition-all">
        {/* Top Glow Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400" />

        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-[#0f1424]/90 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-500/25">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base tracking-tight">
                  ClinicPilot AI Agent
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-600/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Connected
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Safe clinical booking • Deterministic guardrails active
              </p>
            </div>
          </div>

          {/* Mode Switch Tabs & Actions */}
          <div className="flex items-center gap-2">
            {/* Mode switch pill */}
            <div className="flex items-center bg-slate-200/80 dark:bg-slate-900 rounded-xl p-0.5 border border-slate-300 dark:border-slate-800 text-xs">
              <button
                onClick={() => {
                  setMode("voice");
                  startListening();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${mode === "voice"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Voice</span>
              </button>
              <button
                onClick={() => {
                  stopListening();
                  setMode("typing");
                  setTimeout(() => inputRef.current?.focus(), 100);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${mode === "typing"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>Typing</span>
              </button>
            </div>

            {/* TTS Mute Toggle */}
            <button
              onClick={() => {
                if (!speechMuted) stopSpeaking();
                setSpeechMuted(!speechMuted);
              }}
              title={speechMuted ? "Unmute Voice" : "Mute Voice"}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors"
            >
              {speechMuted ? (
                <VolumeX className="w-4 h-4 text-rose-500" />
              ) : (
                <Volume2 className="w-4 h-4 text-blue-500 dark:text-cyan-400" />
              )}
            </button>

            {/* Reset */}
            <button
              onClick={handleResetSession}
              title="Reset conversation session"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Expand to Full Page */}
            <Link
              href="/chat"
              title="Open full page chat"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </Link>

            {/* Close */}
            <button
              onClick={onClose}
              title="Close"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* AI Assistant Status Strip */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-[#0a0e19] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-slate-800 dark:text-slate-200">
              Live Clinical Assistant
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
            <span className="text-[11px] text-slate-500 hidden sm:inline">Verified zero-hallucination scheduling</span>
          </div>
          {/* Language Selector Dropdown */}
          <div className="relative" ref={langDropdownRef}>
            <button
              onClick={() => setLangDropdownOpen(!langDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              title="Select Agent Language"
            >
              <Globe className="w-3.5 h-3.5 text-blue-500 dark:text-cyan-400" />
              <span className="font-semibold">{currentLanguage.nativeName}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {langDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-2 shadow-xl z-50 max-h-60 overflow-y-auto">
                <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 px-2 py-1 tracking-wider">
                  Select Language
                </div>
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguageByCode(lang.code);
                      setLangDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${currentLanguage.code === lang.code
                      ? "bg-blue-600/10 dark:bg-blue-600/20 text-blue-600 dark:text-blue-300 font-semibold"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white"
                      }`}
                  >
                    <span>{lang.nativeName}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                      {lang.locale}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* VOICE MODE DISPLAY (When voice mode is active) */}
        {mode === "voice" && (
          <div className="px-6 py-5 bg-gradient-to-b from-blue-50/70 to-slate-50 dark:from-[#0d1424] dark:to-[#0a0e1a] border-b border-slate-200 dark:border-slate-800/80 flex flex-col items-center justify-center text-center relative overflow-hidden">
            {/* Ambient circular glow */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12)_0%,transparent_70%)] pointer-events-none" />

            {/* Glowing Voice Orb */}
            <div className="relative my-3 flex items-center justify-center">
              {isListening && (
                <div className="absolute w-28 h-28 rounded-full bg-blue-500/20 dark:bg-blue-500/30 animate-ping pointer-events-none" />
              )}
              {isSpeaking && (
                <div className="absolute w-28 h-28 rounded-full bg-emerald-500/20 dark:bg-emerald-500/30 animate-pulse pointer-events-none" />
              )}

              <button
                onClick={toggleListening}
                className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-95 ${isListening
                    ? "bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-rose-500/35 ring-4 ring-rose-400/30"
                    : isSpeaking
                      ? "bg-gradient-to-tr from-emerald-500 to-teal-500 text-white shadow-emerald-500/35 ring-4 ring-emerald-400/30 animate-bounce"
                      : "bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 text-white shadow-blue-500/35 hover:scale-105"
                  }`}
                title={isListening ? "Click to stop listening" : "Click to speak"}
              >
                {isListening ? (
                  <MicOff className="w-8 h-8" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </button>
            </div>

            {/* Voice Status Indicator */}
            <div className="mt-2 space-y-1">
              <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2">
                {isListening ? (
                  <>
                    <Radio className="w-4 h-4 text-rose-500 animate-pulse" />
                    <span className="text-rose-500 font-bold">Listening to you... Speak now</span>
                  </>
                ) : isSpeaking ? (
                  <>
                    <Volume2 className="w-4 h-4 text-emerald-500 animate-pulse" />
                    <span className="text-emerald-500 font-bold">ClinicPilot is speaking...</span>
                  </>
                ) : isLoading ? (
                  <>
                    <Sparkles className="w-4 h-4 text-blue-500 animate-spin" />
                    <span className="text-blue-500">Agent is thinking & checking slots...</span>
                  </>
                ) : (
                  <span>Click microphone to talk with ClinicPilot</span>
                )}
              </div>

              {/* Dynamic Transcript Banner */}
              {interimTranscript && (
                <div className="mt-2 px-4 py-2 rounded-xl bg-blue-100/80 dark:bg-blue-950/70 border border-blue-300 dark:border-blue-500/40 text-blue-900 dark:text-blue-200 text-xs font-mono max-w-lg shadow-sm">
                  &ldquo;{interimTranscript}&rdquo;
                </div>
              )}
            </div>
          </div>
        )}

        {/* MESSAGES SCROLL AREA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 max-h-[380px] bg-slate-50/40 dark:bg-[#090d16]/70">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
            >
              {msg.sender === "agent" && (
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] space-y-2 ${msg.sender === "user" ? "items-end" : "items-start"
                  }`}
              >
                {/* Agent Activity Steps */}
                {msg.activity_steps && msg.activity_steps.length > 0 && (
                  <div className="bg-slate-100 dark:bg-slate-900/90 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800 text-xs space-y-1 shadow-sm">
                    <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="w-3 h-3 text-blue-500 animate-pulse" />
                      <span>Deterministic Guardrails & Tools</span>
                    </div>
                    {msg.activity_steps.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 font-mono"
                      >
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[9px] shrink-0 font-bold">
                          ✓
                        </span>
                        <span>{step.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.sender === "user"
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-sm shadow-md shadow-blue-500/15"
                      : "bg-white dark:bg-[#121624] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-tl-sm shadow-sm"
                    }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* Confirmation Card */}
                  {msg.confirmation_card && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl p-3 border border-blue-500/30 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Confirmation Required
                        </span>
                        <span className="text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-500/25">
                          Safety Lock
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Doctor</span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {msg.confirmation_card.doctor || msg.confirmation_card.doctor_name}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Specialty</span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {msg.confirmation_card.specialty}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-blue-500" />
                          <span>{formatDate(msg.confirmation_card.date)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          <span>{formatTime(msg.confirmation_card.time)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{msg.confirmation_card.location}</span>
                      </div>

                      {msg.confirmation_card.consultation_fee !== undefined && (
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200 dark:border-slate-800">
                          <span className="text-slate-500">Consultation Fee</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            ₹{msg.confirmation_card.consultation_fee}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleInitiatePayment(msg.confirmation_card!)}
                          disabled={isLoading || isHoldingSlot}
                          className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-medium py-1.5 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20 active:scale-98 disabled:opacity-50 cursor-pointer"
                        >
                          <IndianRupee className="w-3.5 h-3.5" />
                          <span>
                            {isHoldingSlot
                              ? "Reserving Slot..."
                              : `Pay & Confirm Visit ${msg.confirmation_card.consultation_fee
                                ? `(₹${msg.confirmation_card.consultation_fee})`
                                : ""
                              }`}
                          </span>
                        </button>
                        <button
                          onClick={() => handleSendMessage("No, let me change the time")}
                          disabled={isLoading || isHoldingSlot}
                          className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
                        >
                          Modify
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  className={`text-[10px] text-slate-400 dark:text-slate-500 px-1 font-mono ${msg.sender === "user" ? "text-right" : "text-left"
                    }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === "user" && (
                <div className="w-7 h-7 rounded-xl bg-slate-300 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400 text-xs py-2 px-2">
              <div className="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-500 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 animate-spin" />
              </div>
              <span className="font-mono">ClinicPilot AI is formulating safe answer...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 bg-slate-100/70 dark:bg-[#0c101d] border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-semibold text-slate-400 shrink-0 uppercase tracking-wider pl-1">
            Try:
          </span>
          {[
            currentLanguage.starterPrompt,
            "Show available doctors in Pune",
            "Book tomorrow at 10 AM",
            "Check my appointments",
          ].map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(prompt)}
              disabled={isLoading}
              className="shrink-0 text-[11px] bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-500/40 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700/80 transition-colors shadow-xs"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* INPUT BOX */}
        <div className="p-3 sm:p-4 bg-white dark:bg-[#0b0e1a] border-t border-slate-200 dark:border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            {/* Quick Mic toggle */}
            <button
              type="button"
              onClick={() => {
                if (mode === "voice") {
                  toggleListening();
                } else {
                  setMode("voice");
                  startListening();
                }
              }}
              className={`p-3 rounded-2xl border transition-all ${isListening
                  ? "bg-rose-500 text-white border-rose-600 shadow-md animate-pulse"
                  : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:text-blue-600 dark:hover:text-cyan-400"
                }`}
              title={isListening ? "Listening... click to stop" : "Switch to voice speech"}
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Text input field */}
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message (e.g., 'I need a cardiologist in Pune next week')..."
              disabled={isLoading}
              className="flex-1 bg-slate-50 dark:bg-[#121626] border border-slate-200 dark:border-slate-750 focus:border-blue-500 dark:focus:border-blue-500 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors shadow-inner"
            />

            {/* Send button */}
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white p-3 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95 active:scale-95 transition-all shadow-md shadow-blue-500/20"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {paymentModalState && (
        <PaymentModal
          appointmentId={paymentModalState.appointmentId}
          patientId={paymentModalState.patientId}
          doctorName={paymentModalState.doctorName}
          date={paymentModalState.date}
          time={paymentModalState.time}
          amountPaise={paymentModalState.amountPaise}
          onSuccess={(aptId) => {
            const docName = paymentModalState.doctorName;
            const aptDate = paymentModalState.date;
            const aptTime = paymentModalState.time;
            setPaymentModalState(null);

            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("appointment-changed", { detail: { appointment_id: aptId } })
              );
            }

            setMessages((prev) => [
              ...prev,
              {
                id: `msg_paid_${Date.now()}`,
                sender: "agent",
                text: `Payment confirmed! Appointment #${aptId} with ${docName} on ${formatDate(
                  aptDate
                )} at ${formatTime(aptTime)} has been officially booked and confirmed. We look forward to seeing you!`,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ]);
          }}
          onFailure={(reason) => {
            setPaymentModalState(null);
            setMessages((prev) => [
              ...prev,
              {
                id: `msg_fail_${Date.now()}`,
                sender: "agent",
                text: `Payment could not be completed: ${reason}. The temporary slot reservation has been released. Please choose another available slot whenever you're ready!`,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ]);
          }}
          onClose={() => setPaymentModalState(null)}
        />
      )}
    </div>
  );
}
