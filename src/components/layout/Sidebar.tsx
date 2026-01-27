import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Building2,
  Bot,
  BookOpen,
  Phone,
  Users,
  Puzzle,
  CreditCard,
  Settings,
  ChevronLeft,
  ChevronRight,
  FileText,
  Upload,
  Headphones,
  History,
  Activity,
  TrendingUp,
  Gift,
  MessageSquare,
  Palette,
  Shield,
  Package,
  UserCheck,
  CalendarCheck,
  Code,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const navItems = [
  { label: 'Agency Dashboard', icon: LayoutDashboard, path: '/agency', adminOnly: true },
  { label: 'Templates', icon: FileText, path: '/agency/templates', adminOnly: true },
  { label: 'Bulk Import', icon: Upload, path: '/agency/bulk-import', adminOnly: true },
  { label: 'Support Console', icon: Headphones, path: '/agency/support', adminOnly: true },
  { label: 'Audit Log', icon: History, path: '/agency/audit-log', adminOnly: true },
  { label: 'Platform Settings', icon: Code, path: '/agency/platform', adminOnly: true },
  { label: 'Admin Settings', icon: Shield, path: '/agency/admin-settings', adminOnly: true },
  { label: 'Company Overview', icon: Building2, path: '/company' },
  { label: 'AI Receptionist', icon: Bot, path: '/ai-receptionist' },
  { label: 'Knowledge Base', icon: BookOpen, path: '/knowledge-base' },
  { label: 'Services', icon: Package, path: '/services' },
  { label: 'Staff', icon: UserCheck, path: '/staff' },
  { label: 'Appointments', icon: CalendarCheck, path: '/appointments' },
  { label: 'Call Logs', icon: Phone, path: '/calls' },
  { label: 'Team', icon: Users, path: '/team' },
  { label: 'Integrations', icon: Puzzle, path: '/integrations' },
  { label: 'Billing', icon: CreditCard, path: '/billing' },
  { label: 'Monitoring', icon: Activity, path: '/monitoring' },
  { label: 'ROI Report', icon: TrendingUp, path: '/roi-report' },
  { label: 'Referrals', icon: Gift, path: '/referrals' },
  { label: 'Testimonials', icon: MessageSquare, path: '/testimonials' },
  { label: 'White Label', icon: Palette, path: '/white-label' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export function Sidebar() {
  const { isAgencyAdmin } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const filteredItems = navItems.filter(
    (item) => !item.adminOnly || isAgencyAdmin
  );

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={cn(
        'h-[calc(100vh-4rem)] bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Bot className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <span className="font-display font-semibold text-sidebar-foreground">
              AI Reception
            </span>
          </motion.div>
        )}
        {collapsed && (
          <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center mx-auto">
            <Bot className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {filteredItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span>Collapse</span>
            </>
          )}
        </Button>
      </div>
    </motion.aside>
  );
}
