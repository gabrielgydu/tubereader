"use client";

import { cn } from "@/lib/utils";
import {
  useReadingSettings,
  FONTS,
  FONT_SIZES,
  type FontId,
  type FontSize,
} from "./reading-settings";

/**
 * Font family + size pickers. Rendered inline in the desktop sidebar footer
 * and inside the mobile settings sheet, so the touch targets scale with
 * `size` rather than being duplicated per surface.
 */
export function ReadingControls({ size = "compact" }: { size?: "compact" | "touch" }) {
  const { font, fontSize, fontCss, setFont, setFontSize } = useReadingSettings();
  const touch = size === "touch";

  return (
    <div className={cn("space-y-3", touch && "space-y-5")}>
      <div>
        <label
          htmlFor="reading-font"
          className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
        >
          Font
        </label>
        <select
          id="reading-font"
          value={font}
          onChange={(e) => setFont(e.target.value as FontId)}
          className={cn(
            "mt-1 w-full rounded-md border border-border bg-background px-2",
            // 16px on mobile stops iOS Safari zooming the viewport on focus.
            touch ? "h-11 text-base" : "py-1 text-xs"
          )}
        >
          {FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Size
        </span>
        <div className={cn("mt-1 flex gap-1", touch && "gap-1.5")}>
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFontSize(s as FontSize)}
              aria-pressed={fontSize === s}
              className={cn(
                "flex-1 rounded transition-colors",
                touch ? "h-11 text-base" : "px-1 py-0.5 text-xs",
                fontSize === s
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {touch && (
        <p
          className="rounded-md bg-muted/50 p-3 leading-relaxed text-muted-foreground"
          style={{ fontFamily: fontCss, fontSize: `${fontSize}px` }}
        >
          Sample — summaries and transcripts render at this size.
        </p>
      )}
    </div>
  );
}
