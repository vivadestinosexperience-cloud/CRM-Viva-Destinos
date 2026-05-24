/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SettingsHub from './settings/SettingsHub';
import UsersSettingsPage from './settings/UsersSettingsPage';
import ChannelsSettingsPage from './settings/ChannelsSettingsPage';
import TeamsSettingsPage from './settings/TeamsSettingsPage';
import PermissionsSettingsPage from './settings/PermissionsSettingsPage';
import AccountSettingsPage from './settings/AccountSettingsPage';
import AppearanceSettingsPage from './settings/AppearanceSettingsPage';
import TagsSettingsPage from './settings/TagsSettingsPage';
import MessageTemplatesSettingsPage from './settings/MessageTemplatesSettingsPage';
import ProductionResetSettingsPage from './settings/ProductionResetSettingsPage';

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50/30">
      <Routes>
        <Route index element={<SettingsHub />} />
        <Route path="usuarios" element={<UsersSettingsPage />} />
        <Route path="canais" element={<ChannelsSettingsPage />} />
        {/* Redirect old path for compatibility */}
        <Route path="integracoes/whatsapp" element={<Navigate to="../canais" replace />} />
        <Route path="equipes" element={<TeamsSettingsPage />} />
        <Route path="permissoes" element={<PermissionsSettingsPage />} />
        <Route path="conta" element={<AccountSettingsPage />} />
        <Route path="tags" element={<TagsSettingsPage />} />
        <Route path="modelos" element={<MessageTemplatesSettingsPage />} />
        <Route path="aparencia" element={<AppearanceSettingsPage />} />
        <Route path="limpeza" element={<ProductionResetSettingsPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </div>
  );
}
