import { Menu, LogOut, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header = ({ onMenuClick }: HeaderProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10">
      <div className="flex items-center">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 rounded-md"
        >
          <span className="sr-only">Open sidebar</span>
          <Menu className="h-6 w-6" />
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
          <User className="h-4 w-4" />
          <span>{user?.email}</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 px-3 py-2 rounded-md hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};
