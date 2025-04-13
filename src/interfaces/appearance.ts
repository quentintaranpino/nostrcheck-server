interface DynamicBackground {
    name: string;
    orientation: string;
    color1?: string;
    color2?: string;
    color3?: string;
    color1Percent?: string;
    color2Percent?: string;
    color3Percent?: string;
    particles?: string;
}

const dynamicbackgroundThemes: { [key: string]: DynamicBackground } = {

    default: {
        name : "Essence",
        orientation: "to top",
        color1: "#9795F0",
        color2: "#9795F0",
        color3: "#000000",
        color1Percent: "0%",
        color2Percent: "25%",
        color3Percent: "90%",
        particles: "quantum"
    },
    essence: {
        name : "Essence",
        orientation: "to top",
        color1: "#9795F0",
        color2: "#9795F0",
        color3: "#000000",
        color1Percent: "0%",
        color2Percent: "25%",
        color3Percent: "90%",
        particles: "quantum"
    },
    serenity: {
        name : "Serenity",
        orientation: "to right",
        color1: "#C880B3",
        color2: "#AA6CF9",
        color3: "#82AAEB",
        color1Percent: "0%",
        color2Percent: "50%",
        color3Percent: "100%",
        particles: "astral"
    },
    aurora: {
        name : "Aurora",
        orientation: "to top left",
        color1: "#007BFF",
        color2: "#FF66B2",
        color3: "#FF9933",
        color1Percent: "0%",
        color2Percent: "55%",
        color3Percent: "90%",
        particles: "astral"
    },
    presence: {
        name : "Presence",
        orientation: "to top right",
        color1: "#0d0606",
        color2: "#9e1f1f",
        color3: "#0d0606",
        color1Percent: "0%",
        color2Percent: "50%",
        color3Percent: "100%",
        particles: "quantum"
    },
    perac: {
        name : "Perac",
        orientation: "to bottom right",
        color1: "#FF4E50",
        color2: "#FC913A",
        color3: "#F9D423",
        color1Percent: "20%",
        color2Percent: "55%",
        color3Percent: "92%",
        particles: "quantum"
    },
    dawn: {
        name : "Dawn",
        orientation: "to top left",
        color1: "#95C7F0",
        color2: "#912FBA",
        color3: "#000000",
        color1Percent: "33%",
        color2Percent: "58%",
        color3Percent: "95%",
        particles: "nexus"
    },
    forest: {
        name : "Forest",
        orientation: "to top left",
        color1: "#9bbd3d",
        color2: "#2cc978",
        color3: "#209257",
        color1Percent: "20%",
        color2Percent: "52%",
        color3Percent: "92%",
        particles: "astral"
    },
};

const particles = [
    "quantum",
    "astral",
    "nexus",
    "none"
];

interface UserdashcardPrefs {
    id: string;
    visible: boolean;
    order: number;
}
  
interface UserProfilePrefs {
    dynamicBackground?: DynamicBackground;
}
    
interface userPrefs {
    id: string;
    dashcards?: UserdashcardPrefs[];
    profile?: UserProfilePrefs;
}
  
const acceptedSettigsFiles = [
    "appearance.server.logo.light",
    "appearance.server.logo.dark",
    "relay.icon",
    "media.image.not.found",
    "media.image.banned",
];

type SettingsFileOptions = {
	width: number;
	height: number;
	background: { r: number; g: number; b: number; alpha: number };
	format: "png" | "webp";
	quality?: number;
};

const settingsFileConfig: Record<string, SettingsFileOptions> = {
	"relay.icon": {
		width: 200,
		height: 200,
		background: { r: 0, g: 0, b: 0, alpha: 0 },
		format: "png",
		quality: 95
	},
	"media.image.not.found": {
		width: 650,
		height: 650,
		background: { r: 0, g: 0, b: 0, alpha: 0 },
		format: "webp",
		quality: 95
	},
    
    "media.image.banned": {
		width: 650,
		height: 650,
		background: { r: 0, g: 0, b: 0, alpha: 0 },
		format: "webp",
		quality: 95
	},
	"default": {
		width: 180,
		height: 61,
		background: { r: 0, g: 0, b: 0, alpha: 0 },
		format: "png",
		quality: 95
	}
};

export { DynamicBackground, dynamicbackgroundThemes, particles, userPrefs, acceptedSettigsFiles, settingsFileConfig };