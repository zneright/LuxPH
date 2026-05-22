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

// Define strict role states
type AuthRole = 'loading' | 'unauthenticated' | 'admin' | 'merchant' | 'unauthorized';

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
    const [role, setRole] = useState<AuthRole>('loading');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    // Fetch both admin and merchant documents simultaneously for efficiency
                    const [adminDoc, merchantDoc] = await Promise.all([
                        getDoc(doc(db, 'admins', user.uid)),
                        getDoc(doc(db, 'merchants', user.uid))
                    ]);

                    if (adminDoc.exists()) {
                        setRole('admin');
                    } else if (merchantDoc.exists()) {
                        setRole('merchant');
                    } else {
                        // User has Firebase Auth, but no record in Firestore (Orphaned/Invalid Account)
                        setRole('unauthorized');
                    }
                } catch (e) {
                    console.error("Access verification failed:", e);
                    setRole('unauthorized');
                }
            } else {
                setRole('unauthenticated');
            }
        });

        return () => unsubscribe();
    }, []);

    // 1. Still verifying credentials
    if (role === 'loading') {
        return <LoadingOverlay isLoading={true} message="Verifying secure access..." />;
    }

    // 2. Not logged in, or logged in but lacks database permissions
    if (role === 'unauthenticated' || role === 'unauthorized') {
        if (role === 'unauthorized') {
            auth.signOut(); // Force sign out invalid accounts for security
        }
        return <Navigate to="/signin" replace />;
    }

    // 3. Strict Admin Route Guard
    if (requireAdmin && role !== 'admin') {
        // If a merchant tries to access /admin, bounce them to /merchant
        return <Navigate to="/merchant" replace />;
    }

    // 4. Strict Merchant Route Guard
    if (!requireAdmin && role === 'admin') {
        // If an admin tries to access /merchant, bounce them to /admin
        return <Navigate to="/admin" replace />;
    }

    // 5. Authorized (Roles match the required route)
    return <>{children}</>;
}