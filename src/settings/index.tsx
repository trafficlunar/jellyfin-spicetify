import React, { useState } from "react";
import * as jellyfin from "../jellyfin";

import UrlView from "./views/url";
import PasswordView from "./views/password";
import QuickConnectView from "./views/quick-connect";
import SettingsView from "./views/settings";

import styles from "../styles.module.css";

export type View = "url" | "password" | "quick-connect" | "settings";

const COMPONENTS: Record<View, React.ComponentType<any>> = {
  url: UrlView,
  password: PasswordView,
  "quick-connect": QuickConnectView,
  settings: SettingsView,
};

export default function SettingsModal() {
  const [view, setView] = useState<View>(jellyfin.user ? "settings" : "url");

  const ViewComponent = COMPONENTS[view];

  return (
    <div className={styles.modal}>
      <ViewComponent view={view} setView={setView} />

      {(view === "password" || view === "quick-connect") && (
        <>
          <hr className={styles.hr} />
          <button onClick={() => setView((prev) => (prev === "password" ? "quick-connect" : "password"))} className={`${styles.button} ${styles.secondary}`}>
            {view === "password" ? "Quick Connect" : "Username/Password"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setView("url");
            }}
            className={styles.button}
          >
            Change URL
          </button>
        </>
      )}
    </div>
  );
}
