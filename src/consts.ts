// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'BigfootDS';
export const SITE_DESCRIPTION = 'Australian-made games and software.';

export interface ProjectPlatformsData {
	name: string;
	url: string;
}

export interface ProjectData {
	title: string;
	platforms: ProjectPlatformsData[];
	type: "game" | "package" | "app";
	abbreviation: string;
	/**
	 * Image file extension for the legacy `/work/` card asset. The default is
	 * JPEG; projects with a versioned PNG Steam asset must opt in explicitly.
	 */
	cardImageExtension?: "jpg" | "png";
	tagline: string;
	releaseYear?: string;
	ytIframeString?: string;
}

export const dataGamesReleased: Array<ProjectData> = [
	{
		abbreviation: "PPVR",
		title: "Planet Protector VR",
		type: "game",
		tagline:"Defend your city from alien invaders in this colorful virtual reality game! Aim, shoot, and protect your planet for as long as you can!",
		releaseYear: "2017",
		platforms: [
			{
				name: "SteamVR",
				url: "https://store.steampowered.com/app/656320/Planet_Protector_VR/"
			}
		],
		ytIframeString: `<span>
		<iframe
		  id="ppvrVideo"
		  src="https://www.youtube-nocookie.com/embed/XTjMiBAlKGg?autoplay=1&amp;mute=1&amp;loop=1&amp;color=333463&amp;title=0&amp;byline=0&amp;portrait=0&amp;playlist=XTjMiBAlKGg"
		  width="100%"
		  height="100%"
		  overflow="hidden"
		  frameBorder="0"
		  webkitallowfullscreen=""
		  mozallowfullscreen=""
		  allowFullScreen=""
		  volume="0"
		  title="Planet Protector VR trailer"
		></iframe>
	  </span>`
	}
];

export const dataGamesWip: Array<ProjectData> = [
	{
		abbreviation: "GODM",
		cardImageExtension: "png",
		title: "Godmaker: Patrons & Prophets",
		type: "game",
		tagline: "Become the ultimate patron of power in your own fantasy world! Build your gathering of followers, manipulate the mortal realm and grow your godhood to become the highest power in reality.",
		releaseYear: "Late 2025",
		platforms: [
			{
				name: "Steam",
				url: "https://store.steampowered.com/app/1792550/"
			}
		]
	}
];

export const dataGamesBackburner: Array<ProjectData> = [
	{
		abbreviation: "BEES",
		title: "The Bestest Beehive",
		type: "game",
		releaseYear: "Eventually!",
		tagline: "Explore your way around infinite worlds full of flourishing flora, brilliant bees, and long-forgotten wonders. You & your friends can rebuild the world together while collecting & growing a massive variety of flora & bees!",
		platforms: [
			{
				name: "Steam",
				url: "https://store.steampowered.com/app/749460/The_Bestest_Beehive/"
			}
		]
	},
];


export const dataPackagesReleased: Array<ProjectData> = [
	{
		abbreviation: "SUPE",
		title: "SuperCamo",
		type: "package",
		tagline: "Camo-inspired ODM for NeDB, built specifically for BigfootDS' needs.",
		releaseYear: "September 2024",
		platforms: [
			{
				name: "Website",
				url:"https://bigfootds.github.io/supercamo/"
			},
			{
				name: "GitHub",
				url: "https://github.com/BigfootDS/supercamo"
			},
			{
				name: "NPM",
				url: "https://www.npmjs.com/package/@bigfootds/supercamo"
			}
		]
	},
	{
		abbreviation: "USEM",
		title:"Unity Semver Updater",
		type:"package",
		tagline: "NodeJS tool to update a Unity project's version to a specified format - typically the semver format.",
		platforms: [
			{
				name: "GitHub",
				url: "https://github.com/BigfootDS/unity-semver-updater"
			},
			{
				name: "NPM",
				url:"https://www.npmjs.com/package/@bigfootds/unity-semver-updater"
			}
		],
		releaseYear: "July 2024"
	}, 
	{
		abbreviation: "NPMC",
		title:"NPM Compliance Helper",
		type: "package",
		tagline: "Tool to help generate legal & copyright notices about project dependencies.",
		releaseYear: "May 2024",
		platforms: [
			{
				name: "GitHub",
				url: "https://github.com/BigfootDS/npm-compliance-helper"
			},
			{
				name:"NPM",
				url:"https://www.npmjs.com/package/@bigfootds/npm-compliance-helper"
			}
		]
	}
];


export const dataAppsWip: Array<ProjectData> = [
	{
		abbreviation: "SPOL",
		title: "Sourcepool",
		type: "app",
		tagline: "TTRPG content management system, ready for you to self-host. Open-source project currently in early WIP stages.",
		releaseYear: "Late 2025",
		platforms: [
			{
				name:"GitHub",
				url: "https://github.com/BigfootDS/Sourcepool"
			}
		]
	}
]
