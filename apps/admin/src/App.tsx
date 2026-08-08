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
import { ParkingSlotsPage } from "./pages/ParkingSlotsPage";
import { PaymentReturnPage } from "./pages/PaymentReturnPage";
import { PublicLoginPage } from "./pages/PublicLoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StaffLoginPage } from "./pages/StaffLoginPage";
import { TankerCustomerPage } from "./pages/TankerCustomerPage";
import { TankerDriverPage } from "./pages/TankerDriverPage";
import { TankerStaffPage } from "./pages/TankerStaffPage";
import { TankerSupplierPage } from "./pages/TankerSupplierPage";
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
            <Route path="/staff/login" element={<Navigate to="/" replace />} />
            <Route path="/staff/login/parking" element={<StaffLoginPage module="parking" />} />
            <Route path="/staff/login/tanker" element={<StaffLoginPage module="tanker" />} />

            <Route element={<RequireAuth portal="staff" />}>
              <Route path="/staff" element={<StaffLayout />}>
                <Route element={<RequireModule module="parking" />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="listings" element={<ListingsPage />} />
                  <Route path="verification" element={<VerificationPage />} />
                  <Route path="reportees" element={<ManagerReporteesPage />} />
                  <Route path="bookings" element={<BookingsPage />} />
                  <Route path="users" element={<StaffUsersPage />} />
                  <Route path="users/parking" element={<ParkingUsersPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="parking" element={<ParkingSlotsPage />} />
                </Route>
                <Route element={<RequireModule module="tanker" />}>
                  <Route path="tanker" element={<TankerStaffPage />} />
                  <Route path="users/tanker" element={<TankerUsersPage />} />
                </Route>
              </Route>
            </Route>

            <Route element={<RequireAuth portal="public" />}>
              <Route path="/app" element={<PublicLayout />}>
                <Route element={<RequireModule module="parking" />}>
                  <Route path="customer" element={<CustomerHomePage />} />
                  <Route path="customer/search" element={<CustomerSearchPage />} />
                  <Route path="customer/bookings" element={<CustomerBookingsPage />} />
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
                  <Route path="owner/wallet" element={<WalletPage />} />
                </Route>
                <Route element={<RequireModule module="tanker" />}>
                  <Route path="tanker" element={<TankerCustomerPage />} />
                  <Route path="tanker/payment/return" element={<PaymentReturnPage />} />
                  <Route path="supplier" element={<TankerSupplierPage />} />
                  <Route path="supplier/fleet" element={<TankerSupplierPage />} />
                  <Route path="supplier/requests" element={<TankerSupplierPage />} />
                  <Route path="supplier/orders" element={<TankerSupplierPage />} />
                  <Route path="supplier/invoices" element={<TankerSupplierPage />} />
                  <Route path="supplier/profile" element={<TankerSupplierPage />} />
                  <Route path="driver" element={<TankerDriverPage />} />
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
