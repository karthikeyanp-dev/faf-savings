import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { logout } from "@/lib/auth";
import { getCurrentFY } from "@/utils/financialYear";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  LayoutDashboard,
  Users,
  Activity,
  Settings,
  LogOut,
  Moon,
  Sun,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomNav } from "./BottomNav";
import { MobileHeader } from "./MobileHeader";
import { AddTransactionDialog } from "@/components/transactions/AddTransactionDialog";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/members", label: "Members", icon: Users },
  { path: "/activity", label: "Activity", icon: Activity },
  { path: "/settings", label: "Settings", icon: Settings },
];

interface AppLayoutProps {
  children: ReactNode;
  hideHeader?: boolean;
}

export function AppLayout({ children, hideHeader = false }: AppLayoutProps) {
  const { user, isMaintainer } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { darkMode, toggle: toggleDarkMode } = useDarkMode();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const currentFY = getCurrentFY();
  const pageTitle = navItems.find(
    (item) => item.path === location.pathname,
  )?.label;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      {!hideHeader && <MobileHeader title={pageTitle} />}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 z-40 w-64 h-screen flex-col bg-card border-r">
        <div className="flex flex-col h-full p-4">
          <div className="mb-6">
            <h1 className="text-xl font-bold">FaF Savings</h1>
            <p className="text-xs text-muted-foreground mt-1">FY {currentFY}</p>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}

            {/* Add Transaction Button - Desktop only */}
            {isMaintainer && (
              <Button
                variant="default"
                size="sm"
                className="w-full justify-start gap-2 mt-4"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="h-4 w-4" />
                Add Transaction
              </Button>
            )}
          </nav>

          <div className="space-y-2 pt-4 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={toggleDarkMode}
            >
              {darkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              {darkMode ? "Light Mode" : "Dark Mode"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 pb-20 lg:pb-0">
        {/* Desktop Header */}
        <header className="hidden lg:flex border-b bg-card px-6 py-4 items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">{pageTitle}</h2>
            <p className="text-sm text-muted-foreground">
              Maintainer: {user?.displayName || user?.email}
              {isMaintainer && " (You)"}
            </p>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 lg:p-6">{children}</div>
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav
        onAddTransaction={() => setShowAddDialog(true)}
        showAddButton={isMaintainer}
      />

      {/* Add Transaction Dialog - available from any page */}
      {showAddDialog && (
        <AddTransactionDialog open onClose={() => setShowAddDialog(false)} />
      )}
    </div>
  );
}
