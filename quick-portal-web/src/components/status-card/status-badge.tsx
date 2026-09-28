import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import HelpOutlineOutlined from "@mui/icons-material/HelpOutlineOutlined";
import HighlightOffOutlined from "@mui/icons-material/HighlightOffOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import Box from "@mui/material/Box";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import Typography from "@mui/material/Typography";
import type { ComponentType } from "react";

export type StatusTone =
  | "success"
  | "warning"
  | "pending"
  | "action"
  | "error"
  | "neutral";

const toneIcons: Record<
  StatusTone,
  { Icon: ComponentType<SvgIconProps>; color: SvgIconProps["color"] }
> = {
  success: { Icon: CheckCircleOutlineOutlined, color: "success" },
  warning: { Icon: CheckCircleOutlineOutlined, color: "warning" },
  pending: { Icon: HourglassEmptyOutlined, color: "info" },
  action: { Icon: ErrorOutlineOutlined, color: "warning" },
  error: { Icon: HighlightOffOutlined, color: "error" },
  neutral: { Icon: HelpOutlineOutlined, color: "action" },
};

interface StatusBadgeProps {
  caption: string;
  label: string;
  tone: StatusTone;
}

export function StatusBadge({ caption, label, tone }: StatusBadgeProps) {
  const { Icon, color } = toneIcons[tone];

  return (
    <Box
      role="status"
      aria-label={`${caption}: ${label}`}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        minWidth: 72,
      }}
    >
      <Icon aria-hidden color={color} sx={{ fontSize: 40, mb: 0.5 }} />
      <Typography variant="caption" color="text.secondary">
        {caption}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 500 }}>
        {label}
      </Typography>
    </Box>
  );
}
