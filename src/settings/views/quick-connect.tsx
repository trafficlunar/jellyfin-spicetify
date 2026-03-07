import React, { useEffect, useState } from "react";
import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api/quick-connect-api";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import * as jellyfin from "../../jellyfin";

import { View } from "../index";
import styles from "../../styles.module.css";

interface Props {
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
}

export default function QuickConnectView({ view, setView }: Props) {
  const [quickConnectCode, setQuickConnectCode] = useState("");

  useEffect(() => {
    if (view !== "quick-connect") return;
    if (!jellyfin.api) return;

    const quickConnectApi = getQuickConnectApi(jellyfin.api);
    let interval: NodeJS.Timeout;

    (async () => {
      const enabled = await quickConnectApi.getQuickConnectEnabled();
      if (!enabled.data) {
        Spicetify.showNotification("Quick Connect is not enabled on this server!", true);
        setView("password");
        return;
      }

      const init = await quickConnectApi.initiateQuickConnect();
      const secret = init.data.Secret!;
      setQuickConnectCode(init.data.Code!);

      interval = setInterval(async () => {
        try {
          const state = await quickConnectApi.getQuickConnectState({ secret });
          if (!state.data.Authenticated) return;

          clearInterval(interval);

          const auth = await getUserApi(jellyfin.api!).authenticateWithQuickConnect({
            quickConnectDto: { Secret: secret },
          });

          if (!auth.data.AccessToken) {
            Spicetify.showNotification("Failed to login with Quick Connect!", true);
            return;
          }

          jellyfin.api!.accessToken = auth.data.AccessToken;
          Spicetify.LocalStorage.set("jellyfin-token", auth.data.AccessToken);

          const user = await getUserApi(jellyfin.api!).getCurrentUser();
          if (user.data.Id) jellyfin.setUser(user.data.Id);

          setView("settings");
        } catch {
          clearInterval(interval);
          Spicetify.showNotification("Quick Connect polling failed!", true);
          setView("password");
        }
      }, 2000);
    })();

    return () => clearInterval(interval);
  }, [view]);

  return (
    <>
      <div className={styles.inputContainer}>
        <label htmlFor="code">Code</label>

        <div className={styles.quickConnectWrapper}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.quickConnectBox}>
              {quickConnectCode[i]}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => {
          navigator.clipboard.writeText(quickConnectCode);
          Spicetify.showNotification("Copied!");
        }}
        className={`${styles.button} ${styles.secondary}`}
      >
        Copy
      </button>
    </>
  );
}
