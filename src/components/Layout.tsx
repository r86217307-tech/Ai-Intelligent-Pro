import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { Activity, LayoutDashboard, History as HistoryIcon, Settings, LogOut, Cpu, Clock, FileText, Wallet, X, Link2, FlaskConical, Globe, Bot } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { actionManager } from "../lib/actions/actionManager";

export default function Layout() {
  const { user, logout } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unregister = actionManager.registerNavigationHandler((path) => {
      navigate(path);
      setIsDrawerOpen(false);
    });
    return () => unregister();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-text flex flex-col relative pb-20 md:pb-0 md:pl-20 overflow-x-hidden">
      
      {/* Desktop Sidebar (hidden on mobile) */}
      <nav className="hidden md:flex flex-col fixed top-0 left-0 h-full w-20 bg-surface border-r border-border py-6 items-center justify-between z-50">
        <div className="flex flex-col gap-6 w-full">
          <div className="w-10 h-10 mx-auto bg-primary rounded-xl flex items-center justify-center neon-glow-primary">
            <Activity className="text-white w-6 h-6" />
          </div>
          
          <div className="flex flex-col w-full gap-2 mt-6">
            <NavItem to="/" icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard" />
            <NavItem to="/sufia" icon={<Bot className="w-5 h-5" />} label="Sufia AI" />
            <NavItem to="/analyzer" icon={<Activity className="w-5 h-5" />} label="Analyzer" />
            <NavItem to="/news" icon={<Globe className="w-5 h-5" />} label="News Signal" />
            <NavItem to="/test-mode" icon={<FlaskConical className="w-5 h-5" />} label="Test Mode" />
            <NavItem to="/history" icon={<HistoryIcon className="w-5 h-5" />} label="History" />
            <NavItem to="/settings" icon={<Settings className="w-5 h-5" />} label="Settings" />
          </div>
        </div>
        {user && (
          <button 
            onClick={logout}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger-glass transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-3.5 sm:p-4 md:p-8 pb-24 md:pb-8">
        <header className="flex justify-between items-center mb-5 md:hidden relative z-40 pt-safe">
          <button 
            onClick={() => setIsDrawerOpen(true)}
            className="w-11 h-11 bg-surface border border-border rounded-xl flex items-center justify-center text-text-muted hover:text-white transition-colors active:scale-95 shrink-0"
            aria-label="Open menu"
          >
            <div className="w-5 h-4 flex flex-col justify-between">
              <span className="w-full h-0.5 bg-current rounded-full"></span>
              <span className="w-full h-0.5 bg-current rounded-full"></span>
              <span className="w-3/4 h-0.5 bg-current rounded-full"></span>
            </div>
          </button>
          
          <div className="flex items-center gap-2">
            <h1 className="font-black text-xl tracking-tight text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Ai <span className="text-primary text-xs font-bold bg-primary/20 px-2 py-0.5 rounded-md border border-primary/30">Intelligent</span>
            </h1>
          </div>
          
          {user ? (
            <div className="w-10 h-10 rounded-full bg-surface border border-border overflow-hidden shrink-0">
              <img src={user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.displayName || 'User'}`} alt="Avatar" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-surface border border-border shrink-0" />
          )}
        </header>

        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full min-h-[60px] bg-surface/95 backdrop-blur-lg border-t border-border flex items-center justify-around z-40 px-1 pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        <MobileNavItem to="/" icon={<LayoutDashboard className="w-4 h-4" />} label="Home" />
        <MobileNavItem to="/sufia" icon={<Bot className="w-4 h-4" />} label="Sufia AI" />
        <MobileNavItem to="/analyzer" icon={<Activity className="w-4 h-4" />} label="Analyzer" />
        <MobileNavItem to="/test-mode" icon={<FlaskConical className="w-4 h-4" />} label="Lab" />
        <MobileNavItem to="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" />
      </nav>

      {/* Mobile Drawer Overlay */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
          />
          
          {/* Drawer Content */}
          <div className="relative w-[75%] max-w-[320px] h-full bg-gradient-to-b from-[#1c1132] to-[#0a0514] border-r border-primary/20 shadow-[20px_0_50px_rgba(0,0,0,0.5)] flex flex-col p-4 animate-in slide-in-from-left duration-300">
            
            <div className="flex items-center justify-between mb-8 px-2">
              <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary" />
              </div>
              <h2 className="font-black text-lg tracking-tight text-white flex items-center gap-1">
                Ai <span className="text-primary text-xs font-bold bg-primary/20 px-1 py-0.5 rounded">Intelligent</span>
              </h2>
              <button onClick={() => setIsDrawerOpen(false)} className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-white rounded-full bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6">
              {/* Dashboard Link */}
              <div className="px-2">
                <DrawerItem to="/" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" onClick={() => setIsDrawerOpen(false)} exact />
                <DrawerItem to="/sufia" icon={<Bot className="w-4 h-4" />} label="Sufia AI" onClick={() => setIsDrawerOpen(false)} />
              </div>

              {/* Signal Hub */}
              <div>
                <h3 className="text-[10px] font-bold text-primary/60 tracking-widest uppercase mb-2 px-4">Signal Hub</h3>
                <div className="space-y-1 px-2">
                  <DrawerItem to="/analyzer" icon={<Cpu className="w-4 h-4" />} label="AI Analyzer" onClick={() => setIsDrawerOpen(false)} />
                  <DrawerItem to="/test-mode" icon={<FlaskConical className="w-4 h-4" />} label="Test Mode (Lab)" onClick={() => setIsDrawerOpen(false)} />
                  <DrawerItem to="/analyzer?mode=live" icon={<Activity className="w-4 h-4" />} label="Live Signal" onClick={() => setIsDrawerOpen(false)} />
                  <DrawerItem to="/history" icon={<Clock className="w-4 h-4" />} label="Future Signal" onClick={() => setIsDrawerOpen(false)} />
                  <DrawerItem to="/news" icon={<FileText className="w-4 h-4" />} label="News Signal" onClick={() => setIsDrawerOpen(false)} />
                </div>
              </div>

              {/* Risk & Portfolio */}
              <div>
                <h3 className="text-[10px] font-bold text-primary/60 tracking-widest uppercase mb-2 px-4">Risk & Portfolio</h3>
                <div className="space-y-1 px-2">
                  <DrawerItem to="/settings" icon={<Wallet className="w-4 h-4" />} label="Money Management" onClick={() => setIsDrawerOpen(false)} />
                </div>
              </div>
            </div>

            {/* Disconnect */}
            {user && (
              <div className="mt-auto pt-4 border-t border-white/5 px-2 pb-4">
                <button 
                  onClick={() => {
                    logout();
                    setIsDrawerOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-danger hover:bg-danger/10 transition-colors font-bold text-sm bg-danger/5 border border-danger/10"
                >
                  <LogOut className="w-4 h-4" />
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DrawerItem({ to, icon, label, onClick, exact = false }: { to: string, icon: React.ReactNode, label: string, onClick: () => void, exact?: boolean }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      end={exact}
      className={({ isActive }) => 
        `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
          isActive 
            ? "bg-primary/20 text-primary border border-primary/30 shadow-[0_0_15px_rgba(139,92,246,0.15)]" 
            : "text-text-muted hover:text-white hover:bg-white/5 border border-transparent"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function NavItem({ to, icon, label }: { to: string, icon: React.ReactNode, label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => 
        `flex flex-col items-center justify-center w-full py-3 gap-1 relative ${
          isActive ? "text-primary" : "text-text-muted hover:text-white"
        }`
      }
      title={label}
    >
      {({ isActive }) => (
        <>
          <div className="relative z-10">{icon}</div>
          {isActive && (
            <div className="absolute inset-y-0 left-0 w-1 bg-primary rounded-r-md neon-glow-primary"></div>
          )}
        </>
      )}
    </NavLink>
  );
}

function MobileNavItem({ to, icon, label }: { to: string, icon: React.ReactNode, label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => 
        `flex flex-col items-center justify-center flex-1 min-h-[48px] py-1 transition-all ${
          isActive ? "text-primary font-bold scale-105" : "text-text-muted hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <div className={`w-5 h-5 mb-0.5 transition-transform ${isActive ? "text-primary filter drop-shadow-[0_0_8px_rgba(139,92,246,0.8)]" : ""}`}>
            {icon}
          </div>
          <span className="text-[10px] tracking-tight">{label}</span>
        </>
      )}
    </NavLink>
  );
}
