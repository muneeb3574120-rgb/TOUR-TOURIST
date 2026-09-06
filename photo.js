/*
    TOUR TOURIST
    DESTINATION PHOTO SYSTEM
    Wikimedia Commons
    Loads requests safely instead of 400 at once.
*/

const TOUR_TOURIST_PHOTOS = {

    cache: {},

    queue: [],
    running: 0,
    maxConcurrent: 3,

    async getPhoto(destination, country) {

        const key = destination + "|" + country;

        if (this.cache[key]) {
            return this.cache[key];
        }

        return new Promise((resolve) => {

            this.queue.push({
                destination: destination,
                country: country,
                key: key,
                resolve: resolve
            });

            this.processQueue();

        });

    },

    processQueue() {

        while (
            this.running < this.maxConcurrent &&
            this.queue.length > 0
        ) {

            const job = this.queue.shift();

            this.running++;

            this.searchPhoto(
                job.destination,
                job.country
            )
            .then((photo) => {

                this.cache[job.key] = photo;

                job.resolve(photo);

            })
            .catch((error) => {

                console.error(
                    "Photo error:",
                    job.destination,
                    error
                );

                const fallback =
                    this.fallback(job.destination);

                this.cache[job.key] = fallback;

                job.resolve(fallback);

            })
            .finally(() => {

                this.running--;

                this.processQueue();

            });

        }

    },

    async searchPhoto(destination, country) {

        const searchText =
            '"' + destination + '" "' + country + '"';

        const api =
            "https://commons.wikimedia.org/w/api.php" +
            "?action=query" +
            "&generator=search" +
            "&gsrsearch=" +
            encodeURIComponent(searchText) +
            "&gsrnamespace=6" +
            "&gsrlimit=10" +
            "&prop=imageinfo" +
            "&iiprop=url|extmetadata" +
            "&iiurlwidth=1200" +
            "&format=json" +
            "&origin=*";

        const controller =
            new AbortController();

        const timeout =
            setTimeout(() => {
                controller.abort();
            }, 15000);

        try {

            const response =
                await fetch(api, {
                    signal: controller.signal
                });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(
                    "Wikimedia HTTP " +
                    response.status
                );
            }

            const data =
                await response.json();

            if (
                !data.query ||
                !data.query.pages
            ) {
                return this.fallback(destination);
            }

            const pages =
                Object.values(data.query.pages);

            if (pages.length === 0) {
                return this.fallback(destination);
            }

            const destinationWords =
                destination
                    .toLowerCase()
                    .replace(/[^\w\s]/g, "")
                    .split(/\s+/)
                    .filter(word =>
                        word.length > 2
                    );

            const countryWords =
                country
                    .toLowerCase()
                    .replace(/[^\w\s]/g, "")
                    .split(/\s+/)
                    .filter(word =>
                        word.length > 2
                    );

            let bestPage = null;
            let bestScore = -1;

            pages.forEach(page => {

                const title =
                    (page.title || "")
                    .toLowerCase();

                let score = 0;

                destinationWords.forEach(word => {

                    if (title.includes(word)) {
                        score += 5;
                    }

                });

                countryWords.forEach(word => {

                    if (title.includes(word)) {
                        score += 2;
                    }

                });

                if (
                    title.includes(
                        destination.toLowerCase()
                    )
                ) {
                    score += 15;
                }

                if (
                    page.imageinfo &&
                    page.imageinfo[0]
                ) {
                    score += 2;
                }

                if (score > bestScore) {

                    bestScore = score;
                    bestPage = page;

                }

            });

            if (
                !bestPage ||
                !bestPage.imageinfo ||
                !bestPage.imageinfo[0]
            ) {
                return this.fallback(destination);
            }

            const info =
                bestPage.imageinfo[0];

            const metadata =
                info.extmetadata || {};

            return {

                url:
                    info.thumburl ||
                    info.url,

                originalUrl:
                    info.descriptionurl ||
                    info.url,

                title:
                    bestPage.title ||
                    destination,

                photographer:
                    this.cleanMetadata(
                        metadata.Artist
                    ),

                credit:
                    this.cleanMetadata(
                        metadata.Credit
                    ),

                license:
                    this.cleanMetadata(
                        metadata.LicenseShortName
                    ),

                licenseUrl:
                    this.cleanMetadata(
                        metadata.LicenseUrl
                    ),

                source:
                    "Wikimedia Commons",

                destination:
                    destination,

                country:
                    country

            };

        } catch (error) {

            clearTimeout(timeout);

            console.error(
                "Wikimedia search failed:",
                destination,
                error
            );

            return this.fallback(destination);

        }

    },

    cleanMetadata(value) {

        if (!value) {
            return "";
        }

        return String(value)
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .trim();

    },

    fallback(destination) {

        return {

            url:
                "https://images.unsplash.com/" +
                "photo-1500534623283-312aade485b7" +
                "?auto=format&fit=crop&w=1200&q=80",

            originalUrl: "",

            title:
                destination,

            photographer: "",

            credit: "",

            license: "",

            licenseUrl: "",

            source:
                "Temporary fallback",

            destination:
                destination,

            country: ""

        };

    }

};