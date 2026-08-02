import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { PublicLayout } from "./components/PublicLayout";
import { StaffLayout } from "./components/StaffLayout";
import { ToastProvider } from "./components/Toast";
import { BookingsPage } from "./pages/BookingsPage";
import { CustomerBookingsPage } from "./pages/CustomerBookingsPage";
import { CustomerHomePage } from "./pages/CustomerHomePage";
import { CustomerSearchPage } from "./pages/CustomerSearchPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ListingsPage } from "./pages/ListingsPage";
import { OwnerBookingsPage } from "./pages/OwnerBookingsPage";
import { OwnerHomePage } from "./pages/OwnerHomePage";
import { ParkingSlotsPage } from "./pages/ParkingSlotsPage";
import { PaymentReturnPage } from "./pages/PaymentReturnPage";
import { PublicLoginPage } from "./pages/PublicLoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StaffLoginPage } from "./pages/StaffLoginPage";
import { UsersPage } from "./pages/UsersPage";
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
            <Route path="/login" element={<PublicLoginPage />} />
            <Route path="/staff/login" element={<StaffLoginPage />} />

            <Route element={<RequireAuth portal="staff" />}>
              <Route path="/staff" element={<StaffLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="listings" element={<ListingsPage />} />
                <Route path="verification" element={<VerificationPage />} />
                <Route path="bookings" element={<BookingsPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="parking" element={<ParkingSlotsPage />} />
              </Route>
            </Route>

            <Route element={<RequireAuth portal="public" />}>
              <Route path="/app" element={<PublicLayout />}>
                <Route path="customer" element={<CustomerHomePage />} />
                <Route path="customer/search" element={<CustomerSearchPage />} />
                <Route path="customer/bookings" element={<CustomerBookingsPage />} />
                <Route path="customer/wallet" element={<WalletPage />} />
                <Route path="customer/payment/return" element={<PaymentReturnPage />} />
                <Route path="owner" element={<OwnerHomePage />} />
                <Route path="owner/listings" element={<ListingsPage />} />
                <Route path="owner/bookings" element={<OwnerBookingsPage />} />
                <Route path="owner/wallet" element={<WalletPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
