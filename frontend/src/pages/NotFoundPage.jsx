import { Link } from "react-router-dom";

export default function NotFoundPage() {
    return (
        <div className="page">
            <h1>Sidan finns inte</h1>
            <p>
                <Link to="/">Till översikten</Link>
            </p>
        </div>
    );
}
