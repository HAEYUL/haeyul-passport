'use client';

import { useState, useEffect } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isRunningAsInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/**
 * "홈 화면에 추가" — 안드로이드는 브라우저 설치 창을 띄우고, 아이폰은 방법을 안내합니다.
 * 이미 홈 화면 앱으로 열었다면 isInstalledApp이 true라 버튼을 숨기면 됩니다.
 */
export function useAddToHome() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState('');
  const [isInstalledApp] = useState(isRunningAsInstalledApp);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  async function addToHome() {
    setInstallMessage('');

    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }

    setInstallMessage('아이폰은 브라우저 하단의 공유 버튼을 누른 뒤, “홈 화면에 추가”를 선택해 주세요.');
  }

  return { isInstalledApp, installMessage, addToHome };
}
