"use client";

import { Button } from "@/components/ui/button";
import { track } from "@vercel/analytics";

export function AnalyticsExample() {
  const trackCustomEvent = () => {
    // Track a custom event
    track("custom_event", { property: "value" });
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-4">
      <h2 className="text-xl font-semibold">Vercel Analytics Example</h2>
      <p className="text-sm text-muted-foreground">
        Click the button below to track a custom event
      </p>
      <Button onClick={trackCustomEvent}>
        Track Custom Event
      </Button>
    </div>
  );
} 