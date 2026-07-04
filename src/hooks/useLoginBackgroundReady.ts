import { useEffect, useState } from "react";
import { getLoginBackgroundSignature } from "@/lib/site-settings-cache";

const PRELOAD_TIMEOUT_MS = 5000;

export function useLoginBackgroundReady(
  loginBgImageUrl: string,
  loginBgColor: string
): boolean {
  const signature = getLoginBackgroundSignature({
    login_bg_image_url: loginBgImageUrl,
    login_bg_color: loginBgColor,
  });
  const [ready, setReady] = useState(!loginBgImageUrl);

  useEffect(() => {
    if (!loginBgImageUrl) {
      setReady(true);
      return;
    }

    setReady(false);

    const linkId = "login-bg-preload";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "preload";
      link.as = "image";
      document.head.appendChild(link);
    }
    link.href = loginBgImageUrl;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setReady(true);
    };

    const img = new Image();
    img.onload = finish;
    img.onerror = finish;
    img.src = loginBgImageUrl;

    const timer = window.setTimeout(finish, PRELOAD_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
    };
  }, [signature, loginBgImageUrl]);

  return ready;
}
