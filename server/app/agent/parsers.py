"""Clinical parsing and normalization utilities for dates, times, and slots."""

import os
import re
from datetime import datetime, date as dt_date, timedelta
from typing import Optional


def detect_invalid_time_expression(text: str) -> Optional[str]:
    """Detects malformed or impossible time specifications (e.g. '35 PM', '25:00', 'at 35')."""
    if not text:
        return None
    text_lower = text.lower()

    # 1. Digits (not preceded by :) followed by am/pm where hour > 12 (e.g., 35 PM, 24 am, 13 PM, 99 PM)
    m1 = re.search(r"(?<!:)\b([1-9]\d{1,3})\s*(?:am|pm)\b", text_lower)
    if m1 and int(m1.group(1)) > 12:
        return m1.group(0)

    # 2. HH:MM followed by am/pm where hour > 12 (e.g. 14:00 PM, 13:30 am)
    m_ampm = re.search(r"(?<![\d\-])(\d{1,2}):(\d{2})\s*(?:am|pm)\b", text_lower)
    if m_ampm and int(m_ampm.group(1)) > 12:
        return m_ampm.group(0)

    # 3. HH:MM where hour > 23 or minute > 59 (e.g. 25:00, 10:75)
    m2 = re.search(r"(?<![\d\-])(\d{1,2}):(\d{2})(?![\d\-])", text_lower)
    if m2:
        h, m = int(m2.group(1)), int(m2.group(2))
        if h > 23 or m > 59:
            return m2.group(0)

    # 4. Phrasing like "at 35" or "at 75" (impossible hour without minutes)
    m3 = re.search(r"\b(?:at\s+)([2-9]\d|\d{3,})\b", text_lower)
    if m3:
        return m3.group(0)


    return None


def parse_and_normalize_time(text: str) -> Optional[str]:
    """Parses and normalizes explicit time strings to HH:MM format.
    
    Prevents false-positive substring matches (e.g. matching '10' in '2026-10-10'
    or '4' in 'appointment').
    
    Supported formats:
    - 12-hour: '10 AM', '10am', '10:00 AM', '3 PM', '3pm', '4:30 pm', '1 PM', '1pm'
    - 24-hour: '10:00', '14:30', '15:00', '09:00' (requires colon)
    - O'clock phrasing: 'at 10 o'clock', '3 o'clock'
    - Bare hour with am/pm: '1pm', '10am'
    """
    if not text:
        return None
    text_lower = text.lower()

    # If an invalid time expression is detected, do not normalize it as valid
    if detect_invalid_time_expression(text):
        return None

    # 1. Explicit 12-hour times with AM/PM (e.g., 10 AM, 10:00 AM, 3 PM, 1 PM, 4:30 pm)
    match_12h = re.search(r"\b(0?[1-9]|1[0-2])(?::([0-5][0-9]))?\s*(am|pm)\b", text_lower)
    if match_12h:
        hour = int(match_12h.group(1))
        minute = int(match_12h.group(2) or 0)
        meridiem = match_12h.group(3)
        if meridiem == "pm" and hour < 12:
            hour += 12
        elif meridiem == "am" and hour == 12:
            hour = 0
        return f"{hour:02d}:{minute:02d}"

    # 2. Explicit 24-hour times with colon (e.g., 10:00, 14:00, 09:30).
    # Negative lookahead/lookbehind ensures we don't match ISO dates like 2026-10-10.
    match_24h = re.search(r"(?<![\d\-])([01]?[0-9]|2[0-3]):([0-5][0-9])(?![\d\-])", text_lower)
    if match_24h:
        hour = int(match_24h.group(1))
        minute = int(match_24h.group(2))
        return f"{hour:02d}:{minute:02d}"

    # 3. O'clock phrasing (e.g., "10 o'clock", "at 3 o'clock")
    match_oclock = re.search(r"\b(?:at\s+)?(0?[1-9]|1[0-2])\s*o'?clock\b", text_lower)
    if match_oclock:
        hour = int(match_oclock.group(1))
        if 1 <= hour <= 6:
            hour += 12
        return f"{hour:02d}:00"

    # 4. Phrasing with "at" followed by an hour (e.g. "at 15", "at 14", "at 9", "at 3")
    match_at_hour = re.search(r"\bat\s+([01]?[0-9]|2[0-3])\b(?!\s*:\s*\d)", text_lower)
    if match_at_hour:
        hour = int(match_at_hour.group(1))
        if 1 <= hour <= 6:
            hour += 12
        return f"{hour:02d}:00"

    return None


def detect_invalid_date_expression(text: str) -> Optional[str]:
    """Detects invalid calendar dates (e.g. '2026-99-99', '2026-02-31')."""
    if not text:
        return None
    iso_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    if iso_match:
        iso_str = iso_match.group(1)
        try:
            dt_date.fromisoformat(iso_str)
        except ValueError:
            return iso_str
    return None


def resolve_date_expression(text: str, current_date: Optional[str] = None) -> Optional[str]:
    """Resolves explicit ISO dates or relative date expressions relative to current_date.
    
    Prevents hardcoded assumptions (e.g. assuming tomorrow is always 2026-10-10).
    Given current_date:
    - 'today' -> current_date
    - 'tomorrow' -> current_date + 1 day
    - 'day after tomorrow' -> current_date + 2 days
    - 'Friday' -> next Friday
    """
    if not text:
        return None
    text_lower = text.lower()

    # 1. Explicit ISO date: YYYY-MM-DD (must be a valid calendar date)
    iso_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    if iso_match:
        iso_str = iso_match.group(1)
        try:
            dt_date.fromisoformat(iso_str)
            return iso_str
        except ValueError:
            # Invalid calendar date (e.g. 2026-99-99)
            return None

    ref_date_str = current_date or os.getenv("CURRENT_DATE", "").strip() or datetime.now().strftime("%Y-%m-%d")
    try:
        base_dt = datetime.strptime(ref_date_str, "%Y-%m-%d")
    except Exception:
        base_dt = datetime.now()

    # 2. Natural month-day expressions (e.g., 'October 10', 'Oct 10th', '10th October')
    months_map = {
        "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
        "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
        "aug": 8, "august": 8, "sep": 9, "september": 9, "oct": 10, "october": 10,
        "nov": 11, "november": 11, "dec": 12, "december": 12,
    }
    m1 = re.search(
        r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b",
        text_lower,
    )
    if m1:
        month = months_map[m1.group(1)]
        day = int(m1.group(2))
        try:
            d = dt_date(base_dt.year, month, day)
            return d.strftime("%Y-%m-%d")
        except ValueError:
            return None

    m2 = re.search(
        r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b",
        text_lower,
    )
    if m2:
        day = int(m2.group(1))
        month = months_map[m2.group(2)]
        try:
            d = dt_date(base_dt.year, month, day)
            return d.strftime("%Y-%m-%d")
        except ValueError:
            return None

    # 3. Relative date expressions
    if "day after tomorrow" in text_lower:
        return (base_dt + timedelta(days=2)).strftime("%Y-%m-%d")
    if "tomorrow" in text_lower:
        return (base_dt + timedelta(days=1)).strftime("%Y-%m-%d")
    if "today" in text_lower:
        return base_dt.strftime("%Y-%m-%d")

    # 4. Day of the week (e.g. 'Monday', 'Tuesday', ..., 'Friday')
    weekdays = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6,
    }
    for day_name, day_idx in weekdays.items():
        if re.search(rf"\b(?:this\s+|next\s+|on\s+)?{day_name}\b", text_lower):
            current_weekday = base_dt.weekday()
            days_ahead = (day_idx - current_weekday) % 7
            if days_ahead == 0:
                days_ahead = 7
            return (base_dt + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    return None


SPECIALTY_SYNONYMS = {
    "Dermatology": [
        "dermatology",
        "dermatologist",
        "dermatologists",
        "dermat",
        "dermats",
        "derms",
        "derm",
        "derma",
        "skin doctor",
        "skin doctors",
        "skin specialist",
        "skin specialists",
        "skin physician",
        "skin expert",
        "skin clinic",
        "skin category",
        "skin care",
        "skin problem",
        "skin disease",
        "skin issue",
        "acne",
        "rash",
        "skin",
    ],
    "Cardiology": [
        "cardiology",
        "cardiologist",
        "cardiologists",
        "cardio",
        "heart doctor",
        "heart doctors",
        "heart specialist",
        "heart specialists",
        "heart physician",
        "heart expert",
        "heart clinic",
        "cardiac",
        "chest pain",
        "heart problem",
        "heart",
    ],
    "Pediatrics": [
        "pediatrics",
        "pediatric",
        "pediatrician",
        "pediatricians",
        "child doctor",
        "children doctor",
        "child specialist",
        "child specialists",
        "baby doctor",
        "kids doctor",
        "pediatric clinic",
    ],
    "Orthopedics": [
        "orthopedics",
        "orthopedic",
        "orthopedist",
        "orthopedists",
        "ortho",
        "bone doctor",
        "bone specialist",
        "bone specialists",
        "joint specialist",
        "joint specialists",
        "spine",
        "fracture",
        "knee doctor",
        "knee specialist",
        "orthopedic surgeon",
    ],
    "General Medicine": [
        "general medicine",
        "physician",
        "general physician",
        "general doctor",
        "general doctors",
        "family doctor",
        "family physician",
        "internist",
        "general checkup",
        "fever",
        "flu",
        "cough and cold",
    ],
    "Neurology": [
        "neurology",
        "neurologist",
        "neurologists",
        "neuro",
        "brain doctor",
        "brain specialist",
        "nerve doctor",
        "nerve specialist",
        "headache specialist",
        "migraine",
    ],
    "ENT": [
        "ent",
        "ear nose throat",
        "ent specialist",
        "ent doctor",
        "ear doctor",
        "throat doctor",
        "sinus",
    ],
}


def extract_specialty(text: str) -> Optional[str]:
    """Extracts standardized medical specialty from free-form text or colloquial synonyms (e.g. skin doctor -> Dermatology)."""
    if not text:
        return None
    text_lower = text.lower()
    for specialty, synonyms in SPECIALTY_SYNONYMS.items():
        for syn in synonyms:
            if re.search(r"\b" + re.escape(syn) + r"\b", text_lower):
                return specialty
    return None


def is_booking_intent(text: str) -> bool:
    """Detects if the user is expressing an intent to book/schedule an appointment or see a doctor.
    
    Recognizes semantic patterns like:
      - 'Book me an appointment', 'I want to book an appointment', "I'd like to book an appointment"
      - 'I need an appointment', 'Can I schedule an appointment?'
      - 'I want to see a doctor', 'I need to see a doctor'
      - 'Book a visit', 'Schedule a consultation'
    without relying on static hardcoded phrase lists.
    """
    if not text:
        return False
    t = text.lower().strip()

    # 1. Direct booking / scheduling verbs + appointment/doctor/visit
    if re.search(r"\b(?:book|booking|schedule|scheduling|reserve|make)\b.*?\b(?:appointment|doctor|physician|specialist|visit|slot|consultation)\b", t):
        return True
    if re.search(r"\b(?:book|schedule)\s+(?:me|an?|a)\b", t):
        return True

    # 2. Desires/requests to see or visit a doctor
    if re.search(r"\b(?:want|need|like|would\s+like|can\s+i|how\s+to|wish)\s+(?:to\s+)?(?:see|visit|consult)\s+(?:a\s+)?(?:doctor|physician|specialist)\b", t):
        return True
    if re.search(r"\bsee\s+a\s+doctor\b", t):
        return True

    # 3. Desires/requests for an appointment
    if re.search(r"\b(?:want|need|like|would\s+like|can\s+i|looking\s+for|get|have)\s+(?:an?\s+)?appointment\b", t):
        return True

    # 4. Bare keywords in clinic context
    if t.rstrip(".!?") in ["book", "booking", "appointment", "schedule"]:
        return True

    return False


def is_consultation_fee_inquiry(text: str) -> bool:
    """Detects whether the patient is asking about doctor consultation fees, rates, or pricing."""
    if not text:
        return False
    t = text.lower()
    fee_patterns = [
        r"\b(?:consulting|consultation)\s+fees?\b",
        r"\b(?:fee|fees|cost|costs|charges?|price|pricing|rates?)\b",
        r"\bhow\s+much\s+(?:is|does|for|to|would)\b",
        r"\bhow\s+much\b",
        r"\bwhat\s+(?:is|are)\s+(?:the\s+)?(?:consulting\s+fee|consultation\s+fee|fee|fees|cost|charge|charges)\b",
    ]
    return any(re.search(p, t) for p in fee_patterns)


def extract_doctor_name(text: str) -> Optional[str]:
    """Extracts doctor name mentioned in user query (e.g. 'dr. mrunal' -> 'Mrunal', 'dr rohan joshi' -> 'Rohan Joshi')."""
    if not text:
        return None
    # 1. Match 'dr. <name>' or 'dr <name>' or 'doctor <name>'
    m = re.search(r"\b(?:dr\.?|doctor)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)", text, re.IGNORECASE)
    if m:
        cand = m.group(1).strip()
        stop_words = {
            "appointment", "appointments", "visit", "available", "fee", "fees",
            "cost", "costs", "charge", "charges", "today", "tomorrow", "near", "in",
            "the", "a", "an", "slots", "slot"
        }
        words = [w for w in cand.split() if w.lower() not in stop_words]
        if words:
            return " ".join(words).title()
    # 2. Match common doctor surnames or first names directly if mentioned with 'for' or 'with'
    m2 = re.search(r"\b(?:with|for)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\b", text, re.IGNORECASE)
    if m2:
        cand = m2.group(1).strip()
        stop_words = {
            "me", "an", "the", "a", "my", "our", "him", "her", "us", "today", "tomorrow",
            "appointment", "booking", "visit", "consultation", "checkup"
        }
        words = [w for w in cand.split() if w.lower() not in stop_words]
        if words:
            if not extract_specialty(" ".join(words)):
                return " ".join(words).title()
    return None


def is_vague_booking_request(text: str) -> bool:
    """Detects when user initiates a booking intent but has not yet specified any constraints.
    
    (no doctor, no specialty, no location, no date, no time, no history lookup).
    """
    if not is_booking_intent(text):
        return False
    if is_consultation_fee_inquiry(text):
        return False
    if extract_doctor_name(text):
        return False
    t = text.lower().strip()
    # Confirmation / agreement to book is never a vague new booking inquiry!
    confirm_markers = [
        "confirm", "yes", "sure", "go ahead", "book it", "please confirm",
        "confirm and book", "please book", "do it", "agree", "proceed", "okay",
        "book this", "book that"
    ]
    if any(re.search(r"\b" + re.escape(c) + r"\b", t) for c in confirm_markers):
        return False
    # If historical doctor lookup is requested, it is not vague
    if any(h in t for h in ["saw last time", "last time", "previous doctor", "seen before", "history"]):
        return False
    # If a specific constraint is already provided, it is not vague
    if extract_specialty(text):
        return False
    if any(doc in t for doc in ["sharma", "patel", "mehta", "mrunal", "joshi"]):
        return False
    if any(loc in t for loc in ["pune", "mumbai", "delhi", "bangalore", "banglore"]):
        return False
    if resolve_date_expression(text):
        return False
    if parse_and_normalize_time(text):
        return False
    return True


def is_broad_doctor_search(text: str) -> bool:
    """Detects open-ended inquiries to see all or available doctors without specialty constraint.
    
    Examples:
      - 'Which doctors are available?'
      - 'Show me doctors'
      - 'What doctors do you have?'
      - 'Can I see the available doctors?'
      - 'Who are the doctors?'
      - 'List all doctors'
    
    Returns True ONLY if no specific specialty or doctor name is mentioned in this message.
    """
    if not text:
        return False
    if is_consultation_fee_inquiry(text):
        return False
    if extract_doctor_name(text):
        return False
    if extract_specialty(text):
        return False
    t = text.lower()
    if any(doc in t for doc in ["sharma", "patel", "mehta", "mrunal", "joshi"]):
        return False
    # Slot/timing inquiries are not broad doctor catalog searches
    if any(w in t for w in ["slot", "slots", "availability", "schedule", "opening", "openings", "timing", "timings"]):
        return False

    # Open-ended inquiry verbs + doctors
    if re.search(r"\b(?:which|what|show|see|list|view|who|have|any)\b.*?\b(?:doctors?|physicians?|specialists?)\b", t):
        return True
    if re.search(r"\bdoctors?\s+available\b", t):
        return True

    return False


def get_missing_booking_prompt(doctor_or_specialty: Optional[str] = None, date: Optional[str] = None, time: Optional[str] = None) -> str:
    """Generates the targeted clarification prompt based on what information is currently missing."""
    if not doctor_or_specialty:
        return "Sure. Which specialty or doctor would you like to see, and what date would you prefer?"
    if not date:
        return f"What date would you prefer for your appointment with {doctor_or_specialty} (e.g. tomorrow or 2026-10-10)?"
    if not time:
        return f"What time would you prefer on {date}?"
    return "Would you like me to confirm and book this appointment?"





