import { ReactNode, useRef, useCallback, useEffect } from "react";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BrandBackdrop } from "@/components/BrandBackdrop";

import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

function SwipeHandler() {
  const { setOpenMobile } = useSidebar();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX < window.innerWidth * 0.75) {
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = Math.abs(touch.clientY - touchStartY.current);
    if (dx > 50 && dy < 40) {
      setOpenMobile(true);
      touchStartX.current = null;
      touchStartY.current = null;
    }
  }, [setOpenMobile]);

  const handleTouchEnd = useCallback(() => {
    touchStartX.current = null;
    touchStartY.current = null;
  }, []);

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return null;
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border/60 bg-background/88 px-4 backdrop-blur-xl">
      <SidebarTrigger className="rounded-xl border border-border/70 bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground" />
    </header>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      {isMobile ? <SwipeHandler /> : null}
      <div className="relative flex min-h-screen w-full overflow-hidden">
        <BrandBackdrop
          className="fixed inset-0 z-0"
          imageClassName="opacity-[0.10]"
          overlayClassName="bg-[radial-gradient(circle_at_top_left,rgba(255,147,77,0.08),transparent_26%),radial-gradient(circle_at_70%_18%,rgba(52,211,153,0.14),transparent_22%),linear-gradient(180deg,hsl(var(--background)/0.72),hsl(var(--background)/0.94))]"
        />
        <div className="brand-grid fixed inset-0 z-0 opacity-[0.08]" />
        <AppSidebar />
        <main className="relative z-[1] flex-1 overflow-auto">
          {isMobile ? (
            <MobileHeader />
          ) : (
            <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border/60 bg-background/84 px-5 backdrop-blur-xl">
              <SidebarTrigger className="rounded-xl border border-border/70 bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground" />
            </header>
          )}
          <div className="p-4 sm:p-6 lg:p-7">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
