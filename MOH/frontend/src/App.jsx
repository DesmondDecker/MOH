import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import ClinicalShell from './components/ClinicalShell';
import MoHShell from './components/MoHShell';
import CHWShell from './components/CHWShell';
import CommandPalette from './components/CommandPalette';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import OverviewPage from './pages/facility-admin/OverviewPage';
import StaffPage from './pages/facility-admin/StaffPage';
import InventoryPage from './pages/facility-admin/InventoryPage';
import ExpiringStockPage from './pages/facility-admin/ExpiringStockPage';
import TransfersPage from './pages/facility-admin/TransfersPage';
import AuditLogPage from './pages/facility-admin/AuditLogPage';
import EmergencyAccessReviewPage from './pages/facility-admin/EmergencyAccessReviewPage';
import BloodBankPage from './pages/blood-bank/BloodBankPage';
import ColdChainPage from './pages/cold-chain/ColdChainPage';
import ReportBuilderPage from './pages/reports/ReportBuilderPage';
import QueuePage from './pages/clinical/QueuePage';
import SearchPatientPage from './pages/clinical/SearchPatientPage';
import RegisterPatientPage from './pages/clinical/RegisterPatientPage';
import PatientRecordPage from './pages/clinical/PatientRecordPage';
import FacilitiesPage from './pages/moh/FacilitiesPage';
import RegisterFacilityPage from './pages/moh/RegisterFacilityPage';
import FacilityDetailPage from './pages/moh/FacilityDetailPage';
import StaffDirectoryPage from './pages/moh/StaffDirectoryPage';
import StaffDetailPage from './pages/moh/StaffDetailPage';
import PharmacyShell from './components/PharmacyShell';
import DispenseQueuePage from './pages/pharmacy/DispenseQueuePage';
import PharmacyInventoryPage from './pages/facility-admin/InventoryPage';
import NewVisitPage from './pages/chw/NewVisitPage';
import MyVisitsPage from './pages/chw/MyVisitsPage';
import SurveillancePage from './pages/moh/SurveillancePage';
import NationalInventoryPage from './pages/moh/NationalInventoryPage';
import AnomaliesPage from './pages/moh/AnomaliesPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CommandPalette />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />

          <Route
            element={
              <ProtectedRoute allowedRoles={['facility_admin']}>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<OverviewPage />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/expiring" element={<ExpiringStockPage />} />
            <Route path="/transfers" element={<TransfersPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
            <Route path="/emergency-access" element={<EmergencyAccessReviewPage />} />
            <Route path="/blood-bank" element={<BloodBankPage />} />
            <Route path="/cold-chain" element={<ColdChainPage />} />
            <Route path="/reports" element={<ReportBuilderPage />} />
          </Route>

          <Route
            element={
              <ProtectedRoute allowedRoles={['doctor', 'nurse']}>
                <ClinicalShell />
              </ProtectedRoute>
            }
          >
            <Route path="/clinical" element={<QueuePage />} />
            <Route path="/clinical/search" element={<SearchPatientPage />} />
            <Route path="/clinical/register" element={<RegisterPatientPage />} />
            <Route path="/clinical/blood-bank" element={<BloodBankPage />} />
            <Route path="/clinical/patients/:patientId" element={<PatientRecordPage />} />
          </Route>

          <Route
            element={
              <ProtectedRoute allowedRoles={['moh_super_admin']}>
                <MoHShell />
              </ProtectedRoute>
            }
          >
            <Route path="/moh" element={<FacilitiesPage />} />
            <Route path="/moh/register-facility" element={<RegisterFacilityPage />} />
            <Route path="/moh/facilities/:facilityId" element={<FacilityDetailPage />} />
            <Route path="/moh/staff" element={<StaffDirectoryPage />} />
            <Route path="/moh/staff/:userId" element={<StaffDetailPage />} />
            <Route path="/moh/surveillance" element={<SurveillancePage />} />
            <Route path="/moh/inventory" element={<NationalInventoryPage />} />
            <Route path="/moh/anomalies" element={<AnomaliesPage />} />
            <Route path="/moh/reports" element={<ReportBuilderPage />} />
          </Route>

          <Route
            element={
              <ProtectedRoute allowedRoles={['pharmacist']}>
                <PharmacyShell />
              </ProtectedRoute>
            }
          >
            <Route path="/pharmacy" element={<DispenseQueuePage />} />
            <Route path="/pharmacy/inventory" element={<PharmacyInventoryPage />} />
            <Route path="/pharmacy/cold-chain" element={<ColdChainPage />} />
          </Route>

          <Route
            element={
              <ProtectedRoute allowedRoles={['chw']}>
                <CHWShell />
              </ProtectedRoute>
            }
          >
            <Route path="/chw" element={<NewVisitPage />} />
            <Route path="/chw/visits" element={<MyVisitsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
