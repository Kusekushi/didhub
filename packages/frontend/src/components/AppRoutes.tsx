import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Detail from '../pages/Detail';
import Login from '../pages/Login';
import Home from '../pages/Home';
import RedirectToSystem from '../pages/RedirectToSystem';
import DIDSystemView from '../pages/DIDSystemView';
import Systems from '../pages/Systems';
import Admin from '../pages/Admin';
import UserSettings from '../pages/UserSettings';
import SubsystemDetail from '../pages/SubsystemDetail';
import SubsystemEdit from '../pages/SubsystemEdit';
import GroupDetail from '../pages/GroupDetail';
import SRedirect from '../pages/SRedirect';
import Birthdays from '../pages/Birthdays';
import FamilyTree from '../pages/FamilyTree';
import SignUp from '../pages/SignUp';
import AwaitingApproval from '../pages/AwaitingApproval';
import Licenses from '../pages/Licenses';

export interface AppRoutesProps {
  user: any;
}

/**
 * Application routes component
 */
export default function AppRoutes(props: AppRoutesProps) {
  return (
    <Routes>
      <Route path="/" element={props.user ? <Home /> : <Navigate to="/login" replace />} />
      <Route path="/home" element={props.user ? <Home /> : <Navigate to="/login" replace />} />
      <Route path="/detail/:id" element={props.user ? <Detail /> : <Navigate to="/login" replace />} />
      <Route path="/s/:token" element={props.user ? <SRedirect /> : <Navigate to="/login" replace />} />
      <Route
        path="/systems/:uid/subsystems/:sid"
        element={props.user ? <SubsystemDetail /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/did-system/:uid/subsystems/:sid"
        element={props.user ? <SubsystemDetail /> : <Navigate to="/login" replace />}
      />
      <Route path="/subsystems/:sid" element={props.user ? <SubsystemDetail /> : <Navigate to="/login" replace />} />
      <Route
        path="/systems/:uid/groups/:id"
        element={props.user ? <GroupDetail /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/did-system/:uid/groups/:id"
        element={props.user ? <GroupDetail /> : <Navigate to="/login" replace />}
      />
      <Route path="/groups/:id" element={props.user ? <GroupDetail /> : <Navigate to="/login" replace />} />
      <Route path="/birthdays" element={props.user ? <Birthdays /> : <Navigate to="/login" replace />} />
      <Route path="/family-tree" element={props.user ? <FamilyTree /> : <Navigate to="/login" replace />} />
      <Route path="/subsystems/:sid/edit" element={props.user ? <SubsystemEdit /> : <Navigate to="/login" replace />} />
      <Route path="/systems" element={props.user ? <Systems /> : <Navigate to="/login" replace />} />
      <Route path="/did-system/:uid" element={props.user ? <DIDSystemView /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/awaiting-approval" element={<AwaitingApproval />} />
      <Route
        path="/redirect-to-system"
        element={props.user ? <RedirectToSystem /> : <Navigate to="/login" replace />}
      />
      <Route path="/register" element={<SignUp />} />
      <Route path="/admin" element={props.user ? <Admin /> : <Navigate to="/login" replace />} />
      <Route path="/user-settings" element={props.user ? <UserSettings /> : <Navigate to="/login" replace />} />
      <Route path="/licenses" element={<Licenses />} />
    </Routes>
  );
}
