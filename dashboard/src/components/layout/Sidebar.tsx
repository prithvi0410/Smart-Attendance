import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, BookOpen, Clock, ClipboardList, BarChart3, Settings } from 'lucide-react';
import { cn } from '../../utils/cn';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/students', label: 'Students', icon: Users },
  { path: '/subjects', label: 'Subjects', icon: BookOpen },
  { path: '/sessions', label: 'Sessions', icon: Clock },
  { path: '/attendance', label: 'Attendance', icon: ClipboardList },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  return (
    <>
      <div 
        className={cn(
          "fixed inset-0 z-20 bg-black/50 transition-opacity lg:hidden",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white transition-transform transform lg:translate-x-0 lg:static lg:inset-auto lg:flex-shrink-0 flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-16 flex items-center px-6 font-bold text-xl tracking-tight border-b border-slate-800">
          <span className="text-blue-500 mr-2">✦</span>
          Smart Attendance
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => onClose()}
              className={({ isActive }) =>
                cn(
                  "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )
              }
            >
              <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
};
