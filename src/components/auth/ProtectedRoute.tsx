import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../config/firebase";

interface ProtectedRouteProps {
    children: React.ReactElement;
    requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setIsAuthenticated(true);

                // If route demands admin clearance, read user claims profile from Firestore
                if (requireAdmin) {
                    try {
                        const userDocRef = doc(db, "merchants", user.uid); // or your dedicated "admins" / "users" collection
                        const docSnap = await getDoc(userDocRef);

                        if (docSnap.exists() && docSnap.data().role === "admin") {
                            setIsAdmin(true);
                        } else {
                            setIsAdmin(false);
                        }
                    } catch (err) {
                        console.error("Administrative authentication verification failure:", err);
                        setIsAdmin(false);
                    }
                }
            } else {
                setIsAuthenticated(false);
                setIsAdmin(false);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [requireAdmin]);

    if (loading) {
        // Return a sleek centered dark loading screen matching your theme layout
        return (
            <div style={{ minHeight: "100vh", background: "#080b14", display: "flex", justifyContent: "center", alignItems: "center", fontFamily: "'Nunito', sans-serif", color: "#9ca3af" }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ width: 40, height: 40, border: "3px solid rgba(124,58,237,0.1)", borderTop: "3px solid #7c3aed", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
                    <p style={{ fontSize: 14, letterSpacing: "0.05em" }}>Verifying secure session channels...</p>
                </div>
                <style>{`
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
            </div>
        );
    }

    // If user is completely unauthenticated, kick them to sign in
    if (!isAuthenticated) {
        return <Navigate to="/signin" state={{ from: location }} replace />;
    }

    // If route requires admin clearance but user fails criteria check
    if (requireAdmin && !isAdmin) {
        return <Navigate to="/merchant" replace />;
    }

    return children;
}