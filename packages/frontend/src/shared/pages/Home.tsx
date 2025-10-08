import React from 'react';

import { useAuth } from '../../shared/contexts/AuthContext';
import Dashboard from '../../features/system/Dashboard';
import DashboardSystem from '../../features/system/DashboardSystem';

export default function Home(): React.ReactElement {
  const { user } = useAuth();
  return user.is_system ? <DashboardSystem /> : <Dashboard />;
}
