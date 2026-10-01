"use client";

import { useEffect } from "react";

/*
  Register the service worker.

  Deliberately not done during render or in a module side effect: registration
  has to happen after load, and it must be skipped in development where a cached
  shell would hide the changes being made.
*/
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is a bonus; a failed registration must not surface as
        // an error to a learner who did not ask for it.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
