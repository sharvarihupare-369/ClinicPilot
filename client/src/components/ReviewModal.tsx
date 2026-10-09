import React, { useState } from "react";
import { Star, X, Loader2 } from "lucide-react";
import { createReview } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface ReviewModalProps {
  appointmentId: number;
  doctorId: number;
  doctorName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReviewModal({
  appointmentId,
  doctorId,
  doctorName,
  onClose,
  onSuccess,
}: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError("Please select a rating.");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      await createReview(doctorId, {
        appointment_id: appointmentId,
        rating,
        review_text: reviewText,
      });
      // Invalidate doctor and reviews to refresh stats
      queryClient.invalidateQueries({ queryKey: ["doctor", doctorId] });
      queryClient.invalidateQueries({ queryKey: ["reviews", doctorId] });
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      onSuccess();
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to submit review. You may have already reviewed this appointment or it has not happened yet.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-5 relative animate-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Rate your visit</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            How was your appointment with <span className="font-semibold text-slate-700 dark:text-slate-300">{doctorName}</span>?
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col items-center justify-center space-y-2 py-4">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="p-1 transition-transform hover:scale-110 active:scale-95"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      star <= (hoverRating || rating)
                        ? "fill-amber-500 text-amber-500"
                        : "fill-slate-100 text-slate-200 dark:fill-slate-800 dark:text-slate-700"
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="text-sm font-medium text-slate-500">
              {rating === 0 ? "Select a rating" : rating === 1 ? "Poor" : rating === 2 ? "Fair" : rating === 3 ? "Good" : rating === 4 ? "Very Good" : "Excellent"}
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
              Share your experience (Optional)
            </label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="What went well? How was the doctor's bedside manner?"
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none transition-all"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs text-center font-medium">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || rating === 0}
              className="flex-1 gradient-primary text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Review</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
