import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/providers/AuthProvider";
import { logout } from "@/lib/auth";
import { getCurrentFY } from "@/utils/financialYear";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  Moon,
  Sun,
  LogOut,
  MoreVertical,
  User,
  X,
  ChevronRight,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileHeaderProps {
  title?: string;
  showMenu?: boolean;
}

export function MobileHeader({ title, showMenu = true }: MobileHeaderProps) {
  const { user, isMaintainer } = useAuth();
  const navigate = useNavigate();
  const { darkMode, toggle: toggleDarkMode } = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentFY = getCurrentFY();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <>
      <header
        className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 lg:hidden"
        style={{
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="flex items-center justify-between px-4 h-16">
          {/* App Title / Page Title */}
          <div className="flex items-center gap-3">
            {!title && (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-md shadow-primary/20">
                <Wallet className="h-4 w-4 text-white" />
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="text-lg font-bold tracking-tight">
                {title || "FaF Savings"}
              </h1>
              {!title && (
                <span className="text-[11px] text-muted-foreground font-medium">
                  FY {currentFY}
                </span>
              )}
            </div>
          </div>

          {/* Right Actions */}
          {showMenu && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setMenuOpen(true)}
              className="p-2.5 rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
              aria-label="Menu"
            >
              <MoreVertical className="h-5 w-5" />
            </motion.button>
          )}
        </div>
      </header>

      {/* Menu Sheet */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 lg:hidden"
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-80 bg-background z-50 shadow-2xl lg:hidden"
              style={{
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
            >
              {/* Menu Header */}
              <div className="flex items-center justify-between p-5 border-b border-border/50">
                <h2 className="text-lg font-bold">Menu</h2>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setMenuOpen(false)}
                  className="p-2.5 rounded-xl hover:bg-muted transition-colors"
                >
                  <X className="h-5 w-5" />
                </motion.button>
              </div>

              {/* User Info */}
              <div className="p-5 border-b border-border/50">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center border-2 border-primary/20">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base truncate">
                      {user?.displayName || user?.email}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                          isMaintainer
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {isMaintainer ? (
                          <>
                            <span className="w-1 h-1 rounded-full bg-primary" />
                            Maintainer
                          </>
                        ) : (
                          <>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                            Member
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="p-3 space-y-1">
                {/* Dark Mode Toggle */}
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={toggleDarkMode}
                  className="w-full flex items-center gap-4 px-3 py-3.5 rounded-xl hover:bg-muted transition-colors"
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      darkMode
                        ? "bg-amber-100 text-amber-600"
                        : "bg-indigo-100 text-indigo-600",
                    )}
                  >
                    {darkMode ? (
                      <Sun className="h-5 w-5" />
                    ) : (
                      <Moon className="h-5 w-5" />
                    )}
                  </div>
                  <span className="font-medium flex-1 text-left">
                    {darkMode ? "Light Mode" : "Dark Mode"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </motion.button>

                {/* Divider */}
                <div className="h-px bg-border/50 my-2" />

                {/* Logout */}
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 px-3 py-3.5 rounded-xl hover:bg-destructive/10 text-destructive transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                    <LogOut className="h-5 w-5" />
                  </div>
                  <span className="font-medium flex-1 text-left">Logout</span>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </motion.button>
              </div>

              {/* App Info */}
              <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-border/50">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                    <Wallet className="h-3 w-3 text-white" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    FaF Savings v1.0
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// Compact header for pages with custom content
export function CompactHeader({
  title,
  rightAction,
  showBack = false,
  onBack,
}: {
  title: string;
  rightAction?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <header
      className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 lg:hidden"
      style={{
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="flex items-center px-4 h-16 gap-3">
        {showBack && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onBack || (() => navigate(-1))}
            className="p-2.5 -ml-2 rounded-xl hover:bg-muted transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </motion.button>
        )}
        <h1 className="text-lg font-bold tracking-tight flex-1">{title}</h1>
        {rightAction && <div className="flex items-center">{rightAction}</div>}
      </div>
    </header>
  );
}
