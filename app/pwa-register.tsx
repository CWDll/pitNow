"use client";

import { useEffect } from "react";

function canRegisterServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return false;
  }

  const { hostname, protocol } = window.location;
  return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
}

export default function PWARegister() {
  useEffect(() => {
    if (!canRegisterServiceWorker()) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        console.warn("PitNow service worker registration failed", error);
      }
    };

    void registerServiceWorker();
  }, []);

  return null;
}
