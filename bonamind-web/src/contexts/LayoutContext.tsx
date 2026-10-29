import React, { createContext, useContext, ReactNode } from 'react';
import { UserRole } from '../types';

interface LayoutContextType {
  role: UserRole;
  layoutMode: 'student' | 'professor' | 'admin' | 'default';
  features: {
    showAnalytics: boolean;
    showLeaderboards: boolean;
    showClassManagement: boolean;
    showAdminPanel: boolean;
    showAdvancedTools: boolean;
    showCollaboration: boolean;
  };
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};

interface LayoutProviderProps {
  children: ReactNode;
  role: UserRole;
}

export const LayoutProvider: React.FC<LayoutProviderProps> = ({ children, role }) => {
  const getLayoutMode = (userRole: UserRole): 'student' | 'professor' | 'admin' | 'default' => {
    switch (userRole) {
      case UserRole.ADMIN:
      case UserRole.OWNER:
      case UserRole.CEO:
        return 'admin';
      case UserRole.EMPLOYEE:
        return 'professor';
      case UserRole.USER:
      default:
        return 'student';
    }
  };

  const getFeatures = (layoutMode: 'student' | 'professor' | 'admin' | 'default') => {
    switch (layoutMode) {
      case 'admin':
        return {
          showAnalytics: true,
          showLeaderboards: true,
          showClassManagement: true,
          showAdminPanel: true,
          showAdvancedTools: true,
          showCollaboration: true,
        };
      case 'professor':
        return {
          showAnalytics: true,
          showLeaderboards: true,
          showClassManagement: true,
          showAdminPanel: false,
          showAdvancedTools: true,
          showCollaboration: true,
        };
      case 'student':
      default:
        return {
          showAnalytics: true,
          showLeaderboards: true,
          showClassManagement: false,
          showAdminPanel: false,
          showAdvancedTools: false,
          showCollaboration: false,
        };
    }
  };

  const layoutMode = getLayoutMode(role);
  const features = getFeatures(layoutMode);

  return (
    <LayoutContext.Provider value={{ role, layoutMode, features }}>
      {children}
    </LayoutContext.Provider>
  );
};


