import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import GoogleSignupPage from "./pages/GoogleSignupPage.jsx";
import OverviewPage from "./pages/OverviewPage.jsx";
import GroupsPage from "./pages/GroupsPage.jsx";
import GroupPage from "./pages/GroupPage.jsx";
import ListFormPage from "./pages/ListFormPage.jsx";
import ListPage from "./pages/ListPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import LinkPage from "./pages/LinkPage.jsx";
import ChildrenPage from "./pages/ChildrenPage.jsx";
import ArchivePage from "./pages/ArchivePage.jsx";
import GiftPage from "./pages/GiftPage.jsx";
import SantaFormPage from "./pages/SantaFormPage.jsx";
import WishProfilePage from "./pages/WishProfilePage.jsx";
import ListsPage from "./pages/ListsPage.jsx";
import GiftsPage from "./pages/GiftsPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/register/google" element={<GoogleSignupPage />} />
            {/* Activation and reset links – open without being logged in */}
            <Route path="/link/:token" element={<LinkPage />} />

            {/* Everything else requires login */}
            <Route
                element={
                    <RequireAuth>
                        <Layout />
                    </RequireAuth>
                }
            >
                <Route index element={<OverviewPage />} />
                <Route path="groups" element={<GroupsPage />} />
                <Route path="groups/:id" element={<GroupPage />} />
                <Route path="children" element={<ChildrenPage />} />
                <Route path="archive" element={<ArchivePage />} />
                {/* Different keys, so "new" and "edit" never share form state */}
                <Route path="lists" element={<ListsPage />} />
                <Route path="lists/new" element={<ListFormPage key="new" />} />
                <Route path="lists/:id" element={<ListPage />} />
                <Route path="lists/:id/edit" element={<ListFormPage key="edit" />} />
                <Route path="gifts" element={<GiftsPage />} />
                <Route path="gifts/:id" element={<GiftPage />} />
                <Route path="santa/new" element={<SantaFormPage />} />
                <Route path="people/:id/edit" element={<WishProfilePage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}
