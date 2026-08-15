import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequireModule } from "./auth/RequireAuth";
import { PublicLayout } from "./components/PublicLayout";
import { StaffLayout } from "./components/StaffLayout";
import { ToastProvider } from "./components/Toast";
import { BookingsPage } from "./pages/BookingsPage";
import { CustomerBookingsPage } from "./pages/CustomerBookingsPage";
import { CustomerHomePage } from "./pages/CustomerHomePage";
import { CustomerSearchPage } from "./pages/CustomerSearchPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ListingsPage } from "./pages/ListingsPage";
import { ManagerReporteesPage } from "./pages/ManagerReporteesPage";
import { OwnerBookingsPage } from "./pages/OwnerBookingsPage";
import { OwnerHomePage } from "./pages/OwnerHomePage";
import { ParkingInvoicesPage } from "./pages/ParkingInvoicesPage";
import { ParkingSlotsPage } from "./pages/ParkingSlotsPage";
import { PaymentReturnPage } from "./pages/PaymentReturnPage";
import { PublicLoginPage } from "./pages/PublicLoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StaffLoginPage } from "./pages/StaffLoginPage";
import { TankerCustomerPage } from "./pages/TankerCustomerPage";
import { TankerDriverPage } from "./pages/TankerDriverPage";
import { TankerStaffPage } from "./pages/TankerStaffPage";
import { TankerSupplierPage } from "./pages/TankerSupplierPage";
import { SevaCustomerPage } from "./pages/SevaCustomerPage";
import { SevaProviderPage } from "./pages/SevaProviderPage";
import { SevaWorkerPage } from "./pages/SevaWorkerPage";
import { SevaStaffPage } from "./pages/SevaStaffPage";
import { CommunityResidentPage } from "./pages/CommunityResidentPage";
import { CommunitySocietyPage } from "./pages/CommunitySocietyPage";
import { CommunityGuardPage } from "./pages/CommunityGuardPage";
import { CommunityStaffPage } from "./pages/CommunityStaffPage";
import { ContentCmsPage } from "./pages/ContentCmsPage";
import { HelpCenterPage } from "./pages/HelpCenterPage";
import { ParkingUsersPage, StaffUsersPage, TankerUsersPage } from "./pages/UsersPage";
import { VerificationPage } from "./pages/VerificationPage";
import { WalletPage } from "./pages/WalletPage";
import { WelcomePage } from "./pages/WelcomePage";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/login/parking" element={<PublicLoginPage module="parking" />} />
            <Route path="/login/tanker" element={<PublicLoginPage module="tanker" />} />
            <Route path="/login/seva" element={<PublicLoginPage module="seva" />} />
            <Route path="/login/community" element={<PublicLoginPage module="community" />} />
            <Route path="/staff/login" element={<Navigate to="/" replace />} />
            <Route path="/staff/login/parking" element={<StaffLoginPage module="parking" />} />
            <Route path="/staff/login/tanker" element={<StaffLoginPage module="tanker" />} />
            <Route path="/staff/login/seva" element={<StaffLoginPage module="seva" />} />
            <Route path="/staff/login/community" element={<StaffLoginPage module="community" />} />

            <Route element={<RequireAuth portal="staff" />}>
              <Route path="/staff" element={<StaffLayout />}>
                <Route element={<RequireModule module="parking" />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="listings" element={<ListingsPage />} />
                  <Route path="verification" element={<VerificationPage />} />
                  <Route path="reportees" element={<ManagerReporteesPage />} />
                  <Route path="bookings" element={<BookingsPage />} />
                  <Route path="invoices" element={<ParkingInvoicesPage audience="staff" />} />
                  <Route path="users" element={<StaffUsersPage />} />
                  <Route path="users/parking" element={<ParkingUsersPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="parking" element={<ParkingSlotsPage />} />
                </Route>
                <Route element={<RequireModule module="tanker" />}>
                  <Route path="tanker" element={<TankerStaffPage />} />
                  <Route path="users/tanker" element={<TankerUsersPage />} />
                </Route>
                <Route element={<RequireModule module="seva" />}>
                  <Route path="seva" element={<SevaStaffPage />} />
                </Route>
                <Route element={<RequireModule module="community" />}>
                  <Route path="community" element={<CommunityStaffPage />} />
                </Route>
                {/* Shared by parking + tanker staff — role check is inside the page */}
                <Route path="content" element={<ContentCmsPage />} />
              </Route>
            </Route>

            <Route element={<RequireAuth portal="public" />}>
              <Route path="/app" element={<PublicLayout />}>
                <Route path="help" element={<Navigate to="/app/help/faq" replace />} />
                <Route path="help/faq" element={<HelpCenterPage section="faq" />} />
                <Route path="help/privacy" element={<HelpCenterPage section="privacy" />} />
                <Route path="help/terms" element={<HelpCenterPage section="terms" />} />
                <Route path="help/support" element={<HelpCenterPage section="support" />} />
                <Route element={<RequireModule module="parking" />}>
                  <Route path="customer" element={<CustomerHomePage />} />
                  <Route path="customer/search" element={<CustomerSearchPage />} />
                  <Route path="customer/bookings" element={<CustomerBookingsPage />} />
                  <Route path="customer/invoices" element={<ParkingInvoicesPage audience="customer" />} />
                  <Route path="customer/wallet" element={<WalletPage />} />
                  <Route path="customer/payment/return" element={<PaymentReturnPage />} />
                  <Route path="customer/tanker" element={<Navigate to="/app/tanker" replace />} />
                  <Route
                    path="customer/tanker/payment/return"
                    element={<Navigate to="/app/tanker/payment/return" replace />}
                  />
                  <Route path="owner" element={<OwnerHomePage />} />
                  <Route path="owner/listings" element={<ListingsPage />} />
                  <Route path="owner/bookings" element={<OwnerBookingsPage />} />
                  <Route path="owner/invoices" element={<ParkingInvoicesPage audience="owner" />} />
                  <Route path="owner/wallet" element={<WalletPage />} />
                </Route>
                <Route element={<RequireModule module="tanker" />}>
                  <Route path="tanker" element={<TankerCustomerPage section="search" />} />
                  <Route path="tanker/requests" element={<TankerCustomerPage section="requests" />} />
                  <Route path="tanker/orders" element={<TankerCustomerPage section="orders" />} />
                  <Route path="tanker/invoices" element={<TankerCustomerPage section="invoices" />} />
                  <Route path="tanker/payment/return" element={<PaymentReturnPage />} />
                  <Route path="supplier" element={<TankerSupplierPage />} />
                  <Route path="supplier/fleet" element={<TankerSupplierPage />} />
                  <Route path="supplier/requests" element={<TankerSupplierPage />} />
                  <Route path="supplier/orders" element={<TankerSupplierPage />} />
                  <Route path="supplier/invoices" element={<TankerSupplierPage />} />
                  <Route path="supplier/wallet" element={<WalletPage />} />
                  <Route path="supplier/profile" element={<TankerSupplierPage />} />
                  <Route path="driver" element={<TankerDriverPage />} />
                </Route>
                <Route element={<RequireModule module="seva" />}>
                  <Route path="seva" element={<SevaCustomerPage section="search" />} />
                  <Route path="seva/bookings" element={<SevaCustomerPage section="bookings" />} />
                  <Route path="seva/invoices" element={<SevaCustomerPage section="invoices" />} />
                  <Route path="seva/payment/return" element={<PaymentReturnPage />} />
                  <Route path="provider" element={<SevaProviderPage />} />
                  <Route path="provider/offerings" element={<SevaProviderPage />} />
                  <Route path="provider/workers" element={<SevaProviderPage />} />
                  <Route path="provider/requests" element={<SevaProviderPage />} />
                  <Route path="provider/jobs" element={<SevaProviderPage />} />
                  <Route path="provider/invoices" element={<SevaProviderPage />} />
                  <Route path="provider/wallet" element={<WalletPage />} />
                  <Route path="worker" element={<SevaWorkerPage />} />
                </Route>
                <Route element={<RequireModule module="community" />}>
                  <Route path="community" element={<CommunityResidentPage section="home" />} />
                  <Route path="community/notices" element={<CommunityResidentPage section="notices" />} />
                  <Route path="community/expenses" element={<CommunityResidentPage section="expenses" />} />
                  <Route path="community/complaints" element={<CommunityResidentPage section="complaints" />} />
                  <Route path="community/visitors" element={<CommunityResidentPage section="visitors" />} />
                  <Route path="community/guards" element={<CommunityResidentPage section="guards" />} />
                  <Route path="community/payment/return" element={<PaymentReturnPage />} />
                  <Route path="society" element={<CommunitySocietyPage section="home" />} />
                  <Route path="society/units" element={<CommunitySocietyPage section="units" />} />
                  <Route path="society/members" element={<CommunitySocietyPage section="members" />} />
                  <Route path="society/notices" element={<CommunitySocietyPage section="notices" />} />
                  <Route path="society/complaints" element={<CommunitySocietyPage section="complaints" />} />
                  <Route path="society/visitors" element={<CommunitySocietyPage section="visitors" />} />
                  <Route path="society/expenses" element={<CommunitySocietyPage section="expenses" />} />
                  <Route path="gate" element={<CommunityGuardPage section="gate" />} />
                  <Route path="gate/residents" element={<CommunityGuardPage section="residents" />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
