"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Bot,
  User,
  CheckCircle2,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Activity,
  Layers,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Calendar,
  Clock,
  Sparkles,
  Stethoscope,
  Copy,
  Check,
  CalendarDays,
  Search,
  Lock,
  IndianRupee,
  Globe,
  ChevronDown,
} from "lucide-react";
import { sendChatMessage, holdSlot } from "@/lib/api";
import { useLanguage, LANGUAGES } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import PaymentModal from "@/components/payment/PaymentModal";
import type {
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

function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlMode = searchParams.get("mode");
  const { currentLanguage, setLanguageByCode } = useLanguage();
  const { user, profile, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/patient/login?redirect=/chat");
    }
  }, [authLoading, isAuthenticated, router]);

  // Internal patient & session IDs (used under the hood without displaying raw database keys)
  const patientId = profile?.patient_code || (user?.id ? `pat_${user.id}` : "pat_user_101");
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
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  
  const langDropdownRef = useRef<HTMLDivElement>(null);

  const idCounter = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Speech synthesis refs
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const speakTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const speechMutedRef = useRef(speechMuted);
  const startListeningRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    speechMutedRef.current = speechMuted;
  }, [speechMuted]);

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
      id: "initial_greeting",
      sender: "agent",
      text: "Hello! I am ClinicPilot, your clinical scheduling assistant. How can I help you today? You can search for doctors by specialty, check live open slots, or manage your bookings.",
      timestamp: "09:00 AM",
    },
  ]);
  const [currentState, setCurrentState] = useState<SessionStateSummary | null>(null);
  const [showStateDrawer, setShowStateDrawer] = useState(false);

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
        "Could not reserve this slot. It may have just been booked or held by another patient.";
      alert(errorMsg);
    } finally {
      setIsHoldingSlot(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

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

  // Text-to-Speech with Chrome multi-turn fix and garbage-collection protection
  const speakText = useCallback(
    (text: string) => {
      if (speechMutedRef.current || typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      stopSpeaking();

      const cleaned = text
        .replace(/[*_#`[\]()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleaned) return;

      speakTimeoutRef.current = setTimeout(() => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

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

          activeUtteranceRef.current = utterance;
          (window as any).__clinicpilot_utterance = utterance; // eslint-disable-line @typescript-eslint/no-explicit-any

          utterance.onstart = () => {
            setIsSpeaking(true);
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
      const currentCount = ++idCounter.current;
      const nowTime = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const userMsg: Message = {
        id: `user_${currentCount}`,
        sender: "user",
        text: text.trim(),
        timestamp: nowTime,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputMessage("");
      setIsLoading(true);

      try {
        const res = await sendChatMessage({
          patient_id: patientId,
          message: text.trim(),
          session_id: sessionId,
          language: currentLanguage.nativeName,
        });

        const replyText = res.response;
        const agentMsg: Message = {
          id: `agent_${currentCount}`,
          sender: "agent",
          text: replyText,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          activity_steps: res.activity_steps,
          confirmation_card: res.confirmation_card,
          tool_calls: res.tool_calls,
        };

        setMessages((prev) => [...prev, agentMsg]);
        if (res.state) {
          setCurrentState(res.state);
        }

        if (
          res.tool_calls?.some(
            (tc) =>
              ["book_appointment", "cancel_appointment", "reschedule_appointment"].includes(tc.name) &&
              tc.result?.success
          ) ||
          replyText.toLowerCase().includes("successfully booked") ||
          replyText.toLowerCase().includes("successfully cancelled")
        ) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("appointment-changed"));
          }
        }

        speakText(replyText);
      } catch (err) {
        console.error("Chat error:", err);
        const errorMsg: Message = {
          id: `error_${currentCount}`,
          sender: "agent",
          text: "I am having trouble reaching the scheduling server. Please verify the backend connection and try again.",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [inputMessage, isLoading, patientId, sessionId, speakText, stopSpeaking]
  );

  // Speech Recognition (Speech-to-Text)
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const startListening = useCallback(() => {
    stopSpeaking();
    stopListening();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Safari, or Edge.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = currentLanguage.locale || "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        setInterimTranscript("");
      };

      recognition.onresult = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
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

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Auto-activate based on URL parameter
  useEffect(() => {
    if (urlMode === "voice") {
      const timer = setTimeout(() => {
        startListening();
      }, 500);
      return () => clearTimeout(timer);
    } else if (urlMode === "typing") {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [urlMode, startListening]);

  const resetConversation = () => {
    stopListening();
    stopSpeaking();
    const newCount = ++idCounter.current;
    const newSessId = `sess_${newCount}`;
    setSessionId(newSessId);
    setCurrentState(null);
    setMessages([
      {
        id: "initial_greeting_reset",
        sender: "agent",
        text: "New consultation started! How can I assist you with your clinic appointment?",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
  };

  const copyMessage = (id: string, text: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    }
  };

  // Quick Action Starter Tiles
  const quickActionCards = [
    {
      icon: Stethoscope,
      title: "Cardiologist in Pune",
      desc: "Find available heart specialists with open consultation slots",
      prompt: "Find cardiologists in Pune with available appointment slots",
      color: "from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-cyan-400 border-blue-200 dark:border-blue-800/60",
    },
    {
      icon: CalendarDays,
      title: "Book for Tomorrow",
      desc: "Look up open morning or afternoon clinic slots for tomorrow",
      prompt: "Show available doctor appointment slots for tomorrow",
      color: "from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60",
    },
    {
      icon: Search,
      title: "Dermatologist Consultation",
      desc: "Check skin care specialists and clinic locations",
      prompt: "I need to see a dermatologist for a skin checkup",
      color: "from-purple-500/10 to-pink-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/60",
    },
    {
      icon: Calendar,
      title: "My Appointments",
      desc: "View, review, or reschedule your confirmed visits",
      prompt: "Check my scheduled appointments",
      color: "from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60",
    },
  ];

  // Dynamic Contextual Quick Prompt Chips
  const contextualChips = [
    "Show available doctors in Pune",
    "Morning slots tomorrow",
    "What are your consultation fees?",
    "Check my appointments",
    "Reschedule my booking",
  ];

  const isConversationEmpty = messages.length <= 1;

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 bg-slate-50 dark:bg-[#070b14]">
        <div className="max-w-md w-full bg-white dark:bg-[#0f172a] rounded-3xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Patient Access Locked
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              AI Agent Chat and live slot booking require an authenticated patient account. Redirecting you to patient sign in...
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/patient/login?redirect=/chat"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 active:scale-95 transition"
            >
              <span>Go to Patient Sign In</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-5rem)] max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-3 sm:py-4 transition-colors">
      {/* ── Polished Assistant Header (Clean, Patient-Friendly) ── */}
      <div className="relative z-50 bg-white/95 dark:bg-[#0c1222]/95 backdrop-blur-md rounded-2xl px-4 sm:px-6 py-3.5 mb-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border border-slate-200 dark:border-slate-800 shadow-sm transition-all">
        {/* Assistant Info */}
        <div className="flex items-center gap-3.5 shrink-0">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-md shadow-blue-500/20">
              <div className="w-full h-full rounded-2xl bg-white dark:bg-[#0d1322] flex items-center justify-center text-blue-600 dark:text-cyan-400 font-bold">
                <Bot className="w-5 h-5" />
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0c1222] animate-pulse" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
                ClinicPilot AI Assistant
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              Real-time clinic availability • Voice & Text • Instant atomic slot booking
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
          {/* Speaking Audio Indicator */}
          {isSpeaking && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 animate-pulse shadow-xs">
              <Volume2 className="w-3.5 h-3.5" />
              <span>Speaking response...</span>
            </span>
          )}

          {/* Voice Mute / Unmute Toggle */}
          <button
            onClick={() => {
              if (!speechMuted) stopSpeaking();
              setSpeechMuted(!speechMuted);
            }}
            className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs ${
              speechMuted
                ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400"
                : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
            title={speechMuted ? "Unmute Voice Replies" : "Mute Voice Replies"}
          >
            {speechMuted ? (
              <>
                <VolumeX className="w-4 h-4 text-rose-500" />
                <span className="hidden md:inline text-[11px]">Voice Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                <span className="hidden md:inline text-[11px]">Voice On</span>
              </>
            )}
          </button>

          {/* Language Selector Dropdown */}
          <div className="relative" ref={langDropdownRef}>
            <button
              onClick={() => setLangDropdownOpen(!langDropdownOpen)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Select Agent Language"
            >
              <Globe className="w-3.5 h-3.5 text-blue-500 dark:text-cyan-400" />
              <span className="hidden sm:inline">{currentLanguage.nativeName}</span>
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

          {/* New Chat / Reset Button */}
          <button
            onClick={resetConversation}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            title="Start new consultation"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">New Chat</span>
          </button>

          {/* Quick Jump to My Appointments */}
          <Link
            href="/appointments"
            className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 text-blue-700 dark:text-cyan-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">My Bookings</span>
          </Link>

          {/* Diagnostics Drawer Toggle */}
          {currentState && (
            <button
              onClick={() => setShowStateDrawer(!showStateDrawer)}
              className={`p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                showStateDrawer
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white"
              }`}
              title="Toggle Live Session Inspector"
            >
              <Layers className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Chat Card */}
        <div className="flex-1 flex flex-col bg-white dark:bg-[#0c1222] rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl transition-colors">
          {/* Messages Scroll View */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/50 dark:bg-transparent">
            {/* If conversation just started, show Rich Welcome & Quick-Action Cards */}
            {isConversationEmpty && (
              <div className="space-y-6 pt-2 pb-4 animate-in fade-in duration-300">
                <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50/40 dark:from-[#0e1628] dark:via-[#0c1222] dark:to-[#090e1c] rounded-3xl p-6 sm:p-8 border border-blue-100 dark:border-slate-800/90 text-center space-y-3 relative overflow-hidden shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-cyan-400 flex items-center justify-center mx-auto shadow-sm">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    How can I assist your health today?
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                    Ask me in natural voice or text to search specialist doctors, verify open clinic slots, or book your visit with zero double-booking risk.
                  </p>
                </div>

                {/* 4 Interactive Starter Cards */}
                <div>
                  <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-1">
                    Quick Actions • Tap to ask directly
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {quickActionCards.map((card, idx) => {
                      const IconComponent = card.icon;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(card.prompt)}
                          disabled={isLoading}
                          className={`p-4 rounded-2xl border text-left bg-gradient-to-br ${card.color} hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer shadow-xs flex items-start gap-3.5 group`}
                        >
                          <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0 shadow-xs group-hover:border-blue-400 transition-colors">
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <div className="space-y-0.5">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {card.title}
                            </h4>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                              {card.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} animate-in fade-in duration-200`}
                >
                  {/* Agent Avatar */}
                  {!isUser && (
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md shadow-blue-500/20">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  {/* Message Bubble Body */}
                  <div
                    className={`max-w-[90%] sm:max-w-[80%] space-y-2.5 ${
                      isUser ? "items-end" : "items-start"
                    }`}
                  >
                    {/* Tool Activity Steps */}
                    {msg.activity_steps && msg.activity_steps.length > 0 && (
                      <div className="bg-slate-100 dark:bg-slate-900/90 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 shadow-xs">
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Activity className="w-3 h-3 text-blue-500 animate-pulse" />
                          <span>Deterministic Verification Active</span>
                        </div>
                        <div className="space-y-1">
                          {msg.activity_steps.map((step, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 font-mono"
                            >
                              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[9px] shrink-0 font-bold">
                                ✓
                              </span>
                              <span>{step.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bubble Content */}
                    <div
                      className={`px-4 sm:px-5 py-3.5 rounded-2xl text-sm leading-relaxed shadow-xs relative group ${
                        isUser
                          ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white rounded-tr-xs shadow-md shadow-blue-500/15"
                          : "bg-white dark:bg-[#121828] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-tl-xs"
                      }`}
                    >
                      <p className="whitespace-pre-line text-xs sm:text-sm">{msg.text}</p>

                      {/* Interactive Confirmation Card */}
                      {msg.confirmation_card && (
                        <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-700/80 bg-blue-50/60 dark:bg-[#0c1220] rounded-2xl p-4 border border-blue-500/30 space-y-3.5 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-cyan-400 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4" />
                              <span>Slot Reserved • Confirmation Required</span>
                            </span>
                            <span className="text-[10px] font-mono bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30 font-semibold">
                              Row Lock Active
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-xs bg-white dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium">Doctor</span>
                              <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                                {msg.confirmation_card.doctor || msg.confirmation_card.doctor_name}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium">Specialty</span>
                              <span className="font-semibold text-blue-600 dark:text-cyan-300">
                                {msg.confirmation_card.specialty}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-mono">
                              <Calendar className="w-3.5 h-3.5 text-blue-500" />
                              <span>{formatDate(msg.confirmation_card.date)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-mono">
                              <Clock className="w-3.5 h-3.5 text-blue-500" />
                              <span className="font-bold text-blue-600 dark:text-cyan-300">
                                {formatTime(msg.confirmation_card.time)}
                              </span>
                            </div>
                            {msg.confirmation_card.consultation_fee !== undefined && (
                              <div className="col-span-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2 mt-0.5">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Consultation Fee</span>
                                <span className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                  ₹{msg.confirmation_card.consultation_fee}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{msg.confirmation_card.location} Clinic</span>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => handleInitiatePayment(msg.confirmation_card!)}
                              disabled={isLoading || isHoldingSlot}
                              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-semibold py-2 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer active:scale-98 disabled:opacity-50"
                            >
                              <IndianRupee className="w-4 h-4" />
                              <span>
                                {isHoldingSlot
                                  ? "Holding Slot..."
                                  : `Pay & Confirm Visit ${
                                      msg.confirmation_card.consultation_fee
                                        ? `(₹${msg.confirmation_card.consultation_fee})`
                                        : ""
                                    }`}
                              </span>
                            </button>
                            <button
                              onClick={() => handleSendMessage("No, let me change the time")}
                              disabled={isLoading || isHoldingSlot}
                              className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                            >
                              Modify
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Message Timestamp & Tool Action Icons */}
                    <div
                      className={`flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 px-1 font-mono ${
                        isUser ? "justify-end" : "justify-start"
                      }`}
                    >
                      <span>{msg.timestamp}</span>
                      {!isUser && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => speakText(msg.text)}
                            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-colors cursor-pointer"
                            title="Replay audio"
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => copyMessage(msg.id, msg.text)}
                            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                            title="Copy message"
                          >
                            {copiedMsgId === msg.id ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* User Avatar */}
                  {isUser && (
                    <div className="w-9 h-9 rounded-2xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0 mt-0.5 shadow-xs">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Audio Listening Banner */}
            {isListening && (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center gap-3.5 shadow-sm animate-in fade-in">
                <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 animate-pulse shadow-md">
                  <Radio className="w-5 h-5" />
                </div>
                <div className="text-xs space-y-0.5">
                  <span className="font-bold text-rose-600 dark:text-rose-400 block">
                    Listening to your voice... Speak clearly
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                    {interimTranscript ? `"${interimTranscript}"` : "Say e.g. 'I need a doctor in Pune tomorrow'"}
                  </p>
                </div>
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400 text-xs py-2 px-2 animate-in fade-in">
                <div className="w-7 h-7 rounded-xl bg-blue-600/10 text-blue-600 dark:text-cyan-400 flex items-center justify-center">
                  <Bot className="w-4 h-4 animate-spin" />
                </div>
                <span className="font-mono text-xs">
                  ClinicPilot is querying availability & verifying safety...
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Contextual Suggestion Chips ── */}
          <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-[#0a0e1a] flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-bold text-slate-400 shrink-0 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-500" />
              <span>Ask:</span>
            </span>
            {contextualChips.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                disabled={isLoading}
                className="shrink-0 text-[11px] bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 hover:border-blue-400 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-300 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 transition-colors shadow-xs cursor-pointer font-medium"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* ── Message Input Bar ── */}
          <div className="p-3 sm:p-4 bg-white dark:bg-[#0c1222] border-t border-slate-200 dark:border-slate-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2 sm:gap-2.5"
            >
              {/* Mic Voice Button */}
              <button
                type="button"
                onClick={toggleListening}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  isListening
                    ? "bg-rose-500 text-white border-rose-600 shadow-lg shadow-rose-500/25 animate-pulse"
                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:text-blue-600 dark:hover:text-cyan-400"
                }`}
                title={isListening ? "Listening... click to stop" : "Speak your message"}
              >
                {isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask e.g. 'I need a cardiologist in Pune next week' or tap mic to speak..."
                disabled={isLoading}
                className="flex-1 bg-slate-50 dark:bg-[#121828] border border-slate-200 dark:border-slate-700/80 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-all shadow-xs"
              />

              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white p-3 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* ── Side State Inspector Drawer (Collapsible) ── */}
        {showStateDrawer && currentState && (
          <div className="w-80 bg-white dark:bg-[#0c1222] rounded-3xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-3 text-xs overflow-y-auto animate-in slide-in-from-right duration-200 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-500" />
                Live State Tracking
              </span>
              <button
                onClick={() => setShowStateDrawer(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="p-3 bg-slate-50 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Intent</span>
                <span className="font-bold text-blue-600 dark:text-cyan-400 text-xs">
                  {currentState.intent || "DISCOVERY"}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Specialty</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold">
                  {currentState.specialty || "Unspecified"}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Location</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold">
                  {currentState.location || "Unspecified"}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Doctor Locked</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold">
                  {currentState.doctor_name || "None yet"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Razorpay Checkout Modal */}
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
            setMessages((prev) => [
              ...prev,
              {
                id: `agent-payment-success-${Date.now()}`,
                sender: "agent",
                text: `🎉 Payment verified and appointment #${aptId} confirmed with ${docName} on ${formatDate(aptDate)} at ${formatTime(aptTime)}! Your consultation slot is officially booked.`,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              },
            ]);
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("appointment-changed", { detail: { appointment_id: aptId } })
              );
            }
          }}
          onFailure={(reason) => {
            setMessages((prev) => [
              ...prev,
              {
                id: `agent-payment-fail-${Date.now()}`,
                sender: "agent",
                text: `Payment could not be completed: ${reason}. The 15-minute slot hold has been released. Feel free to choose another available slot whenever you're ready!`,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              },
            ]);
          }}
          onClose={() => setPaymentModalState(null)}
        />
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
