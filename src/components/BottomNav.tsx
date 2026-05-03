import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, Target, ArrowDownUp, AlertTriangle, Building2 } from "lucide-react";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Plan", url: "/goal-planner", icon: Target },
  { title: "Cash Flow", url: "/cash-flow", icon: ArrowDownUp },
  { title: "Liabilities", url: "/liabilities", icon: AlertTriangle },
  { title: "Accounts", url: "/bank-accounts", icon: Building2 },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/8 bg-slate-950/88 backdrop-blur-xl pb-safe">
      <div className="flex h-14 items-center justify-around">
        {items.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.url === "/dashboard"}
            className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-2 py-1 text-slate-400 transition-colors"
            activeClassName="text-emerald-300"
          >
            <item.icon className="h-5 w-5" />
            <span className="truncate text-[10px] font-medium leading-tight">{item.title}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
