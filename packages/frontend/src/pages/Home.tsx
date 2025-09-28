import React from 'react';

import { useAuth } from '../contexts/AuthContext';
import Dashboard from './Dashboard';
import DashboardSystem from './DashboardSystem';

export default function Home(): React.ReactElement {
  const { user } = useAuth();
  return user.is_system ? <DashboardSystem /> : <Dashboard />;
}
