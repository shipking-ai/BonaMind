import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { schoologyService } from '../../services/integrations/schoologyService';
import { Loader2, Check, AlertTriangle } from '@/components/icons';

const SchoologyCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    const handleSchoologyCallback = async () => {
      const params = new URLSearchParams(location.search);
      const oauthToken = params.get('oauth_token');
      const oauthVerifier = params.get('oauth_verifier');

      if (!oauthToken || !oauthVerifier) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg('Missing OAuth parameters. Please try connecting again.');
        }
        return;
      }

      try {
        await schoologyService.initialize();
        await schoologyService.handleCallback(oauthToken, oauthVerifier);

        if (!cancelled) {
          setStatus('success');
          setTimeout(() => navigate('/dashboard?tab=integrations', { replace: true }), 1000);
        }
      } catch (err: any) {
        console.error('Schoology callback error:', err);
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(err.message || 'Failed to complete Schoology authentication.');
        }
      }
    };

    handleSchoologyCallback();

    return () => { cancelled = true; };
  }, [navigate, location]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        {status === 'processing' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#7C3AED]/10 flex items-center justify-center">
              <Loader2 size={28} className="text-[#7C3AED] animate-spin" />
            </div>
            <h2 className="text-[#F0EFFE] text-lg font-light tracking-tight mb-2">Connecting to Schoology</h2>
            <p className="text-[#7A7A96] text-xs">Completing authentication, one moment...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check size={28} className="text-emerald-400" />
            </div>
            <h2 className="text-[#F0EFFE] text-lg font-light tracking-tight mb-2">Connected!</h2>
            <p className="text-[#7A7A96] text-xs">Redirecting to your dashboard...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <h2 className="text-[#F0EFFE] text-lg font-light tracking-tight mb-2">Connection failed</h2>
            <p className="text-[#7A7A96] text-xs mb-6">{errorMsg || 'Authentication failed. Please try again.'}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/dashboard?tab=integrations', { replace: true })}
                className="px-5 py-2 bg-[#7C3AED] text-white text-xs font-medium rounded-lg hover:bg-[#6D28D9] transition-all"
              >
                Try again
              </button>
              <button
                onClick={() => navigate('/', { replace: true })}
                className="px-5 py-2 bg-[#111118] border border-[#2A2A3A] text-[#F0EFFE] text-xs font-medium rounded-lg hover:border-[#3A3A4F] transition-all"
              >
                Go home
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SchoologyCallbackPage;