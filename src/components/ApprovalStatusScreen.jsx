import React from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/dashboard.css';

export default function ApprovalStatusScreen() {
  const { user, logout } = useAuth();
  
  const isRejected = user?.access_status === 'rejected';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#11111b',
      color: '#cdd6f4',
      padding: '20px',
      textAlign: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        backgroundColor: '#1e1e2e',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        maxWidth: '400px',
        width: '100%'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
          {isRejected ? '🚫' : '⏳'}
        </div>
        
        <h2 style={{ color: isRejected ? '#f38ba8' : '#89b4fa', marginTop: 0, marginBottom: '16px' }}>
          {isRejected ? 'Access Declined' : 'Pending Approval'}
        </h2>
        
        <p style={{ color: '#bac2de', lineHeight: 1.5, marginBottom: '32px' }}>
          {isRejected 
            ? 'Your account request was declined by admin. If you believe this is a mistake, please contact support.'
            : 'Your account is pending admin approval. You will be able to access the app once an administrator reviews your request.'}
        </p>
        
        <button 
          onClick={logout}
          style={{
            backgroundColor: '#45475a',
            color: '#cdd6f4',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            width: '100%',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#585b70'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#45475a'}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
