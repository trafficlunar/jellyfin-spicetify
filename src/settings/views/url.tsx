import React, { useState } from "react";
import * as jellyfin from "../../jellyfin";
import LoadingIndicatorButton from "../loading-indicator-button";
import { View } from "../index";
import styles from "../../styles.module.css";

interface Props {
  setView: React.Dispatch<React.SetStateAction<View>>;
}

export default function UrlView({ setView }: Props) {
  const [url, setUrl] = useState(Spicetify.LocalStorage.get("jellyfin-url") || "");
  const [isLoading, setIsLoading] = useState(false);

  const createApi = async () => {
    setIsLoading(true);

    const servers = await jellyfin.sdk.discovery.getRecommendedServerCandidates(url);
    const best = jellyfin.sdk.discovery.findBestServer(servers);
    if (!best) {
      Spicetify.showNotification("Failed to connect to server!", true);
      setIsLoading(false);
      return;
    }
    const api = jellyfin.sdk.createApi(best.address);
    Spicetify.LocalStorage.set("jellyfin-url", url);
    jellyfin.setApi(api);

    setView("password");
    setIsLoading(false);
  };

  return (
    <>
      <div className={styles.inputContainer}>
        <label htmlFor="url">URL</label>
        <input id="url" type="text" placeholder="Enter Jellyfin URL..." value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>

      <hr className={styles.hr} />
      <LoadingIndicatorButton onClick={createApi} isLoading={isLoading}>
        Next
      </LoadingIndicatorButton>
    </>
  );
}
