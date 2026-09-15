import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "@/pages/HomePage";
import { NavigatePage } from "@/pages/NavigatePage";
import { ReadPage } from "@/pages/ReadPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SignLanguagePage } from "@/pages/SignLanguagePage";
import { VisionPage } from "@/pages/VisionPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/vision" element={<VisionPage />} />
      <Route path="/read" element={<ReadPage />} />
      <Route path="/navigate" element={<NavigatePage />} />
      <Route path="/sign" element={<SignLanguagePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/assist" element={<Navigate to="/vision" replace />} />
      <Route path="/communicate" element={<Navigate to="/sign" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
