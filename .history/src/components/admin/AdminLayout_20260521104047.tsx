import { useEffect, useState } from 'react';
import { useNavigate, Outlet, Link, useLocation } from 'react-router-dom';
import { auth } from '../../config/firebase';
import { signOut } from 'firebase/auth';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/signin');
  };

  const navLinks = [
    { name: 'Overview', path: '/admin' },
    { name: 'Merchants', path: '/admin/merchants' },
    { name: 'Transactions', path: '/admin/transactions' },
    { name: 'Platform Config', path: '/admin/config' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0d18', color: '#fff', display: 'flex' }}>
      {/* Sidebar */}
      <div style={{ width: '260px', background: 'rgba(255,255,255,0.02)', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '900', color: '#fff', marginBottom: '40px' }}>LUX PH <span style={{ color: '#10b981' }}>ADMIN</span></h2>

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
                  background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
                  border: isActive ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
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
