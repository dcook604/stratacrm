import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useMe } from "./hooks/useAuth";
import Layout from "./components/layout/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import LotsPage from "./pages/LotsPage";
import LotDetailPage from "./pages/LotDetailPage";
import PartiesPage from "./pages/PartiesPage";
import PartyDetailPage from "./pages/PartyDetailPage";
import ImportPage from "./pages/ImportPage";
import ImportReviewPage from "./pages/ImportReviewPage";
import BylawsPage from "./pages/BylawsPage";
import InfractionsPage from "./pages/InfractionsPage";
import InfractionDetailPage from "./pages/InfractionDetailPage";
import IncidentsPage from "./pages/IncidentsPage";
import IssuesPage from "./pages/IssuesPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="lots" element={<LotsPage />} />
          <Route path="lots/:id" element={<LotDetailPage />} />
          <Route path="parties" element={<PartiesPage />} />
          <Route path="parties/:id" element={<PartyDetailPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="import/:batchId" element={<ImportReviewPage />} />
          <Route path="bylaws" element={<BylawsPage />} />
          <Route path="infractions" element={<InfractionsPage />} />
          <Route path="infractions/:id" element={<InfractionDetailPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="issues" element={<IssuesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
