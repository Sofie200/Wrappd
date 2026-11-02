import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import OverviewPage from "./pages/OverviewPage.jsx";
import GroupsPage from "./pages/GroupsPage.jsx";
import GroupPage from "./pages/GroupPage.jsx";
import ListFormPage from "./pages/ListFormPage.jsx";
import ListPage from "./pages/ListPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

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
                {/* Different keys, so "new" and "edit" never share form state */}
                <Route path="lists/new" element={<ListFormPage key="new" />} />
                <Route path="lists/:id" element={<ListPage />} />
                <Route path="lists/:id/edit" element={<ListFormPage key="edit" />} />
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}
