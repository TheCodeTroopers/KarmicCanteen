// src/components/Common/PWAPrompt.jsx
import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, X, WifiOff, CheckCircle2 } from 'lucide-react';
import './PWAPrompt.css';

const PWAPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.error('SW registration error: ', error);
    },
  });

  useEffect(() => {
    // Listen for install prompt from browser
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Check if user previously dismissed in this session
      const dismissed = sessionStorage.getItem('pwa_install_dismissed');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    };

    const handleAppInstalled = () => {
      setShowInstallBanner(false);
      setDeferredPrompt(null);
      console.log('Karmic Canteen PWA was installed');
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the PWA install prompt');
    }
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleDismissInstall = () => {
    setShowInstallBanner(false);
    sessionStorage.setItem('pwa_install_dismissed', 'true');
  };

  return (
    <>
      {/* Offline Status Indicator */}
      {!isOnline && (
        <div className="pwa-offline-banner">
          <WifiOff size={16} />
          <span>You are currently offline. Cached data remains available.</span>
        </div>
      )}

      {/* Offline Ready Toast */}
      {offlineReady && (
        <div className="pwa-toast">
          <div className="pwa-toast-content">
            <CheckCircle2 size={18} className="pwa-icon-success" />
            <span>App is ready to work offline!</span>
          </div>
          <button className="pwa-btn-close" onClick={() => setOfflineReady(false)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Update Available Toast */}
      {needRefresh && (
        <div className="pwa-toast pwa-toast-update">
          <div className="pwa-toast-content">
            <RefreshCw size={18} className="pwa-icon-spin" />
            <div>
              <strong>Update Available</strong>
              <p>A new version of Karmic Canteen is ready.</p>
            </div>
          </div>
          <div className="pwa-toast-actions">
            <button className="pwa-btn-primary" onClick={() => updateServiceWorker(true)}>
              Reload
            </button>
            <button className="pwa-btn-close" onClick={() => setNeedRefresh(false)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Install Web App Prompt Banner */}
      {showInstallBanner && deferredPrompt && (
        <div className="pwa-install-banner">
          <div className="pwa-install-info">
            <img src="/logo.png" alt="Karmic Canteen" className="pwa-app-icon" />
            <div>
              <strong>Install Karmic Canteen</strong>
              <p>Install for fast access and offline meal management.</p>
            </div>
          </div>
          <div className="pwa-install-actions">
            <button className="pwa-btn-primary" onClick={handleInstallClick}>
              <Download size={14} style={{ marginRight: '6px' }} />
              Install
            </button>
            <button className="pwa-btn-dismiss" onClick={handleDismissInstall}>
              Not Now
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAPrompt;
