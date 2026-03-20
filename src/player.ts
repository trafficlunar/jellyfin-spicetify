import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api/playstate-api";
import { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";

import Fuse from "fuse.js";

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

export function setOldTime(value: number) {
  // no signal because we don't need to subscribe to it
  oldTime = value;
}

const BITRATE_MAP: Record<string, string> = {
  high: "320000",
  medium: "256000",
  low: "128000",
};

const VOLUME_ICONS: Record<string, string> = {
  high: `<path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4a3.64 3.64 0 0 1-1.33-4.967 3.64 3.64 0 0 1 1.33-1.332l6.925-4a.75.75 0 0 1 .75 0zm-6.924 5.3a2.14 2.14 0 0 0 0 3.7l5.8 3.35V2.8zm8.683 4.29V5.56a2.75 2.75 0 0 1 0 4.88"></path><path d="M11.5 13.614a5.752 5.752 0 0 0 0-11.228v1.55a4.252 4.252 0 0 1 0 8.127z"></path>`,
  medium: `<path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4a3.64 3.64 0 0 1-1.33-4.967 3.64 3.64 0 0 1 1.33-1.332l6.925-4a.75.75 0 0 1 .75 0zm-6.924 5.3a2.14 2.14 0 0 0 0 3.7l5.8 3.35V2.8zm8.683 6.087a4.502 4.502 0 0 0 0-8.474v1.65a3 3 0 0 1 0 5.175z"></path>`,
  low: `<path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4a3.64 3.64 0 0 1-1.33-4.967 3.64 3.64 0 0 1 1.33-1.332l6.925-4a.75.75 0 0 1 .75 0zm-6.924 5.3a2.14 2.14 0 0 0 0 3.7l5.8 3.35V2.8zm8.683 4.29V5.56a2.75 2.75 0 0 1 0 4.88"></path>`,
  muted: `<path d="M13.86 5.47a.75.75 0 0 0-1.061 0l-1.47 1.47-1.47-1.47A.75.75 0 0 0 8.8 6.53L10.269 8l-1.47 1.47a.75.75 0 1 0 1.06 1.06l1.47-1.47 1.47 1.47a.75.75 0 0 0 1.06-1.06L12.39 8l1.47-1.47a.75.75 0 0 0 0-1.06"></path><path d="M10.116 1.5A.75.75 0 0 0 8.991.85l-6.925 4a3.64 3.64 0 0 0-1.33 4.967 3.64 3.64 0 0 0 1.33 1.332l6.925 4a.75.75 0 0 0 1.125-.649v-1.906a4.7 4.7 0 0 1-1.5-.694v1.3L2.817 9.852a2.14 2.14 0 0 1-.781-2.92c.187-.324.456-.594.78-.782l5.8-3.35v1.3c.45-.313.956-.55 1.5-.694z"></path>`,
};

// Stop Jellfin audio
export function stop() {
  hijackActive.set(false);
  audio.pause();
  Spicetify.Player.setVolume(currentVolume);
}

export async function playTrack(id: string) {
  if (!jellyfin.api) return;

  try {
    const oldVolume = hijackActive ? currentVolume : Spicetify.Player.getVolume();
    if (!hijackActive.get()) Spicetify.Player.setVolume(0); // Set Spotify audio volume to 0

    hijackActive.set(true);
    oldTime = 0;
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
    console.debug("[Jellyfin]: Attempting to play:", audio.src);
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

    const trackName = event.data.item.name;
    const searchResults = await getSearchApi(jellyfin.api).getSearchHints({
      searchTerm: trackName,
      includeItemTypes: [BaseItemKind.Audio],
      limit: 32,
    });

    if (!searchResults.data.SearchHints || searchResults.data.SearchHints.length === 0) {
      stop();
      return;
    }

    // Fuzzy search
    const artists = event.data.item.artists?.map((a) => a.name).join(" ") ?? "";
    const list = searchResults.data.SearchHints.map((v) => ({
      id: v.Id ?? "",
      name: v.Name ?? "Unknown title",
      artists: (v.Artists ?? ["Unknown artist"]).join(" "),
    }));

    const results = new Fuse(list, {
      keys: ["name", "artists"],
      threshold: 0.75,
    }).search(`${trackName} ${artists}`);

    console.debug(`[Jellyfin]: Query is "${trackName} ${artists}"`);
    console.debug("[Jellyfin]: Search list:", list);
    console.debug("[Jellyfin]: Fuse search found:", results);

    const track = results[0]?.item;
    if (!track) {
      stop();
      return;
    }

    Spicetify.showNotification("Playing on Jellyfin");
    canUseJellyfin.set(true);
    playTrack(track.id);

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
    if (Math.abs(timeDiff - 100) < 200) {
      // Allow 200ms tolerance
      oldTime = event.data;
      return;
    }

    console.debug(`[Jellyfin]: Seek detected - onprogress reports ${event.data}, old time was ${oldTime}`);

    audio.currentTime = event.data / 1000;
    oldTime = event.data;
  });

  const volumeIcon: SVGElement | null = document.querySelector(".volume-bar__icon-button > span > svg");
  const volumeSlider: HTMLDivElement | null = document.querySelector(".volume-bar__slider-container > div > div");
  const volumeSliderInput: HTMLInputElement | null = document.querySelector(".volume-bar__slider-container > div > label > input");

  // Hijack Spotify APIs to change volume of Jellyfin audio instead of Spotify audio
  const playback = Spicetify.Platform.PlaybackAPI;
  playback.setVolume = new Proxy(playback.setVolume, {
    apply(target, thisArg, args) {
      currentVolume = args[0];

      if (hijackActive.get()) {
        console.debug("[Jellyfin]: Volume is", currentVolume);

        audio.volume = Math.pow(currentVolume, 3) * 0.425;
        if (volumeSlider) volumeSlider.style.setProperty("--progress-bar-transform", `${currentVolume * 100}%`);
        if (volumeSliderInput) volumeSliderInput.value = currentVolume.toString();
        if (volumeIcon) volumeIcon.innerHTML = VOLUME_ICONS[getExpectedVolumeIcon()];
        return;
      }
      return Reflect.apply(target, thisArg, args);
    },
  });

  // Spotify tries to set the volume on the slider to 0 when hijacked, this tries to revert it
  if (volumeSlider) {
    const observer = new MutationObserver(() => {
      if (!hijackActive.get()) return;
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
  }

  // Similar to the other observer, but for the input (you'll notice it when scrolling the volume slider)
  if (volumeSliderInput) {
    const inputObserver = new MutationObserver(() => {
      if (!hijackActive.get()) return;

      // 0.1% tolerance (floating point)
      if (Math.abs(currentVolume - volumeSliderInput.valueAsNumber) > 0.1) {
        inputObserver.disconnect(); // prevent re-triggering while we update
        volumeSliderInput.value = currentVolume.toString();
        inputObserver.observe(volumeSliderInput, { attributes: true, attributeFilter: ["value"] });
      }
    });

    inputObserver.observe(volumeSliderInput, { attributes: true, attributeFilter: ["value"] });
  }

  // Similar, but for volume icon (tries to show up as muted)
  if (volumeIcon) {
    let currentIcon = "";
    const observer = new MutationObserver(() => {
      if (!hijackActive.get()) return;

      const expectedIcon = getExpectedVolumeIcon();
      if (currentIcon === expectedIcon) return;

      observer.disconnect(); // prevent re-triggering while we update
      currentIcon = expectedIcon;
      volumeIcon.innerHTML = VOLUME_ICONS[getExpectedVolumeIcon()];
      observer.observe(volumeIcon, { childList: true, subtree: true });
    });

    observer.observe(volumeIcon, { childList: true, subtree: true });
  }
}

function getExpectedVolumeIcon(): string {
  if (currentVolume >= 0.66) return "high";
  if (currentVolume >= 0.33) return "medium";
  if (currentVolume !== 0) return "low";
  return "muted";
}
