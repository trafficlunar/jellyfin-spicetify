import React from "react";
import SettingsModal from "./settings";

import * as jellyfin from "./jellyfin";
import * as player from "./player";
import * as search from "./search";
import { setSettings, Settings } from "./settingsStore";

async function main() {
  while (!Spicetify.showNotification) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0S15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189c.518 1.04 7.348 1.027 7.86 0c.511-1.027-2.874-7.19-3.93-7.19z"/></svg>`;
  let hasLoaded = false;

  new Spicetify.Topbar.Button("Jellyfin", icon, () => {
    if (!hasLoaded) {
      Spicetify.showNotification("Jellyfin is still loading, please wait...", true);
      return;
    }

    Spicetify.PopupModal.display({
      title: "Jellyfin",
      content: React.createElement(SettingsModal) as unknown as Element,
      isLarge: false,
    });
  });

  // Load settings
  const savedSettings = Spicetify.LocalStorage.get("jellyfin-settings");
  if (savedSettings) setSettings(JSON.parse(savedSettings) as unknown as Settings);

  await jellyfin.tryAutoLogin();
  player.registerEvents();
  search.init();

  const playerButton = new Spicetify.Playbar.Button(
    "Toggle Jellyfin Audio",
    icon,
    (self) => {
      if (self.active) {
        player.stop();
      } else {
        const oldVolume = player.currentVolume;
        Spicetify.Player.setVolume(0); // Set Spotify audio volume
        player.hijackActive.set(true);
        Spicetify.Player.setVolume(oldVolume); // Hijack is active, set Jellyfin audio volume

        player.audio.currentTime = Spicetify.Player.getProgress() / 1000; // Sync position
        if (Spicetify.Player.isPlaying()) player.audio.play();
      }
    },
    !player.canUseJellyfin.get(),
    player.hijackActive.get(),
  );
  player.canUseJellyfin.subscribe((v) => (playerButton.disabled = !v));
  player.hijackActive.subscribe((v) => (playerButton.active = v));
  playerButton.register();

  hasLoaded = true;
}

main();
