import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api/playstate-api";
import { BaseItemKind, SearchHint } from "@jellyfin/sdk/lib/generated-client/models";
import * as jellyfin from "./jellyfin";
import { settings } from "./settingsStore";
import { signal } from "./utils";

export const audio = new Audio();
export const canUseJellyfin = signal(false);
export let hijackActive = signal(false);
export let currentVolume = Spicetify.Player.getVolume() || 0.5;
let currentItemId: string | null = null;
let oldTime = 0;
let lastProgressReport = 0;

const BITRATE_MAP: Record<string, string> = {
  high: "320000",
  medium: "256000",
  low: "128000",
};

export function jellyfinToLocalUri(trackInfo: SearchHint): string {
  const encode = (s: string) => encodeURIComponent(s ?? "").replace(/%20/g, "+");
  const durationSecs = trackInfo.RunTimeTicks ? Math.floor(trackInfo.RunTimeTicks / 10000000) : 0;

  return `spotify:local:${encode(trackInfo.Artists?.[0] ?? "Unknown artist")}:${trackInfo.Id}:${encode(trackInfo.Name ?? "Unknown title")}:${durationSecs}`;
}

export async function playTrack(id: string) {
  if (!jellyfin.api) return;

  try {
    const oldVolume = hijackActive ? currentVolume : Spicetify.Player.getVolume();
    if (!hijackActive.get()) Spicetify.Player.setVolume(0); // Set Spotify audio volume to 0

    hijackActive.set(true);
    Spicetify.Player.setVolume(oldVolume); // Hijack active, set Jellyfin audio volume and also update the volume slider

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
    console.log("[Jellyfin]: Attempting to play:", audio.src);
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
    console.error("[Jellyfin]: An error occurred trying to play a track", error);
    Spicetify.showNotification("An error occurred trying to play a track on Jellyfin", true);
    hijackActive.set(false);
  }
}

export function registerEvents() {
  // Search Jellyfin for song and play that instead if found
  Spicetify.Player.addEventListener("songchange", async (event) => {
    if (!settings.hijack || !jellyfin.api || !event) return;
    hijackActive.set(false);
    canUseJellyfin.set(false);

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
      hijackActive.set(false);
      audio.pause();
      Spicetify.Player.setVolume(currentVolume);
      return;
    }

    Spicetify.showNotification("Playing on Jellyfin");
    canUseJellyfin.set(true);
    playTrack(item.Id);

    audio.currentTime = oldTime; // sync up with Spotify, due to loading times
  });

  // Play/pause Jellyfin audio
  Spicetify.Player.addEventListener("onplaypause", async (event) => {
    if (!hijackActive.get() || !jellyfin.api) return;

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
    if (!canUseJellyfin.get() || !jellyfin.api || !event) return;

    // Only report playback every 10s
    if (hijackActive.get() && settings.reportPlayback && currentItemId && event.data - lastProgressReport > 10000) {
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
  const volumeSliderInput: HTMLInputElement | null = document.querySelector(".volume-bar__slider-container > div > label > input");

  // Hijack Spotify APIs to change volume of Jellyfin audio instead of Spotify audio
  const playback = Spicetify.Platform.PlaybackAPI;
  playback.setVolume = new Proxy(playback.setVolume, {
    apply(target, thisArg, args) {
      currentVolume = args[0];

      if (hijackActive.get()) {
        audio.volume = Math.pow(currentVolume, 3) * 0.425;
        if (volumeSlider) volumeSlider.style.setProperty("--progress-bar-transform", `${currentVolume * 100}%`);
        if (volumeSliderInput) volumeSliderInput.value = currentVolume.toString();
        return;
      }
      return Reflect.apply(target, thisArg, args);
    },
  });

  // Spotify tries to set the volume on the slider to 0 when hijacked, this tries to revert it
  if (!volumeSlider) return;
  const observer = new MutationObserver(() => {
    const transform = volumeSlider.style.getPropertyValue("--progress-bar-transform");

    const currentPercent = currentVolume * 100;
    const transformPercent = parseFloat(transform); // strips the "%"

    // 0.1% tolerance (floating point)
    if (Math.abs(currentPercent - transformPercent) > 0.1) {
      observer.disconnect(); // prevent re-triggering while we update
      volumeSlider.style.setProperty("--progress-bar-transform", `${currentPercent}%`);
      observer.observe(volumeSlider, { attributes: true, attributeFilter: ["style"] });
    }
  });
  observer.observe(volumeSlider, { attributes: true, attributeFilter: ["style"] });

  // Similar to the other observer, but for the input (you'll notice it when scrolling the volume slider)
  if (!volumeSliderInput) return;
  const inputObserver = new MutationObserver(() => {
    // 0.1% tolerance (floating point)
    if (Math.abs(currentVolume - volumeSliderInput.valueAsNumber) > 0.1) {
      inputObserver.disconnect(); // prevent re-triggering while we update
      volumeSliderInput.value = currentVolume.toString();
      inputObserver.observe(volumeSlider, { attributes: true, attributeFilter: ["value"] });
    }
  });
  inputObserver.observe(volumeSlider, { attributes: true, attributeFilter: ["value"] });
}
