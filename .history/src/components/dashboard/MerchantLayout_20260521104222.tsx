import { useEffect, useState } from 'react';
import { useNavigate, Outlet, Link, useLocation } from 'react-router-dom';
import { auth, db } from '../../config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function MerchantLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/signin');
  };

  const navLinks = [
    { name: 'Dashboard', path: '/merchant' },
    { name: 'Request Payment', path: '/merchant/create' },
    { name: 'Send Payment', path: '/merchant/send-payment' },
    { name: 'Cash Out', path: '/merchant/cashout' },
    { name: 'Invoices', path: '/merchant/invoices' },
    { name: 'Analytics', path: '/merchant/analytics' },
    { name: 'Subscription', path: '/merchant/subscription' },
    { name: 'Settings', path: '/merchant/settings' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#080b14', color: '#fff', display: 'flex' }}>
      {/* Sidebar */}
      <div style={{ width: '260px', background: 'rgba(255,255,255,0.02)', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '900', color: '#fff', marginBottom: '40px', letterSpacing: '2px' }}>LUX <span style={{ color: '#7c3aed' }}>PH</span></h2>
        
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  color: isActive ? '#fff' : '#9ca3af',
                  background: isActive ? 'rgba(124,58,237,0.1)' : 'transparent',
                  border: isActive ? '1px solid rgba(124,58,237,0.2)' : '1px solid transparent',
                  textDecoration: 'none',
                  fontWeight: isActive ? '700' : '500',
                  transition: 'all 0.2s'
                }}
              >
                {link.name}
              </Link>
            )
          })}
        </nav>
        
        <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: '#ef4444', textAlign: 'left', padding: '12px 16px', cursor: 'pointer', fontWeight: 'bold' }}>
          Log Out
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
        <Outlet />
      </div>
    </div>
  );
}
