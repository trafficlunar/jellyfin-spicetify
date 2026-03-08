import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import { BaseItemKind, SearchHint } from "@jellyfin/sdk/lib/generated-client/models";
import * as jellyfin from "./jellyfin";
import { settings } from "./settingsStore";

export const audio = new Audio();
export let hijackActive = false;
export let currentVolume = 0.5;

export function setHijackActive(value: boolean) {
  hijackActive = value;
}
export function setCurrentVolume(value: number) {
  currentVolume = value;
}

const BITRATE_MAP: Record<string, string> = {
  high: "320000",
  medium: "256000",
  low: "128000",
};

export async function playTrack(id: string) {
  try {
    const oldVolume = Spicetify.Player.getVolume();
    Spicetify.Player.setVolume(0); // Set Spotify audio volume to 0

    setHijackActive(true);
    Spicetify.Player.setVolume(oldVolume); // Volume is now hijacked, will now set Jellyfin audio volume and also update the volume slider

    const params = new URLSearchParams({
      api_key: jellyfin.api?.accessToken ?? "",
      UserId: jellyfin.user ?? "",
      Container: "flac,aac,mp3",
      EnableRedirection: "true",
      ...(settings.quality === "source" && {
        Container: "mp3",
        AudioCodec: "mp3",
        TranscodingContainer: "mp3",
        TranscodingProtocol: "http",
        MaxStreamingBitrate: BITRATE_MAP[settings.quality],
      }),
    });

    audio.src = `${jellyfin.api?.basePath}/Audio/${id}/universal?${params}`;
    console.log("[Jellyfin] Attempting to play:", audio.src);
    await audio.play();
  } catch (error) {
    console.error("An error occurred trying to play a track on Jellyfin", error);
    Spicetify.showNotification("An error occurred trying to play a track on Jellyfin", true);
    setHijackActive(false);
  }
}

export function registerEvents() {
  // Search Jellyfin for song and play that instead if found
  Spicetify.Player.addEventListener("songchange", async (event) => {
    if (!settings.hijack) return;
    if (!jellyfin.api) return;
    if (!event) return;

    const results = await getSearchApi(jellyfin.api).getSearchHints({
      searchTerm: event.data.item.name,
      includeItemTypes: [BaseItemKind.Audio],
      limit: 1,
    });

    const item = results.data.SearchHints?.[0];
    if (!item?.Id) {
      setHijackActive(false);
      audio.pause();
      Spicetify.Player.setVolume(currentVolume);
      return;
    }

    Spicetify.showNotification("Playing on Jellyfin");
    playTrack(item.Id);
  });

  // Play/pause Jellyfin audio
  Spicetify.Player.addEventListener("onplaypause", async (event) => {
    if (!hijackActive) return;

    if (event?.data.isPaused) {
      audio.pause();
    } else {
      await audio.play();
    }
  });

  // Seeking support
  let oldTime = 0;
  Spicetify.Player.addEventListener("onprogress", async (event) => {
    if (!hijackActive) return;
    if (!event) return;

    // onprogress polls every 100ms, small time difference means normal playback
    const timeDiff = Math.abs(event.data - oldTime);
    if (Math.abs(timeDiff - 100) < 100) {
      // Allow 100ms tolerance
      oldTime = event.data;
      return;
    }

    audio.currentTime = event.data / 1000;
    oldTime = event.data;
  });

  // Hijack Spotify APIs to change volume of Jellyfin audio instead of Spotify audio
  const playback = Spicetify.Platform.PlaybackAPI;
  playback.getVolume = new Proxy(playback.getVolume, {
    apply(target, thisArg, args) {
      if (hijackActive) {
        return currentVolume;
      }
      return Reflect.apply(target, thisArg, args);
    },
  });
  playback.setVolume = new Proxy(playback.setVolume, {
    apply(target, thisArg, args) {
      setCurrentVolume(args[0]);

      if (hijackActive) {
        audio.volume = Math.pow(currentVolume, 3);

        const volumeSlider: HTMLDivElement | null = document.querySelector(".volume-bar__slider-container > div > div");
        if (volumeSlider) volumeSlider.style.setProperty("--progress-bar-transform", `${currentVolume * 100}%`);
        return;
      }
      return Reflect.apply(target, thisArg, args);
    },
  });
}
