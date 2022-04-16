const { firefox } = require('playwright');
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { exec } = require("child_process");
const xml2js = require("xml2js");

const ffmpeg_path = path.join(__dirname, "ffmpeg", "bin", "ffmpeg.exe");

const Selectors = {
    ALREADY_REGISTERED: "//*[text()='Already Registered?']",
    EMAIL_INPUT: "input.login-field",
    LOGIN_BUTTON: "#login-container > div > form > div > div.col-xs-12.col-sm-2.submit-container > button",
    FULLSCREEN_BUTTON: "[aria-label='Full Screen']",
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleSlides(url) {
    console.log("GETTING SLIDE TIME DATA");

    const result = await axios(url, { method: "GET" });

    const presentationLog = result.data.presentationLog;
    const filtered = presentationLog.filter(i => i.mediaURL.includes("http") || i.mediaURL === "reserved");
    const timestamps = filtered.map(i => i.timestamp);

    let durationPerEach = [];
    let lastLoggedTime = 0;

    for (let timestamp of timestamps) {
        if (lastLoggedTime !== 0) {
            durationPerEach.push((timestamp - lastLoggedTime) / 1000);
        }

        lastLoggedTime = timestamp;
    }

    let durationPerEachSlice = 0;

    for (let i of durationPerEach) {
        if (i === 0)
            durationPerEachSlice += 1;
        else
            break;
    }

    durationPerEach = durationPerEach.slice(durationPerEachSlice);

    let durations = [0];

    let lastDuration = 0;

    for (let duration of durationPerEach) {
        let current = lastDuration + duration;
        durations.push(current);

        lastDuration = current;
    }

    return { durations, durationPerEach };
}

async function downloadMpd(mpdPath, outputPath) {
    console.log(`DOWNLOADING MPD TO ${outputPath}`);

    return new Promise((resolve, _) => {
        try {
            exec(`${ffmpeg_path} -i ${mpdPath} -codec copy ${outputPath}`, (error, stdout, stderr) => {
                if (error) {
                    console.log(stdout);
                    console.log(stderr);
                    reject(false);
                }

                resolve(true);
            });
        } catch (e) {
            console.log(e);
            resolve(false);
        }
    });
}

async function combineAudioAndVideo(mp4Path, audPath, outPath) {
    console.log("COMBINING VIDEO AND AUDIO");

    return new Promise((resolve, _) => {
        try {
            exec(`${ffmpeg_path} -i ${mp4Path} -i ${audPath} -c:v copy -c:a aac ${outPath}`, (error, stdout, stderr) => {
                if (error) {
                    console.log(stderr);
                    reject(false);
                }

                resolve(true);
            });
        } catch (e) {
            console.log(e);
            resolve(false);
        }
    });
}

async function scrapeMpd(mpdUrl, initAudUrl, initVidUrl, audSegUrl, vidSegUrl) {
    const mpdRequestResult = await axios.get(mpdUrl);
    const tempMpdPath = "./tmp/temp.mpd";

    const xml = mpdRequestResult.data;
    const builder = new xml2js.Builder();

    const result = await xml2js.parseStringPromise(xml);

    const audSegmentTemplate = result.MPD.Period[0].AdaptationSet[0].SegmentTemplate[0];
    const vidSegmentTemplate = result.MPD.Period[0].AdaptationSet[1].SegmentTemplate[0];

    audSegmentTemplate.$.initialization = initAudUrl;
    audSegmentTemplate.$.media = audSegUrl.split("seg")[0] + "seg-$Number$.m4f";

    vidSegmentTemplate.$.initialization = initVidUrl;
    vidSegmentTemplate.$.media = vidSegUrl.split("seg")[0] + "seg-$Number$.m4f";

    delete result.MPD.$.minBufferTime;

    let outPath;

    if (vidSegmentTemplate.SegmentTimeline[0].S.length > 2) {
        const newXml = builder.buildObject(result);
        fs.writeFileSync(tempMpdPath, newXml);

        outPath = "./tmp/mpdOutput.mp4"
    } else {
        delete result.MPD.Period[0].AdaptationSet[1];

        outPath = "./tmp/mpdOutput.m4a";
    }

    const newXml = builder.buildObject(result);
    fs.writeFileSync(tempMpdPath, newXml);

    await downloadMpd(tempMpdPath, outPath);

    return outPath;
}

async function run({ url, email, outputDir }) {
    const browser = await firefox.launch({
        headless: true,
    });

    const page = await browser.newPage();

    await page.setViewportSize({ width: 1920, height: 1080 });

    let durationData;

    let mpdUrl;
    let initAudUrl;
    let initVidUrl;
    let audSegUrl;
    let vidSegUrl;
    let isMediaScrapingStarted = false;

    let mpdFilePath;

    await page.route('**/*', async (route) => {
        let url = route.request().url();

        if (typeof durationData === "undefined") {
            if (url.includes("https://event.on24.com/eventRegistration/includes/eventsync.jsp?")) {
                durationData = await handleSlides(url);
            }
        }

        if (typeof mpdUrl === "undefined" && url.includes("mpd")) {
            mpdUrl = url;
        }

        if (typeof initAudUrl === "undefined" && url.includes("audio") && url.includes("init.mp4")) {
            initAudUrl = url;
        }

        if (typeof initVidUrl === "undefined" && url.includes("video") && url.includes("init.mp4")) {
            initVidUrl = url;
        }

        if (typeof audSegUrl === "undefined" && url.includes("audio") && url.includes("m4f")) {
            audSegUrl = url;
        }

        if (typeof vidSegUrl === "undefined" && url.includes("video") && url.includes("m4f")) {
            vidSegUrl = url;
        }

        if (!isMediaScrapingStarted && mpdUrl && initAudUrl && initVidUrl && audSegUrl && vidSegUrl) {
            isMediaScrapingStarted = true;

            mpdFilePath = await scrapeMpd(mpdUrl, initAudUrl, initVidUrl, audSegUrl, vidSegUrl);
        }

        return route.continue();
    });

    await page.goto(url, { timeout: 50000 });

    await page.waitForSelector("span[name='title']");

    const eventTitle = await page.evaluate(() => {
        return document.querySelector("span[name='title']").textContent.trim();
    });

    console.log("SCRAPING EVENT: " + eventTitle);

    const filename = eventTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    await page.click(Selectors.ALREADY_REGISTERED);
    await sleep(2000);
    await page.click(Selectors.EMAIL_INPUT);
    await sleep(2000);
    await page.keyboard.type(email);
    await sleep(1500);
    await page.click(Selectors.LOGIN_BUTTON);
    await page.waitForSelector("video");

    await page.evaluate(() => {
        document.querySelector("video").muted = true;
    });

    let tryCount = 0;

    while (typeof durationData === "undefined" && tryCount < 5) {
        console.log("WAITING FOR SLIDE DATA TO BE FETCHED");
        await sleep(2000);
        tryCount += 1;
    }

    console.log("APPLYING CSS TO MAKE IFRAME FULL SCREEN");
    await page.evaluate(() => {
        const slideContainer = document.querySelector('[aria-label="player_slide"]');

        slideContainer.style = `position: absolute !important;left: 0px !important;top: 0px !important;width: 100vw !important;height: 100vh !important;z-index: 9999 !important;padding: 0px !important;margin: 0px !important;`;

        const windowContent = document.querySelector(".window-content");

        windowContent.style = `
            border: none !important;
            width: none;
        `;

        document.querySelector("#dock-widget-list").remove();
    });

    await sleep(4000);
    const vidDuration = await page.evaluate(() => {
        return document.querySelector("video").duration;
    });

    durationData.durationPerEach.push(Math.abs(vidDuration - durationData.durations[durationData.durations.length - 1]));
    console.log("TOTAL DURATION: " + durationData.durationPerEach.reduce((a, b) => a + b));

    await sleep(3000);

    await page.evaluate(async () => {
        document.querySelector("video").play();

        await new Promise((resolve, _) => {
            setTimeout(() => {
                document.querySelector("video").pause();
                resolve(true);
            }, 1500);
        });
    });

    for (let i = 0; i < durationData.durations.length; i++) {
        let duration = durationData.durations[i];
        console.log("SETTING DURATION TO: " + (duration + 1));

        await page.evaluate(({ duration }) => {
            document.querySelector("video").currentTime = duration + 1;
        }, { duration });

        await sleep(4000);

        const ssPath = `./tmp/${i}.jpg`;

        await page.screenshot({
            fullPage: true,
            path: ssPath,
        });

        await sleep(4000);
    }

    console.log("CREATING THE FFMPEG INPUT FILE FOR THE SLIDE");
    let outputTxt = ``;

    for (let i = 0; i < durationData.durationPerEach.length; i++) {
        const slideDuration = durationData.durationPerEach[i];

        outputTxt += `file ${i}.jpg\n`;
        outputTxt += `duration ${slideDuration}\n`;
    }

    const inputTxtPath = path.join(__dirname, "tmp", "input.txt");
    const outputPath = path.join(__dirname, "tmp", "output.mp4");
    const formattedOutputPath = path.join(__dirname, "tmp", `formattedOutput.mp4`);

    fs.writeFileSync(inputTxtPath, outputTxt, { encoding: "utf8" });

    console.log("CREATING THE SLIDE MP4");

    await new Promise((resolve, _) => {
        try {
            exec(`${ffmpeg_path} -f concat -i ${inputTxtPath} -pix_fmt yuv420p ${outputPath}`, (error, stdout, stderr) => {
                if (error) {
                    console.log(stderr);
                    reject(false);
                }

                resolve(true);
            });
        } catch (e) {
            console.log(e);
            resolve(false);
        }
    });

    console.log("FORMATTING THE SLIDE MP4");

    await new Promise((resolve, reject) => {
        try {
            exec(`${ffmpeg_path} -ss 00:00:00 -i ${outputPath} -to ${new Date(vidDuration * 1000).toISOString().substr(11, 8)} -c copy ${formattedOutputPath}`, (error, stdout, stderr) => {
                if (error) {
                    console.log(stderr);
                    reject(false);
                }

                resolve(true);
            });
        } catch (e) {
            console.log(e);
            reject(false);
        }
    });

    fs.unlinkSync(outputPath);

    while (typeof mpdFilePath === "undefined") {
        console.log("WAITING FOR MPD TO BE DOWNLOADED");
        await sleep(12000);
    }

    if (mpdFilePath.endsWith("m4a")) {
        console.log("WILL COMBINE AUDIO AND VIDEO");
        await combineAudioAndVideo(formattedOutputPath, mpdFilePath, path.join(outputDir, `video-${filename}.mp4`));
    } else {
        console.log("SEPERATING THE OUTPUT");

        fs.renameSync(mpdFilePath, path.join(outputDir, `video-${filename}.mp4`));
        fs.renameSync(formattedOutputPath, path.join(outputDir, `slide-${filename}-slide.mp4`));
    }

    console.log(`PROCESS FINISHED, OUTPUT IS SAVED TO ${outputDir}`);
    process.exit(0);
}

function cleanTmp() {
    console.log("CLEANING TMP FOLDER");

    const tmpPath = path.join(__dirname, 'tmp');
    const files = fs.readdirSync(tmpPath);

    files.forEach((file) => {
        const fileDir = path.join(tmpPath, file);

        if (file !== '.gitkeep') {
            fs.unlinkSync(fileDir);
        }
    });
}

function formatEventUrl(urlStr) {
    const url = new URL(urlStr);
    const eventId = url.searchParams.get("eventid");

    return eventId === null ? url.href : `https://event.on24.com/wcc/r/${url.searchParams.get("eventid")}/${url.searchParams.get("key")}`;
}

(async () => {
    cleanTmp();

    const args = process.argv.slice(2);

    if (args.length >= 2) {
        const email = args[0];
        const url = formatEventUrl(args[1]);

        let outputDir = args.length === 3 ? args[2] : path.join(__dirname, "output");

        // await run({ url, email, outputDir });

        fs.writeFileSync(path.join(outputDir, "test.log"), "testlog", { encoding: "utf8" });
        process.exit(0);
    } else {
        console.log(`RUN THE PROGRAM WITH REQUIRED ARGS, (e.g npm run start $email $url)`);
    }
})();

// https://event.on24.com/wcc/r/3391860/7A75705D3AD3DA408932E598E65E11A0 - 1 slide 1 video, complex
// https://event.on24.com/wcc/r/3218877/2A5AEE368FB66E465FD4AB45FB89E5A6 - 1 slide 1 video, normal
// https://event.on24.com/wcc/r/3332761/EDEE0622C2A434A23EBD64E25EC7CCE9 - 1 slide
