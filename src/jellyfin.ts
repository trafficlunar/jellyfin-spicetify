import { Api, Jellyfin } from "@jellyfin/sdk";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";

const getDeviceId = (): string => {
  const existing = Spicetify.LocalStorage.get("jellyfin-device-id");
  if (existing) return existing;

  const id = crypto.randomUUID();
  Spicetify.LocalStorage.set("jellyfin-device-id", id);
  return id;
};

export const sdk = new Jellyfin({
  clientInfo: {
    name: "Spicetify",
    version: "1.0.0",
  },
  deviceInfo: {
    name: "Spotify",
    id: getDeviceId(),
  },
});

export let api: Api | undefined;
export let user: string | undefined;

export function setApi(value: Api) {
  api = value;
}
export function setUser(value: string) {
  user = value;
}

// Automatically login to Jellyfin if settings are present
export async function tryAutoLogin() {
  const url = Spicetify.LocalStorage.get("jellyfin-url");
  const token = Spicetify.LocalStorage.get("jellyfin-token");

  if (url && token) {
    try {
      const servers = await sdk.discovery.getRecommendedServerCandidates(url);
      const best = sdk.discovery.findBestServer(servers);
      if (!best) {
        Spicetify.showNotification("Failed to connect to Jellyfin server!", true);
        return;
      }
      api = sdk.createApi(best.address, token);

      const response = await getUserApi(api).getCurrentUser();
      if (response.data.Id) user = response.data.Id;
    } catch (error: any) {
      if (error?.response.status === 401) {
        Spicetify.LocalStorage.remove("jellyfin-token");
        api = undefined;
        Spicetify.showNotification("Jellyfin session expired. Please log in again.", true);
      } else {
        Spicetify.showNotification("Failed to connect to Jellyfin.", true);
        console.error("Jellyfin init error:", error);
      }
    }
  }
}
