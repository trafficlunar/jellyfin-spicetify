import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api/playstate-api";
import { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
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

let currentItemId: string | null = null;
let oldTime = 0;
let lastProgressReport = 0;

export async function playTrack(id: string) {
  if (!jellyfin.api) return;

  try {
    const oldVolume = hijackActive ? currentVolume : Spicetify.Player.getVolume();
    if (!hijackActive) Spicetify.Player.setVolume(0); // Set Spotify audio volume to 0

    setHijackActive(true);
    Spicetify.Player.setVolume(oldVolume); // Volume is now hijacked, will now set Jellyfin audio volume and also update the volume slider

    const params = new URLSearchParams({
      api_key: jellyfin.api.accessToken ?? "",
      userId: jellyfin.user ?? "",
      container: "flac,aac,mp3",
      enableRedirection: "true",
      ...(settings.quality !== "source" && {
        container: "mp3",
        audioCodec: "mp3",
        transcodingContainer: "mp3",
        transcodingProtocol: "http",
        maxStreamingBitrate: BITRATE_MAP[settings.quality],
      }),
    });

    audio.src = `${jellyfin.api.basePath}/Audio/${id}/universal?${params}`;
    console.log("[Jellyfin] Attempting to play:", audio.src);
    await audio.play();

    if (settings.reportPlayback) {
      currentItemId = id;
      getPlaystateApi(jellyfin.api).reportPlaybackStart({
        playbackStartInfo: {
          ItemId: id,
        },
      });
    }
  } catch (error) {
    console.error("An error occurred trying to play a track on Jellyfin", error);
    Spicetify.showNotification("An error occurred trying to play a track on Jellyfin", true);
    setHijackActive(false);
  }
}

export function registerEvents() {
  // Search Jellyfin for song and play that instead if found
  Spicetify.Player.addEventListener("songchange", async (event) => {
    if (!settings.hijack || !jellyfin.api || !event) return;

    if (currentItemId) {
      getPlaystateApi(jellyfin.api).reportPlaybackStopped({
        playbackStopInfo: {
          ItemId: currentItemId,
          PositionTicks: Math.floor(audio.currentTime * 10_000_000),
        },
      });
      currentItemId = null;
    }

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
    if (!hijackActive || !jellyfin.api) return;

    if (event?.data.isPaused) {
      audio.pause();
    } else {
      await audio.play();
    }

    if (settings.reportPlayback && currentItemId) {
      getPlaystateApi(jellyfin.api).reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: currentItemId,
          PositionTicks: Math.floor(audio.currentTime * 10_000_000),
          IsPaused: audio.paused,
        },
      });
    }
  });

  // Seeking support
  Spicetify.Player.addEventListener("onprogress", async (event) => {
    if (!hijackActive || !jellyfin.api || !event) return;

    // Only report playback every 10s
    if (settings.reportPlayback && currentItemId && event.data - lastProgressReport > 10000) {
      getPlaystateApi(jellyfin.api).reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: currentItemId,
          PositionTicks: Math.floor(audio.currentTime * 10_000_000),
          IsPaused: audio.paused,
        },
      });
      lastProgressReport = event.data;
    }

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

  const volumeSlider: HTMLDivElement | null = document.querySelector(".volume-bar__slider-container > div > div");

  // Hijack Spotify APIs to change volume of Jellyfin audio instead of Spotify audio
  const playback = Spicetify.Platform.PlaybackAPI;
  playback.setVolume = new Proxy(playback.setVolume, {
    apply(target, thisArg, args) {
      setCurrentVolume(args[0]);

      if (hijackActive) {
        audio.volume = Math.pow(currentVolume, 3);
        if (volumeSlider) volumeSlider.style.setProperty("--progress-bar-transform", `${currentVolume * 100}%`);
        return;
      }
      return Reflect.apply(target, thisArg, args);
    },
  });

  if (!volumeSlider) return;
  const observer = new MutationObserver(() => {
    const transform = volumeSlider.style.getPropertyValue("--progress-bar-transform");

    const currentPercent = currentVolume * 100;
    const transformPercent = parseFloat(transform); // strips the "%"

    // 0.1% tolerance
    if (Math.abs(currentPercent - transformPercent) > 0.1) {
      observer.disconnect(); // prevent re-triggering while we update
      volumeSlider.style.setProperty("--progress-bar-transform", `${currentPercent}%`);
      observer.observe(volumeSlider, { attributes: true, attributeFilter: ["style"] });
    }
  });
  observer.observe(volumeSlider, { attributes: true, attributeFilter: ["style"] });
}
