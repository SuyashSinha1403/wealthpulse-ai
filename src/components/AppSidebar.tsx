import {
  LayoutDashboard, TrendingUp, Building2, AlertTriangle,
  Settings, LogOut, ArrowDownUp, Target,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const mainNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Goal Planner", url: "/goal-planner", icon: Target },
  { title: "Investments", url: "/investments", icon: TrendingUp },
  { title: "Cash Flow", url: "/cash-flow", icon: ArrowDownUp },
  { title: "Bank Accounts", url: "/bank-accounts", icon: Building2 },
  { title: "Liabilities", url: "/liabilities", icon: AlertTriangle },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { signOut } = useAuth();

  return (
    <Sidebar className="border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-2xl">
      <div className="px-4 pb-4 pt-5">
        <BrandMark subtitle="Clarity. Control. Decisions." />
        <div className="mt-4 rounded-[1.4rem] border border-sidebar-border/70 bg-sidebar-accent/55 p-4">
          <p className="text-sm font-medium text-sidebar-foreground">Plan upcoming goals before choosing products.</p>
        </div>
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-[0.22em] text-sidebar-foreground/50">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-sidebar-foreground/78 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-primary/14 text-sidebar-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)]"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="space-y-3 p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start gap-2 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/45 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
