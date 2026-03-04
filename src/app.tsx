// TODO: hijack search result, use that as song URI

import React from "react";
import { Api, Jellyfin } from "@jellyfin/sdk";
import SettingsModal from "./settings";

const audio = new Audio("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3");
let hijackActive = false;

export const jellyfin = new Jellyfin({
	clientInfo: {
		name: "Spicetify",
		version: "1.0.0",
	},
	deviceInfo: {
		name: "Spotify",
		id: "spotify", // TODO: should be unique?
	},
});

export let jellyfinApi: Api | undefined;
export const setJellyfinApi = (api: Api) => {
	jellyfinApi = api;
};

async function main() {
	while (!Spicetify.showNotification || !Spicetify.Platform.History) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	new Spicetify.Topbar.Button("Jellyfin", "podcasts", () => {
		Spicetify.PopupModal.display({
			title: "Jellyfin",
			content: React.createElement(SettingsModal) as unknown as Element,
			isLarge: false,
		});
	});

	Spicetify.Platform.History.listen((location) => {
		if (location.pathname.startsWith("/search/")) {
			const segments = location.pathname.split("/");
			const query = segments[2];
		}
	});

	Spicetify.Player.addEventListener("songchange", async (event) => {
		// if (event?.data.item.uri === "spotify:track:72wehM3q2RVZb4XLmAkyTr") {
		const oldVolume = Spicetify.Player.getVolume();
		await audio.play();

		Spicetify.Player.setVolume(0);
		hijackActive = true;
		Spicetify.Player.setVolume(oldVolume);
	});

	Spicetify.Player.addEventListener("onplaypause", async (event) => {
		if (!hijackActive) return;

		if (event?.data.isPaused) {
			audio.pause();
		} else {
			await audio.play();
		}
	});

	const playback = Spicetify.Platform.PlaybackAPI;

	// Change volume of Jellyfin audio instead of Spotify audio
	playback.setVolume = new Proxy(playback.setVolume, {
		apply(target, thisArg, args) {
			if (hijackActive) {
				audio.volume = args[0];
				return;
			} else {
				return Reflect.apply(target, thisArg, args);
			}
		},
	});

	// Show message on start.
	Spicetify.showNotification("Hello!");
}

export default main;
