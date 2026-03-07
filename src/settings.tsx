import React, { useEffect, useState } from "react";

import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api/quick-connect-api";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";

import * as jellyfin from "./jellyfin";
import styles from "./styles.module.css";

type View = "url" | "password" | "quick-connect" | "settings";

const LoadingIndicatorButton = ({ children, onClick, isLoading }: { children: React.ReactNode; onClick: () => void; isLoading: boolean }) => (
  <button onClick={onClick} className={styles.button}>
    {isLoading && (
      <svg width="17" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" />
        <path
          fill="currentColor"
          d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z"
        >
          <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite" />
        </path>
      </svg>
    )}
    {children}
  </button>
);

export default function SettingsModal() {
  const [isLoading, setIsLoading] = useState(false);

  const [url, setUrl] = useState(Spicetify.LocalStorage.get("jellyfin-url") || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<View>(jellyfin.user ? "settings" : "url");
  const [quickConnectCode, setQuickConnectCode] = useState("");

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

  const logout = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    Spicetify.LocalStorage.remove("jellyfin-token");
    setView("url");
  };

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

  if (view === "settings")
    return (
      <div className={styles.modal}>
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 512 512">
          <path fill="#ffb636" d="M378.553 355.648L45.117 500.733c-21.735 8.65-43.335-12.764-34.874-34.572l145.709-338.684" />
          <path
            fill="#ffd469"
            d="m10.243 466.161l11.58-26.916l2.977-4.543c57.597-87.744 116.038-174.952 176.475-260.768l67.765 69.46C217.91 278.496 51.89 450.063 17.115 495.571c-7.57-6.963-11.249-18.128-6.872-29.41"
          />
          <path
            fill="#a06c33"
            d="M304.382 204.434c61.854 61.854 95.685 128.308 75.564 148.43c-20.121 20.121-86.575-13.71-148.43-75.564s-95.685-128.308-75.564-148.43s86.575 13.709 148.43 75.564"
          />
          <path
            fill="#f7f9aa"
            d="M155.601 327.572c0 6.012-4.874 10.885-10.885 10.885s-10.885-4.873-10.885-10.885s4.873-10.885 10.885-10.885s10.885 4.873 10.885 10.885"
          />
          <path
            fill="#ffb636"
            d="M501.986 213.16c0 8.628-6.994 15.622-15.622 15.622s-15.622-6.994-15.622-15.622s6.994-15.622 15.622-15.622s15.622 6.994 15.622 15.622M397.663 421.182c-8.628 0-15.622 6.994-15.622 15.622s6.994 15.622 15.622 15.622s15.622-6.994 15.622-15.622s-6.995-15.622-15.622-15.622"
          />
          <path
            fill="#bea4ff"
            d="M355.949 79.523c-1.34 9.065-7.197 17.072-16.07 21.968c-6.126 3.38-13.33 5.137-20.807 5.137a49 49 0 0 1-7.117-.526c-5.288-.782-10.581.016-14.52 2.189c-1.766.974-4.8 3.105-5.293 6.438c-.492 3.333 1.796 6.251 3.203 7.694c3.058 3.135 7.725 5.381 12.849 6.22c.141.015.281.02.422.041c21.619 3.196 37.061 20.32 34.421 38.173c-1.34 9.066-7.197 17.073-16.071 21.969c-6.126 3.38-13.329 5.137-20.806 5.137a49 49 0 0 1-7.117-.526c-5.287-.783-10.582.015-14.521 2.189c-1.766.974-4.8 3.105-5.293 6.438c-.79 5.349 5.778 12.411 16.47 13.991c5.817.86 9.836 6.273 8.976 12.091c-.782 5.29-5.328 9.092-10.52 9.092q-.779 0-1.571-.116c-21.619-3.196-37.06-20.321-34.421-38.173c1.34-9.066 7.197-17.073 16.071-21.969c8.055-4.444 17.972-6.082 27.924-4.611c5.288.781 10.58-.016 14.52-2.189c1.766-.974 4.8-3.105 5.293-6.438c.777-5.262-5.577-12.171-15.963-13.898c-.17-.017-.341-.031-.512-.056c-9.951-1.472-18.971-5.908-25.395-12.493c-7.077-7.254-10.367-16.614-9.026-25.681c1.34-9.065 7.197-17.072 16.07-21.968c8.055-4.444 17.972-6.082 27.924-4.611c5.286.78 10.581-.016 14.52-2.189c1.766-.974 4.8-3.105 5.293-6.438c.492-3.333-1.796-6.251-3.203-7.694c-3.142-3.22-7.977-5.516-13.267-6.297c-5.817-.86-9.836-6.273-8.976-12.091s6.274-9.832 12.091-8.977c9.951 1.472 18.971 5.908 25.395 12.493c7.078 7.255 10.368 16.615 9.027 25.681"
          />
          <path
            fill="#ff6e83"
            d="M81.731 159.689c0 9.777-7.926 17.703-17.703 17.703s-17.703-7.926-17.703-17.703s7.926-17.703 17.703-17.703s17.703 7.925 17.703 17.703m316.445-20.453c-11.296 0-20.452 9.157-20.452 20.452s9.157 20.452 20.452 20.452s20.452-9.157 20.452-20.452s-9.156-20.452-20.452-20.452M215.529 395.899c-11.296 0-20.452 9.157-20.452 20.452s9.157 20.452 20.452 20.452s20.452-9.157 20.452-20.452s-9.156-20.452-20.452-20.452m271.303-93.646c3.093-5.989.745-13.352-5.244-16.445c-2.388-1.232-5.238-2.868-8.538-4.761c-28.993-16.633-89.319-51.242-160.352 6.109c-5.245 4.234-6.063 11.919-1.829 17.163c4.233 5.245 11.917 6.065 17.163 1.829c58.035-46.856 104.882-19.985 132.871-3.928c3.403 1.952 6.617 3.796 9.483 5.276a12.205 12.205 0 0 0 16.446-5.243"
          />
          <path
            fill="#59cafc"
            d="M434.834 62.776c0 6.012-4.874 10.885-10.885 10.885s-10.885-4.873-10.885-10.885s4.873-10.885 10.885-10.885c6.012-.001 10.885 4.873 10.885 10.885M46.324 11.894c-6.012 0-10.885 4.873-10.885 10.885s4.873 10.885 10.885 10.885S57.21 28.791 57.21 22.779s-4.874-10.885-10.886-10.885m170.681 142.057c1.231-2.414 2.749-5.163 4.356-8.073c8.154-14.771 19.32-34.999 19.992-58.559c.807-28.304-13.934-54.002-43.812-76.38c-5.187-3.885-12.539-2.828-16.421 2.357c-3.884 5.186-2.829 12.538 2.357 16.421c23.75 17.788 35.01 36.411 34.425 56.933c-.51 17.872-9.697 34.516-17.08 47.889c-1.701 3.083-3.309 5.994-4.713 8.747c-2.945 5.771-.654 12.836 5.116 15.781a11.7 11.7 0 0 0 5.323 1.285a11.73 11.73 0 0 0 10.457-6.401"
          />
        </svg>
        <p className={styles.loggedIn}>You're logged in!</p>

        <select name="" id="">
          <option value="">Source</option>
        </select>

        <hr className={styles.hr} />
        <button onClick={logout} className={styles.button}>
          Log out
        </button>
      </div>
    );

  if (view === "url")
    return (
      <div className={styles.modal}>
        <div className={styles.inputContainer}>
          <label htmlFor="url">URL</label>
          <input id="url" type="text" placeholder="Enter Jellyfin URL..." value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>

        <hr className={styles.hr} />
        <LoadingIndicatorButton onClick={createApi} isLoading={isLoading}>
          Next
        </LoadingIndicatorButton>
      </div>
    );

  return (
    <div className={styles.modal}>
      {view === "quick-connect" ? (
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
      ) : (
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
      )}

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
    </div>
  );
}
