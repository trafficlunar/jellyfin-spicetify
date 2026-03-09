export interface Settings {
  quality: "source" | "high" | "medium" | "low";
  hijack: boolean;
  nonSpotifySongs: boolean;
  reportPlayback: boolean;
}

export let settings: Settings = {
  quality: "source",
  hijack: true,
  nonSpotifySongs: true,
  reportPlayback: true,
};

export function setSettings(value: Settings) {
  settings = value;
}
