import * as React from "react";
import { Button } from "@/components/ui/button";
import { Share, Printer } from "lucide-react";

interface ToolsSectionProps {
  shareTitle?: string;
  shareText?: string;
  shareUrl?: string;
}

export function Toolbar({
  shareTitle = document?.title ?? "Share",
  shareText,
  shareUrl = typeof window !== "undefined" ? window.location.href : "",
}: ToolsSectionProps) {
  const handleShare = React.useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // user dismissed or share failed – silently ignore
      }
    } else {
      // simple fallback: copy URL
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert("Link copied to clipboard");
      } catch {
        alert("Sharing is not supported in this browser.");
      }
    }
  }, [shareTitle, shareText, shareUrl]);

  const handlePrint = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.print();
    }
  }, []);

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-1">Tools</h3>
      <div className="space-y-1 flex flex-col">
        <Button
          type="button"
          variant="ghost"
          className="h-auto px-0 py-1 text-sm justify-start gap-3 text-muted-foreground"
          onClick={handleShare}
        >
          <Share className="h-4 w-4" />
          <span>Share</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="h-auto px-0 py-1 text-sm justify-start gap-3 text-muted-foreground"
          onClick={handlePrint}
        >
          <Printer className="h-4 w-4" />
          <span>Print / PDF</span>
        </Button>
        </div>
    </div>
  );
}
