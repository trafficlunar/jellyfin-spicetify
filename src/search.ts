import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
import * as jellyfin from "./jellyfin";
import * as player from "./player";

// Add Jellyfin tracks to search (usually for songs not available on Spotify)
export function init() {
  Spicetify.Platform.History.listen(async (location) => {
    if (!jellyfin.api) return;
    if (!location.pathname.startsWith("/search/")) return;

    const segments = location.pathname.split("/");
    const query = segments[2];

    const results = await getSearchApi(jellyfin.api).getSearchHints({
      searchTerm: query,
      includeItemTypes: [BaseItemKind.Audio],
      limit: 4,
    });

    const searchHints = results.data.SearchHints;
    if (!searchHints || searchHints.length === 0) return;

    const parent = document.querySelectorAll(".main-trackList-trackList > div > div")[1];
    if (!parent) return;

    // Use actual track as a template
    const template = parent.querySelector<HTMLDivElement>("div");
    if (!template) return;

    searchHints.forEach((trackInfo) => {
      // TODO: Skip if Spotify already has this track in its results (it will be hijacked instead)

      const track = template.cloneNode(true) as HTMLDivElement;
      const sectionStart = track.querySelector(".main-trackList-rowSectionStart");
      const sectionEnd = track.querySelector(".main-trackList-rowSectionEnd");
      const rowContent = track.querySelector(".main-trackList-rowMainContent");
      const albumCover = sectionStart?.querySelector<HTMLImageElement>("img");
      const songTitle = rowContent?.querySelector("div");
      rowContent?.querySelector(".encore-text-body-medium.encore-internal-color-text-subdued")?.remove(); // Remove explicit icon
      const songArtist = rowContent?.querySelector<HTMLSpanElement>(".encore-text-body-small > span");
      const duration = sectionEnd?.querySelector(".encore-internal-color-text-subdued");
      const contextMenuButton = sectionEnd?.lastElementChild as HTMLButtonElement;

      if (!albumCover || !songTitle || !songArtist || !duration || !sectionEnd || !contextMenuButton || !trackInfo.Id) return;

      // Remove all children of sectionEnd except duration and context menu button
      Array.from(sectionEnd.children).forEach((child) => {
        if (child !== duration || child !== contextMenuButton) child.remove();
      });

      // Instead of removing, hide it to keep gap
      contextMenuButton.style.opacity = "0";

      // TODO: fallback image
      albumCover.src = `${jellyfin.api?.basePath}/Items/${trackInfo.Id}/Images/Primary?fillHeight=40&fillWidth=40&quality=96`; // Aim for 40x40 resolution
      albumCover.srcset = "";
      songTitle.textContent = trackInfo.Name ?? "Unknown title";
      songArtist.innerHTML = ""; // Remove hyperlink to artist page
      songArtist.textContent = trackInfo.Artists?.join(", ") ?? "Unknown artist";

      // Set duration text
      if (trackInfo.RunTimeTicks) {
        const durationMs = trackInfo.RunTimeTicks / 10000;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        duration.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
      }

      track.addEventListener("dblclick", () => {
        Spicetify.Player.pause();
        // TODO: hijack player html
        player.playTrack(trackInfo.Id!);
      });

      parent.insertBefore(track, parent.firstChild);
    });
  });
}
