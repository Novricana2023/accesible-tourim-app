import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "@/pages/HomePage";
import { NavigatePage } from "@/pages/NavigatePage";
import { ReadPage } from "@/pages/ReadPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SignLanguagePage } from "@/pages/SignLanguagePage";
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/vision" element={<Navigate to="/navigate" replace />} />
      <Route path="/read" element={<ReadPage />} />
      <Route path="/navigate" element={<NavigatePage />} />
      <Route path="/sign" element={<SignLanguagePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/assist" element={<Navigate to="/navigate" replace />} />
      <Route path="/communicate" element={<Navigate to="/sign" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
