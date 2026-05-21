import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { auth, db } from '../../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { LoadingOverlay } from '../ui/LoadingOverlay';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setIsAuthenticated(true);
                if (requireAdmin) {
                    try {
                        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
                        setIsAdmin(adminDoc.exists());
                    } catch (e) {
                        setIsAdmin(false);
                    }
                }
            } else {
                setIsAuthenticated(false);
            }
        });

        return () => unsubscribe();
    }, [requireAdmin]);

    if (isAuthenticated === null) {
        return <LoadingOverlay isLoading={true} message="Authenticating..." />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/signin" replace />;
    }

    if (requireAdmin && isAdmin === null) {
        return <LoadingOverlay isLoading={true} message="Checking permissions..." />;
    }

    if (requireAdmin && !isAdmin) {
        return <Navigate to="/merchant" replace />;
    }

    return <>{children}</>;
}
