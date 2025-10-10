import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { Home } from '@mui/icons-material';

import Admin from '../../features/admin/Admin';
import AwaitingApproval from '../../features/auth/AwaitingApproval';
import Login from '../../features/auth/Login';
import SignUp from '../../features/auth/SignUp';
import Birthdays from '../../features/birthdays/Birthdays';
import UserSettings from '../../features/settings/UserSettings';
import DIDSystemView from '../../features/system/DIDSystemView';
import EntityDetail from '../../features/system/EntityDetail';
import FamilyTree from '../../features/system/FamilyTree';
import RedirectToSystem from '../../features/system/RedirectToSystem';
import SubsystemEdit from '../../features/system/SubsystemEdit';
import Systems from '../../features/system/Systems';
import Licenses from '../../shared/pages/Licenses';

export interface AppRoutesProps {
  user: any;
}

/**
 * Application routes component
 */
export default function AppRoutes(props: AppRoutesProps) {
  const location = useLocation();
  return (
    <Routes>
      <Route path="/" element={props.user ? <Home /> : <Navigate to="/login" state={{ from: location }} replace />} />
      <Route path="/home" element={props.user ? <Home /> : <Navigate to="/login" state={{ from: location }} replace />} />
      <Route
        path="/detail/:entityType/:id"
        element={props.user ? <EntityDetail /> : <Navigate to="/login" state={{ from: location }} replace />} 
      />
      <Route path="/birthdays" element={props.user ? <Birthdays /> : <Navigate to="/login" state={{ from: location }} replace />} />
      <Route path="/family-tree" element={props.user ? <FamilyTree /> : <Navigate to="/login" state={{ from: location }} replace />} />
      <Route path="/subsystems/:sid/edit" element={props.user ? <SubsystemEdit /> : <Navigate to="/login" state={{ from: location }} replace />} />
      <Route path="/systems" element={props.user ? <Systems /> : <Navigate to="/login" state={{ from: location }} replace />} />
      <Route path="/did-system/:uid" element={props.user ? <DIDSystemView /> : <Navigate to="/login" state={{ from: location }} replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/awaiting-approval" element={<AwaitingApproval />} />
      <Route
        path="/redirect-to-system"
        element={props.user ? <RedirectToSystem /> : <Navigate to="/login" state={{ from: location }} replace />}
      />
      <Route path="/register" element={<SignUp />} />
      <Route path="/admin" element={props.user ? <Admin /> : <Navigate to="/login" state={{ from: location }} replace />} />
      <Route path="/user-settings" element={props.user ? <UserSettings /> : <Navigate to="/login" state={{ from: location }} replace />} />
      <Route path="/licenses" element={<Licenses />} />
    </Routes>
  );
}
