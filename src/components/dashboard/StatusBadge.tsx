import React from 'react';

// 1. Define all possible statuses, including the new ones we just added
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  // New specific statuses
  COMPLETED: { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981", label: "Completed" },
  PROCESSING_BANK_WIRE: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6", label: "Processing Wire" },
  failed: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", label: "Failed" },
  cancelled: { bg: "rgba(107, 114, 128, 0.15)", text: "#9ca3af", label: "Cancelled" },

  // Legacy / other statuses
  success: { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981", label: "Success" },
  pending: { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b", label: "Pending" },
};

// 2. Add a fallback style for unrecognized statuses
const FALLBACK_STYLE = {
  bg: "rgba(255,255,255,0.1)",
  text: "#9ca3af",
  label: "Unknown"
};

export function StatusBadge({ status }: { status: string }) {
  // 3. SAFELY grab the style, or use the fallback if it doesn't exist
  const style = STATUS_STYLES[status] || FALLBACK_STYLE;

  // Now style.bg will NEVER be undefined
  return (
    <span
      style={{
        backgroundColor: style.bg,
        color: style.text,
        padding: "4px 10px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em"
      }}
    >
      {STATUS_STYLES[status]?.label || status}
    </span>
  );
}