"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Type, X } from "lucide-react";
import { ReadingControls } from "./reading-controls";

/**
 * Mobile top bar: brand + the reading-settings sheet that stands in for the
 * sidebar footer. Sticky rather than fixed so it scrolls with the document
 * the way iOS users expect, and inset-padded for the notch (a no-op under the
 * opaque `default` status-bar style, but correct if that ever changes).
 */
export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-background/70 md:hidden">
      <div className="flex h-12 items-center justify-between px-4">
        <Link href="/" className="text-base font-bold tracking-tight">
          tubeReader
        </Link>

        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Trigger
            className="-mr-2 flex size-11 items-center justify-center rounded-md text-muted-foreground active:bg-accent"
            aria-label="Reading settings"
          >
            <Type className="size-5" />
          </DialogPrimitive.Trigger>

          <DialogPrimitive.Portal>
            <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
            <DialogPrimitive.Popup className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-popover p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] outline-none data-closed:animate-out data-closed:slide-out-to-bottom data-open:animate-in data-open:slide-in-from-bottom">
              <div className="mb-4 flex items-center justify-between">
                <DialogPrimitive.Title className="font-heading text-base font-medium">
                  Reading
                </DialogPrimitive.Title>
                <DialogPrimitive.Close
                  className="-mr-1 flex size-9 items-center justify-center rounded-md text-muted-foreground active:bg-accent"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </DialogPrimitive.Close>
              </div>
              <ReadingControls size="touch" />
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    </header>
  );
}
