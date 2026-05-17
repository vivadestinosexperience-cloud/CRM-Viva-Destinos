/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SettingsHub from './settings/SettingsHub';
import UsersSettingsPage from './settings/UsersSettingsPage';
import WhatsAppSettingsPage from './settings/WhatsAppSettingsPage';
import TeamsSettingsPage from './settings/TeamsSettingsPage';
import QueuesSettingsPage from './settings/QueuesSettingsPage';
import PermissionsSettingsPage from './settings/PermissionsSettingsPage';
import AccountSettingsPage from './settings/AccountSettingsPage';
import AppearanceSettingsPage from './settings/AppearanceSettingsPage';

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50/30">
      <Routes>
        <Route index element={<SettingsHub />} />
        <Route path="usuarios" element={<UsersSettingsPage />} />
        <Route path="integracoes/whatsapp" element={<WhatsAppSettingsPage />} />
        <Route path="equipes" element={<TeamsSettingsPage />} />
        <Route path="filas" element={<QueuesSettingsPage />} />
        <Route path="permissoes" element={<PermissionsSettingsPage />} />
        <Route path="conta" element={<AccountSettingsPage />} />
        <Route path="aparencia" element={<AppearanceSettingsPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </div>
  );
}
