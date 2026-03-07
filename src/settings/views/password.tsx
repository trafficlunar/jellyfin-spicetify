import React, { useState } from "react";
import * as jellyfin from "../../jellyfin";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";

import { View } from "../index";
import LoadingIndicatorButton from "../loading-indicator-button";

import styles from "../../styles.module.css";

interface Props {
  setView: React.Dispatch<React.SetStateAction<View>>;
}

export default function PasswordView({ setView }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const login = async () => {
    if (!jellyfin.api) return;
    setIsLoading(true);

    const userApi = getUserApi(jellyfin.api);
    const auth = await userApi.authenticateUserByName({ authenticateUserByName: { Username: username, Pw: password } });

    if (!auth.data.AccessToken) {
      Spicetify.showNotification("Failed to login!", true);
      setIsLoading(false);
      return;
    }

    jellyfin.api.accessToken = auth.data.AccessToken;
    Spicetify.LocalStorage.set("jellyfin-token", auth.data.AccessToken);

    const user = await getUserApi(jellyfin.api).getCurrentUser();
    if (user.data.Id) jellyfin.setUser(user.data.Id);

    setView("settings");
    setIsLoading(false);
  };

  return (
    <>
      <div className={styles.inputContainer}>
        <label htmlFor="username">Username</label>
        <input id="username" type="text" placeholder="Enter username..." value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>

      <div className={styles.inputContainer}>
        <label htmlFor="password">Password</label>
        <input id="password" type="password" placeholder="Enter password..." value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      <LoadingIndicatorButton onClick={login} isLoading={isLoading}>
        Log in
      </LoadingIndicatorButton>
    </>
  );
}
