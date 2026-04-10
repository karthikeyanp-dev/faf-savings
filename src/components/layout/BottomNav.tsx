import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutDashboard, Users, Activity, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  onAddTransaction?: () => void;
  showAddButton?: boolean;
}

const navItems = [
  { path: "/", label: "Home", icon: LayoutDashboard },
  { path: "/members", label: "Members", icon: Users },
  { path: "/activity", label: "Activity", icon: Activity },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav({
  onAddTransaction,
  showAddButton = true,
}: BottomNavProps) {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-t border-border/50 lg:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center justify-around h-18 px-2">
        {/* First two nav items */}
        {navItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-16 gap-1 relative",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "relative p-2.5 rounded-xl transition-all duration-200",
                  isActive && "bg-primary/10",
                )}
              >
                <Icon className="h-5 w-5" />
                {isActive && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute inset-0 bg-primary/10 rounded-xl -z-10"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.div>
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* Floating Action Button */}
        {showAddButton && (
          <div className="flex-1 flex justify-center -mt-8">
            <motion.button
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              onClick={onAddTransaction}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-primary to-purple-600 text-white shadow-lg shadow-primary/30 border-4 border-background"
              aria-label="Add transaction"
            >
              <Plus className="h-6 w-6" />
            </motion.button>
          </div>
        )}

        {/* Last two nav items */}
        {navItems.slice(2).map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-16 gap-1 relative",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "relative p-2.5 rounded-xl transition-all duration-200",
                  isActive && "bg-primary/10",
                )}
              >
                <Icon className="h-5 w-5" />
                {isActive && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute inset-0 bg-primary/10 rounded-xl -z-10"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.div>
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Simple bottom nav without FAB for pages that don't need it
export function SimpleBottomNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-t border-border/50 lg:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center justify-around h-18">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-16 gap-1 relative",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "relative p-2.5 rounded-xl transition-all duration-200",
                  isActive && "bg-primary/10",
                )}
              >
                <Icon className="h-5 w-5" />
                {isActive && (
                  <motion.div
                    layoutId="simpleNavIndicator"
                    className="absolute inset-0 bg-primary/10 rounded-xl -z-10"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.div>
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
