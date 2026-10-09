"use client";

import React, { useState, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";

export default function HeroAnimatedTerminal() {
  const { currentLanguage } = useLanguage();

  // Animation sequence steps:
  // 0: Clean reset
  // 1: User 1: "I need a dermatologist"
  // 2: Agent dots 1
  // 3: Agent 1: "We have Dr. Sharma in Pune. Is Pune the right city?"
  // 4: User 2: "Pune"
  // 5: Agent dots 2
  // 6: Agent 2: "Which date works for you?"
  // 7: User 3: "Tomorrow, Oct 10th"
  // 8: Agent dots 3
  // 9: Agent 3: "Open slots: 10:00 AM, 11:30 AM" (held for 6s)
  // -> Loops back to 0
  const [step, setStep] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    let timerId: NodeJS.Timeout;

    const sequence: { step: number; duration: number }[] = [
      { step: 1, duration: 1100 },  // User 1 appears
      { step: 2, duration: 1000 },  // Agent dots 1
      { step: 3, duration: 1600 },  // Agent 1 text appears
      { step: 4, duration: 1100 },  // User 2 "Pune" appears
      { step: 5, duration: 1000 },  // Agent dots 2
      { step: 6, duration: 1600 },  // Agent 2 text appears
      { step: 7, duration: 1100 },  // User 3 "Tomorrow, Oct 10th" appears
      { step: 8, duration: 1000 },  // Agent dots 3
      { step: 9, duration: 6000 },  // Agent 3 text appears & holds for viewing
      { step: 0, duration: 700 },   // Clean reset before looping
    ];

    let currentIndex = 0;

    const runNext = () => {
      if (!isMounted) return;
      const current = sequence[currentIndex];
      setStep(current.step);
      currentIndex = (currentIndex + 1) % sequence.length;
      timerId = setTimeout(runNext, current.duration);
    };

    timerId = setTimeout(runNext, 400);

    return () => {
      isMounted = false;
      clearTimeout(timerId);
    };
  }, []);

  return (
    <div className="relative w-full max-w-[480px] mx-auto select-none isolate">
      {/* 1. Vibrant Gradient Glow Halo directly framing the box */}
      <div className="absolute -inset-3 bg-gradient-to-tr from-blue-600/40 via-indigo-600/35 to-purple-600/30 rounded-[36px] blur-2xl pointer-events-none z-0" />

      {/* 2. Wider Ambient Radial Gradient Bloom spreading into the space around the box */}
      <div className="absolute -inset-10 bg-[radial-gradient(ellipse_at_35%_50%,rgba(59,130,246,0.35)_0%,rgba(99,102,241,0.28)_40%,transparent_75%)] blur-3xl pointer-events-none z-0" />

      {/* Main Terminal Box Container with luminous gradient box-shadow - Fixed dimensions so it never resizes */}
      <div className="relative z-10 bg-[#F5F5F5] dark:bg-[#0d121f] border border-slate-200 dark:border-indigo-500/25 rounded-[28px] shadow-2xl dark:shadow-[0_0_50px_0px_rgba(59,130,246,0.22),0_0_80px_10px_rgba(99,102,241,0.18),0_25px_65px_rgba(0,0,0,0.95)] overflow-hidden h-[480px] max-h-[480px] flex flex-col justify-between p-6 transition-colors">

        {/* Header Bar matching image */}
        <div className="relative z-10 flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-[#1b2233] shrink-0 transition-colors">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            <span className="text-[13.5px] font-medium text-slate-800 dark:text-slate-200 tracking-wide transition-colors">
              Agent online
            </span>
          </div>
          <span className="text-[12.5px] font-mono text-slate-500 font-normal">
            {currentLanguage.locale}
          </span>
        </div>

        {/* Dialogue Messages Body - fixed height, no resize */}
        <div className="relative z-10 flex-1 py-4 space-y-3.5 flex flex-col justify-start text-[14px] overflow-hidden">
          {/* Turn 1: User */}
          {step >= 1 && (
            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-blue-600 dark:bg-[#1e293f] text-white dark:text-slate-100 px-4.5 py-2.5 rounded-[18px] rounded-br-[4px] shadow-sm max-w-[85%] font-normal leading-relaxed transition-colors">
                I need a dermatologist
              </div>
            </div>
          )}

          {/* Turn 1: Agent Typing Dots */}
          {step === 2 && (
            <div className="flex justify-start animate-in fade-in duration-200">
              <div className="bg-slate-100 dark:bg-[#1a202c] text-slate-600 dark:text-slate-300 px-4 py-3 rounded-[18px] rounded-bl-[4px] flex items-center gap-1.5 shadow-sm transition-colors">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          {/* Turn 1: Agent Response */}
          {step >= 3 && (
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-slate-100 dark:bg-[#1a202c] text-slate-700 dark:text-slate-300 px-4.5 py-3 rounded-[18px] rounded-bl-[4px] shadow-sm max-w-[90%] font-normal leading-relaxed transition-colors">
                We have Dr. Sharma in Pune. Is Pune the right city?
              </div>
            </div>
          )}

          {/* Turn 2: User */}
          {step >= 4 && (
            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-blue-600 dark:bg-[#1e293f] text-white dark:text-slate-100 px-4.5 py-2.5 rounded-[18px] rounded-br-[4px] shadow-sm max-w-[85%] font-normal leading-relaxed transition-colors">
                Yes
              </div>
            </div>
          )}

          {/* Turn 2: Agent Typing Dots */}
          {step === 5 && (
            <div className="flex justify-start animate-in fade-in duration-200">
              <div className="bg-slate-100 dark:bg-[#1a202c] text-slate-600 dark:text-slate-300 px-4 py-3 rounded-[18px] rounded-bl-[4px] flex items-center gap-1.5 shadow-sm transition-colors">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          {/* Turn 2: Agent Response */}
          {step >= 6 && (
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-slate-100 dark:bg-[#1a202c] text-slate-700 dark:text-slate-300 px-4.5 py-3 rounded-[18px] rounded-bl-[4px] shadow-sm max-w-[90%] font-normal leading-relaxed transition-colors">
                Which date works for you?
              </div>
            </div>
          )}

          {/* Turn 3: User */}
          {step >= 7 && (
            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-blue-600 dark:bg-[#1e293f] text-white dark:text-slate-100 px-4.5 py-2.5 rounded-[18px] rounded-br-[4px] shadow-sm max-w-[85%] font-normal leading-relaxed transition-colors">
                Tomorrow, Oct 10th
              </div>
            </div>
          )}

          {/* Turn 3: Agent Typing Dots */}
          {step === 8 && (
            <div className="flex justify-start animate-in fade-in duration-200">
              <div className="bg-slate-100 dark:bg-[#1a202c] text-slate-600 dark:text-slate-300 px-4 py-3 rounded-[18px] rounded-bl-[4px] flex items-center gap-1.5 shadow-sm transition-colors">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          {/* Turn 3: Agent Response */}
          {step >= 9 && (
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-slate-100 dark:bg-[#1a202c] text-slate-700 dark:text-slate-300 px-4.5 py-3 rounded-[18px] rounded-bl-[4px] shadow-sm max-w-[90%] font-normal leading-relaxed transition-colors">
                Open slots: 10:00 AM, 11:30 AM
              </div>
            </div>
          )}
        </div>

        {/* Clean bottom spacer */}
        <div className="h-0.5 shrink-0" />
      </div>
    </div>
  );
}
