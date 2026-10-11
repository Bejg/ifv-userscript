// ==UserScript==
// @name         Improvements for Vulcan
// @name:pl      Ulepszenia dla VULCAN
// @namespace    https://github.com/Bejg/ifv-userscript
// @version      1.2.0
// @description  Poprawia uciążliwe elementy stron usług eduVULCAN oraz Dziennik Vulcan (port rozszerzenia banocean/ifv na userscript).
// @author       Bejg (userscript port); banocean (oryginalne rozszerzenie)
// @homepageURL  https://github.com/Bejg/ifv-userscript
// @supportURL   https://github.com/Bejg/ifv-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Bejg/ifv-userscript/main/ifv.user.js
// @updateURL    https://raw.githubusercontent.com/Bejg/ifv-userscript/main/ifv.user.js
// @license      MIT
// @match        *://dziennik-uczen.vulcan.net.pl/*
// @match        *://dziennik-wiadomosci.vulcan.net.pl/*
// @match        *://uczen.eduvulcan.pl/*
// @match        *://wiadomosci.eduvulcan.pl/*
// @match        *://dziennik-logowanie.vulcan.net.pl/*
// @match        *://eduvulcan.pl/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
    "use strict";

    const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

    const OPTIONS_KEY = "IFV_OPTIONS";
    const PATCH_SETTINGS_KEY = "IFV_PATCH_SETTINGS";

    const loadOptions = () => {
        try {
            return GM_getValue(OPTIONS_KEY, {}) || {};
        } catch (e) {
            return {};
        }
    };
    const saveOptions = (options) => {
        try {
            GM_setValue(OPTIONS_KEY, options);
        } catch (e) {
            console.error("[IFV]", e);
        }
    };
    const loadPatchSettings = () => {
        try {
            return GM_getValue(PATCH_SETTINGS_KEY, {}) || {};
        } catch (e) {
            return {};
        }
    };
    const savePatchSettings = (settings) => {
        try {
            GM_setValue(PATCH_SETTINGS_KEY, settings);
        } catch (e) {
            console.error("[IFV]", e);
        }
    };

    const isMobileView = () => window.innerWidth < 1024;
    const currentHost = () => W.location.hostname;

    const deviceOk = (devices) => {
        if (!devices) return true;
        if (devices === "mobileOnly") return isMobileView();
        if (devices === "desktopOnly") return !isMobileView();
        return true;
    };

    const SEARCH_ICON =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/search.svg";
    const CLEAR_ICON =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/clear.svg";
    const SETTINGS_ICON =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/settings.svg";
    const CLOSE_ICON =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/close.svg";
    const BACK_ICON =
        "https://raw.githubusercontent.com/banocean/ifv/new-navbar/assets/icons/keyboard_backspace_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg";
    const LOGO_RED =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/logo/logo-128-red.png";
    const LOGO_BLUE =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/logo/logo-128-blue.png";

    const MODULES = [];
    let didExecute = false;

    const appendModule = (module) => MODULES.push(module);

    const runModule = (module, isFirstRun) => {
        try {
            if (module.onlyOnReloads && !isFirstRun) return;
            if (module.doesRunHere !== undefined && !module.doesRunHere())
                return;

            if (!module.isLoaded || module.isLoaded()) {
                module.run();
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                let ready = false;
                try {
                    ready = module.isLoaded();
                } catch (e) {
                    ready = false;
                }
                if (!ready) return;
                obs.disconnect();
                try {
                    module.run();
                } catch (e) {
                    console.error("[IFV]", e);
                }
            });
            observer.observe(document.body, { subtree: true, childList: true });
        } catch (e) {
            console.error("[IFV]", e);
        }
    };

    const execute = () => {
        if (!MODULES.length)
            console.warn("[IFV] Uruchomiono bez włączonych patchy");
        const isFirstRun = !didExecute;
        didExecute = true;
        MODULES.forEach((module) => runModule(module, isFirstRun));
    };

    let lastLocation = W.location.pathname;

    W.history.pushState = new Proxy(W.history.pushState, {
        apply: (target, thisArg, args) => {
            const isPathnameChanged =
                args.length >= 3
                    ? W.location.pathname !== args[2].split("#")[0]
                    : true;
            if (args.length >= 3) lastLocation = args[2].split("#")[0];
            const result = target.apply(thisArg, args);
            if (MODULES.length && isPathnameChanged) execute();
            return result;
        },
    });

    W.addEventListener("popstate", () => {
        const isPathnameChanged = W.location.pathname !== lastLocation;
        if (MODULES.length && isPathnameChanged) execute();
    });

    const waitForRender = async (fn, target = document.body) => {
        let resolve;
        const wait = new Promise((r) => (resolve = r));
        const observer = new MutationObserver((mutations, obs) => {
            if (!fn()) return;
            resolve();
            obs.disconnect();
        });
        observer.observe(target, { subtree: true, childList: true });
        if (!fn()) await wait;
    };

    const waitForReplacement = async (fn, target = document.body) => {
        const initialElement = fn();
        if (!initialElement) return waitForRender(fn, target);

        let resolveDisappear;
        const waitForDisappear = new Promise((r) => (resolveDisappear = r));
        const disappearObserver = new MutationObserver((mutations, obs) => {
            if (!document.body.contains(initialElement)) {
                resolveDisappear();
                obs.disconnect();
            }
        });
        disappearObserver.observe(target, { subtree: true, childList: true });

        await waitForDisappear;
        return waitForRender(fn, target);
    };

    let asideMode;
    let asideReads = 0;

    const getAsideElement = async () => {
        if (asideMode === "hidden" && document.querySelector("aside"))
            return document.querySelector("aside");

        asideReads++;
        if (!document.querySelector("aside"))
            document.querySelector(".header__hamburger__icon button").click();
        await waitForRender(() => document.querySelector("aside"));
        document.querySelector("aside").classList.add("hideAside");
        return document.querySelector("aside");
    };

    const closeAside = () => {
        const closeButton = document.querySelector(".aside-button--close");
        if (asideMode !== "hidden") {
            asideReads--;
            if (closeButton && asideReads <= 0) closeButton.click();
            document.querySelector("aside")?.classList?.remove("hideAside");
        }
    };

    const executeActionOnAside = async (fn) => {
        const aside = await getAsideElement();
        await fn(aside);
        if (!document.querySelector("aside") && asideMode === "hidden") {
            document
                .querySelector(".header__hamburger__icon button")
                .click();
        } else asideReads--;
    };

    const clickOnAside = (selector) =>
        executeActionOnAside((aside) => aside.querySelector(selector)?.click());

    const getFromAside = async (fn) => {
        const aside = await getAsideElement();
        const result = await fn(aside);
        closeAside();
        return result;
    };

    const isMessagesHost = () =>
        /(dziennik-)?wiadomosci.*/.test(W.location.hostname);

    const getUserData = async () =>
        getFromAside(async () => {
            await waitForRender(
                () =>
                    document.querySelector(
                        isMessagesHost()
                            ? ".account__name span"
                            : ".side_important-text.side_student",
                    ) && document.querySelector(".user div:nth-child(2)"),
            );

            return {
                fullName: isMessagesHost()
                    ? document
                          .querySelector(".account__name span")
                          ?.firstChild?.textContent?.split(" ")
                          .reverse()
                          .join(" ")
                    : document.querySelector(".side_important-text.side_student")
                          ?.textContent,
                username: document.querySelector(".user div:nth-child(2)")
                    .lastChild.textContent,
            };
        });

    const normalizeLesson = (lesson) => {
        const hoursText = (
            lesson.querySelector(
                ".position__lesson__hours, .conflicted--details--hours",
            )?.innerText || "  "
        ).split(" ");
        const startingHour = hoursText[0];
        const endingHour = hoursText[2];

        const subjectText =
            lesson
                .querySelector(".position__lesson__subject")
                ?.innerText?.split(/ Grupa-| \|/) || [];

        const annotationText = lesson.querySelector(
            ".plan-position__adnotation-title",
        )?.innerText;

        const type = lesson.classList.contains("cell--multi--conflicted")
            ? "conflicted"
            : lesson.querySelector(".zastepstwo")
              ? "substitute"
              : lesson.querySelector(".odwolane")
                ? "canceled"
                : annotationText
                  ? "unknown"
                  : "normal";

        return {
            originalElement: lesson,
            type,
            subject: subjectText[0],
            group: subjectText[1],
            teacher: lesson.querySelector(".position__lesson__teacher")
                ?.innerText,
            classroom: [
                ...(lesson.querySelector(
                    ".position__lesson__subject + span",
                )?.innerText || ""),
            ]
                .filter((c) => !"()".includes(c))
                .join("")
                .trim(),
            annotationText,
            startingHour,
            endingHour,
        };
    };

    const mapDay = (element) =>
        Array.from(
            element.querySelectorAll(".cell--single, .cell--multi--conflicted"),
        ).map(normalizeLesson);

    const updateReactInput = (input, value) => {
        const setValue = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(input),
            "value",
        ).set;
        const event = new Event("input", { bubbles: true });
        setValue.call(input, value);
        input.dispatchEvent(event);
    };

    const dayNames = [
        "poniedziałek",
        "wtorek",
        "środa",
        "czwartek",
        "piątek",
        "sobota",
        "niedziela",
    ];

    const getWeekStartingMonday = (i) => (i === 0 ? 6 : i - 1);

    const getWeek = (date) => {
        const DAY = 24 * 60 * 60 * 1000;
        const firstDay = new Date(`${date.getFullYear()}-01-01`);
        return Math.floor((date.getTime() - firstDay.getTime()) / DAY / 7);
    };

    const isSameWeek = (date, comparedDate) =>
        getWeek(date) === getWeek(comparedDate);

    class SelectorRenderer {
        constructor(renderContentFn) {
            this.renderContent = renderContentFn;
            this.#render().then(() =>
                console.debug("[IFV] Rendered date selector"),
            );
        }

        #createSelector(dayName) {
            const element = document.createElement("div");
            element.innerHTML = `
                <input type="date">
                <div>
                    <img src='https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/chevron_left_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg'>
                    <span></span>
                    <img src='https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/chevron_right_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg'>
                </div>
            `;

            const dayDisplay = element.querySelector("span");
            dayDisplay.innerText = dayName;
            dayDisplay.addEventListener("click", () =>
                element.querySelector("input").showPicker(),
            );

            const datePicker = element.querySelector("input");
            datePicker.addEventListener("change", () =>
                this.#setDay(datePicker.value, datePicker.valueAsDate),
            );

            element
                .querySelector("img:first-of-type")
                .addEventListener("click", () => this.#setSiblingDay(-1));
            element
                .querySelector("img:last-of-type")
                .addEventListener("click", () => this.#setSiblingDay(1));
            element.classList.add("date-selector");

            return element;
        }

        #updateSelectorDate(name) {
            document.querySelector(".date-selector span").innerText = name;
        }

        #getDaysDropdowns() {
            return Array.from(
                document.querySelectorAll(".app__content .MuiPaper-root"),
            ).map((element) => ({
                element,
                note: element.querySelector(".plan-zajec__accordion__wolne")
                    ?.innerText,
                day: element.querySelector(
                    ".MuiAccordionSummary-content > h2",
                )?.innerText,
            }));
        }

        #isDayListLoaded() {
            return !document.querySelector(".spinner") && this.#isWeekChanged();
        }

        #isWeekChanged() {
            return (
                !this.firstDayName ||
                document.querySelector(
                    ".app__content .MuiPaper-root .MuiAccordionSummary-content > h2",
                )?.innerText !== this.firstDayName
            );
        }

        async #setDay(value, valueDate) {
            if (
                !isSameWeek(
                    document.querySelector(".week-selector input").valueAsDate,
                    valueDate,
                )
            ) {
                this.#setChecking();
                if (!value || !valueDate) return;
                updateReactInput(
                    document.querySelector(".week-selector input"),
                    value,
                );
                await waitForRender(() => this.#isDayListLoaded());
            }

            this.currentWeekDay = Math.min(
                getWeekStartingMonday(valueDate.getDay()),
                this.cachedWeek.length - 1,
            );
            await this.#render();
        }

        async #setupAutoRender() {
            if (this.observer) return;
            this.observer = new MutationObserver(async () => {
                const content = await this.renderContent(
                    this.cachedWeek[this.currentWeekDay],
                );
                content.classList.add("day-content");
                document.querySelector(".day-content").replaceWith(content);
            });

            this.observer.observe(
                document.querySelector(
                    ".content-container__tab-subheader:has(.week-selector) + div",
                ),
                { childList: true, subtree: true },
            );
        }

        async #render() {
            let replaceable = document.querySelector(".day-content");
            if (!replaceable) {
                replaceable = document.createElement("div");
                document
                    .querySelector("section.app__content .mobile__frame")
                    .appendChild(replaceable);
            }

            this.cachedWeek = this.#getDaysDropdowns();

            if (this.currentWeekDay === undefined) {
                const today = new Date();
                const day = getWeekStartingMonday(today.getDay());
                this.currentWeekDay = this.cachedWeek.findIndex(
                    (timetableDay) =>
                        (timetableDay.day || "-, ")
                            .split(", ")[0]
                            .toLowerCase() === dayNames[day],
                );
                if (this.currentWeekDay === -1)
                    this.currentWeekDay = this.cachedWeek.length - 1;
            }

            const content = await this.renderContent(
                this.cachedWeek[this.currentWeekDay],
            );
            content.classList.add("day-content");
            replaceable.replaceWith(content);

            if (document.querySelector(".date-selector")) {
                this.#updateSelectorDate(
                    this.cachedWeek[this.currentWeekDay].day,
                );
            } else
                document
                    .querySelector("section.app__content .mobile__frame")
                    .appendChild(
                        this.#createSelector(
                            this.cachedWeek[this.currentWeekDay].day,
                        ),
                    );

            this.#setupAutoRender();
        }

        #setChecking() {
            this.firstDayName = this.cachedWeek[0].day;
        }

        async #setSiblingDay(direction = 1) {
            this.#setChecking();
            document.querySelector("#root").scroll(0, 0);

            const target = this.currentWeekDay + direction;
            if (target >= this.cachedWeek.length || target < 0) {
                if (target < 0) {
                    this.currentWeekDay = 4;
                    document
                        .querySelector(".week-selector > button:first-of-type")
                        .click();
                } else {
                    this.currentWeekDay = 0;
                    document
                        .querySelector(".week-selector > button:last-of-type")
                        .click();
                }
                await waitForRender(() => this.#isDayListLoaded());
            } else {
                this.currentWeekDay = target;
            }

            await this.#render();
        }
    }

    const updateTitle = () => {
        const header = document.querySelector(".header__logo-product > span");
        const title = document.querySelector(
            ".app__content__header__h1_subtitle > h1",
        );
        if (header && title?.innerText && header.innerText !== title.innerText)
            header.innerText = title.innerText;
    };

    const moveTitleToHeader = () => {
        const header = document.querySelector(".header__logo-product");
        header.appendChild(document.createElement("span"));
        updateTitle();

        const observer = new MutationObserver(updateTitle);
        observer.observe(document.querySelector(".app__content"), {
            characterData: true,
            childList: true,
            subtree: true,
        });

        let button = document.querySelector(".go_to_dashboard");
        if (!button) {
            button = document.createElement("span");
            button.className = "go_to_dashboard";
        }
        button.innerHTML =
            "<img src='https://raw.githubusercontent.com/banocean/ifv/main/assets/icons/reply_24dp_000000_FILL0_wght400_GRAD0_opsz24.svg'> Tablica";
        button.classList.add("hidden");
        document.body.appendChild(button);

        header.addEventListener("click", () => button.classList.toggle("hidden"));

        button.addEventListener("click", async () => {
            button.classList.toggle("hidden");
            if (isMessagesHost()) {
                W.location.replace(
                    `https://${W.location.hostname.replace("wiadomosci", "uczen")}/${W.location.pathname.split("/")[1]}/App`,
                );
            } else await clickOnAside(".tablica a");
        });
    };

    const moveMessagesButton = async () => {
        const inner = await getFromAside(async () => {
            await waitForRender(() => document.querySelector(".messages"));
            return document.querySelector(".messages")?.innerHTML;
        });

        const messages = document.createElement("div");
        messages.innerHTML = inner;
        messages.style.float = "right";
        messages.style.padding = "20px";
        messages.style.marginLeft = "auto";
        messages.querySelector(
            ".MuiBadge-anchorOriginTopRightRectangle",
        ).style.transitionDuration = "0ms";

        document
            .querySelector(".header_logo_tools-container")
            .appendChild(messages);
    };

    const hideEmptyColumns = async () => {
        await waitForRender(() =>
            document.querySelector(".p-datatable-table .details-btn--appearance"),
        );

        const headers = document.querySelectorAll(".p-datatable-table th");
        headers.forEach((header, idx) => {
            const cells = Array.from(
                document.querySelectorAll(
                    "tbody tr td:nth-child(" + (idx + 1) + ")",
                ),
            );
            const check = cells.some(
                (cell) => cell.textContent.trim().length > 0,
            );

            const columnCells = document.querySelectorAll(
                "tr th:nth-child(" +
                    (idx + 1) +
                    "), tr td:nth-child(" +
                    (idx + 1) +
                    ")",
            );
            columnCells.forEach((cell) => {
                cell.style.display = check ? "" : "none";
            });
        });
    };

    const prepGrades = async () => {
        if (window.innerWidth > 1024) {
            await waitForRender(() =>
                document.querySelector(".MuiTabs-flexContainer > button"),
            );

            hideEmptyColumns();
            document
                .querySelectorAll(".MuiTabs-flexContainer > button")
                .forEach((e) => {
                    e.addEventListener("click", async () => {
                        await waitForReplacement(() =>
                            document.querySelector(
                                ".p-datatable-table .details-btn--appearance",
                            ),
                        );
                        hideEmptyColumns();
                    });
                });
        } else {
            await waitForRender(() =>
                document.querySelector(
                    ".MuiAccordionDetails-root.accordion__full-width__content > .mobile__frame .grades__box",
                ),
            );
            document
                .querySelectorAll(
                    ".MuiAccordionDetails-root.accordion__full-width__content > .mobile__frame",
                )
                .forEach(async (semester) => {
                    await waitForRender(() =>
                        semester.querySelector(
                            ".MuiAccordionDetails-root .grades__box .info-row .info-text > span",
                        ),
                    );
                    semester.querySelectorAll(".info-row").forEach((e) => {
                        if (
                            e
                                .querySelector(".info-text > span")
                                .textContent.trim() === "" ||
                            e
                                .querySelector(".info-text > span")
                                .textContent.trim() === "0"
                        ) {
                            e.remove();
                        }
                    });
                });
        }
    };

    const getStudentData = () =>
        isMessagesHost()
            ? document
                  .querySelector(".account__name span")
                  ?.firstChild?.textContent?.split(" ")
                  .reverse()
                  .join(" ")
            : document.querySelector(".side_student")?.firstChild?.textContent;

    const displayFullName = () => {
        const studentData = getStudentData();
        if (!studentData) return;

        const studentNameSpan = document.createElement("span");
        studentNameSpan.style = "font-size: 20px;";
        studentNameSpan.innerHTML = `${studentData}`;

        const usernameContainer = document.querySelector(
            ".user div:nth-of-type(2)",
        );
        usernameContainer.style =
            "display: flex; flex-direction: column; font-size: 16px;";
        usernameContainer.insertBefore(
            studentNameSpan,
            usernameContainer.firstChild,
        );
    };

    const isEduVulcan = () => !W.location.hostname.startsWith("dziennik");
    const getLogoElement = () =>
        document.querySelector(".header__logo-product")?.firstChild;

    const setUpRedirectToBoard = () => {
        const logoElement = getLogoElement();
        if (isMessagesHost()) {
            const url = `https://${W.location.hostname.replace("wiadomosci", "uczen")}/${W.location.pathname.split("/")[1]}/App`;
            if (isEduVulcan()) logoElement.href = url;
            else {
                logoElement.onclick = () => (W.location.href = url);
                logoElement.style = "cursor: pointer;";
            }
        } else {
            if (isEduVulcan()) logoElement.href = "javascript:void(0)";
            else logoElement.style = "cursor: pointer;";
            logoElement.addEventListener("click", () =>
                clickOnAside(".tablica a"),
            );
        }
    };

    const redirectToEVLogin = () => {
        W.location.pathname = "/logowanie";
    };

    const redirectToDVLogin = () => {
        W.location.pathname = `/${W.location.pathname.split("/")[1]}/LoginEndpoint.aspx`;
    };

    const addDvAlternativeLoginLink = () => {
        const pathSegment = W.location.pathname.split("/")[1];
        const targetSpan = document.querySelector(
            ".input-components ~ .form-gap > span",
        );
        if (!targetSpan) return;
        const spanHTML = targetSpan.innerHTML;
        const newHTML = spanHTML.slice(0, -1);
        const additionalText = `lub użyj <a href="https://uonetplus.vulcan.net.pl/${pathSegment}" class="link-simple">innej metody logowania</a>`;
        targetSpan.innerHTML = `${newHTML} ${additionalText}`;
    };

    const getManifestLink = (hostname) => {
        switch (hostname) {
            case "eduvulcan.pl":
                return "https://raw.githubusercontent.com/banocean/ifv/main/pwa/manifest-eduvulcan.json";
            case "uczen.eduvulcan.pl":
                return `https://ifv-pwa.banocean.com/eduvulcan/${W.location.pathname.split("/")[1]}`;
            case "dziennik-uczen.vulcan.net.pl":
                return `https://ifv-pwa.banocean.com/dziennik/${W.location.pathname.split("/")[1]}`;
        }
    };

    const injectWebManifest = () => {
        const metaLink = document.createElement("link");
        metaLink.setAttribute("rel", "manifest");
        metaLink.setAttribute("href", getManifestLink(W.location.hostname));
        document.head.appendChild(metaLink);
    };

    const startResizeListening = () => {
        const startingWidth = window.innerWidth;
        W.addEventListener("resize", () => {
            if (startingWidth < 1024 !== window.innerWidth < 1024)
                W.location.reload();
        });
    };

    const setupMobileNavbarState = () => {
        if (/^(dziennik-)?(uczen).*/.test(W.location.hostname))
            asideMode = "hidden";

        W.addEventListener("popstate", (e) => {
            const moreDetails = e.state?.moreDetails;
            if (moreDetails !== true) {
                if (e.state?.more) {
                    document.querySelector(".more-popup").style.display =
                        "block";
                } else {
                    document.querySelectorAll(".list-modal").forEach((el) => {
                        el.style.display = "none";
                    });
                }
            }
            setHighlights();
        });
    };

    const getAsidePages = (selector = "aside > section > .MuiList-root > ul") => {
        if (!document.querySelector("aside")) return [];
        return Array.from(document.querySelector(selector).children).map(
            (item) => {
                const isDirectLink =
                    item.classList.contains("MuiListItem-gutters");
                const icon = getComputedStyle(
                    isDirectLink ? item : item.querySelector("div > button"),
                    ":before",
                ).getPropertyValue("content");
                const name = item.querySelector(
                    isDirectLink ? "a" : ".accordion__title__content",
                )?.innerText;

                const items = isDirectLink
                    ? undefined
                    : Array.from(item.querySelector(".items").children);

                return {
                    type: isDirectLink ? 1 : 2,
                    element: item,
                    items,
                    icon,
                    name,
                };
            },
        );
    };

    const navIcons = {
        tablica: "dashboard",
        oceny: "counter_6",
        frekwencja: "event_available",
        planZajec: "calendar_clock",
    };

    const buildMobileNavbar = async () => {
        const nav = document.createElement("nav");
        nav.classList.add("bottom-navigation-bar");

        const more = document.createElement("div");
        more.classList.add("more-popup");
        more.classList.add("list-modal");
        more.innerHTML = `<div><img src='${BACK_ICON}'><h1>Więcej</h1></div><div></div>`;
        more.style.display = "none";

        more.querySelector("img").addEventListener("click", () => {
            more.style.display = "none";
            W.history.back();
            setHighlights();
        });

        await getFromAside(() => null);
        await waitForRender(() => getAsidePages().length > 1);

        const navPages = ["tablica", "oceny", "frekwencja", "planZajec"];
        const pages = getAsidePages();
        for (const page of pages) {
            const itemClass = Array.from(page.element.classList).find(
                (c) =>
                    ![
                        "MuiListItem-root",
                        "MuiListItem-gutters",
                        "selected",
                    ].includes(c),
            );
            const item = document.createElement("div");

            if (!navPages.includes(itemClass)) {
                item.innerHTML =
                    "<div class='icon'></div><span class='name'></span>";
                item.querySelector(".icon").style.content = page.icon;
                item.querySelector(".name").innerText = page.name;
                more.querySelector("div:last-of-type").appendChild(item);
            } else {
                item.innerHTML = `<div><img src="https://raw.githubusercontent.com/banocean/ifv/new-navbar/assets/icons/${navIcons[itemClass]}_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg"></div><div></div>`;
                item.querySelector("div:last-of-type").innerText = page.name;
                nav.appendChild(item);
            }

            if (page.type === 1) {
                item.addEventListener("click", () => {
                    document.querySelector(`.${itemClass} a`).click();
                    more.style.display = "none";
                    document
                        .querySelector(".header__hamburger__icon button")
                        .click();
                    document.querySelector("div#root").scroll(0, 0);
                    setHighlights();
                });
            } else {
                const detailedOptionsPage = document.createElement("div");
                detailedOptionsPage.innerHTML = `<div><img src='${BACK_ICON}'><h1></h1></div><div></div>`;
                detailedOptionsPage.style.zIndex = "4002";
                detailedOptionsPage.style.display = "none";
                detailedOptionsPage.classList.add("list-modal");

                detailedOptionsPage.querySelector("h1").innerText = page.name;
                detailedOptionsPage
                    .querySelector("img")
                    .addEventListener("click", () => {
                        W.history.back();
                    });

                for (let i = 0; i < page.items.length; i++) {
                    const option = page.items[i];
                    const element = document.createElement("div");
                    element.innerHTML =
                        "<div class='icon'></div><span class='name'></span>";
                    element.querySelector(".icon").style.content = page.icon;
                    element.querySelector(".name").innerText =
                        option.firstChild.innerText;
                    element.addEventListener("click", () => {
                        detailedOptionsPage.style.display = "none";
                        more.style.display = "none";
                        Array.from(
                            document.querySelectorAll(`.${itemClass} .items a`),
                        )[i].click();
                        document
                            .querySelector(".header__hamburger__icon button")
                            .click();
                        document.querySelector("div#root").scroll(0, 0);
                    });
                    detailedOptionsPage.lastElementChild.appendChild(element);
                }

                item.addEventListener("click", () => {
                    detailedOptionsPage.style.display = "block";
                    W.history.pushState(
                        { ...W.history.state, moreDetails: true },
                        "",
                        `${W.location.pathname}#${itemClass}`,
                    );
                });

                W.addEventListener("popstate", (e) => {
                    if (e.state?.moreDetails) {
                        detailedOptionsPage.style.display = "block";
                    } else {
                        detailedOptionsPage.style.display = "none";
                    }
                });

                document.body.appendChild(detailedOptionsPage);
            }
        }

        const moreButton = document.createElement("div");
        moreButton.innerHTML = `
            <div>
                <img src="https://raw.githubusercontent.com/banocean/ifv/main/assets/icons/menu_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg">
            </div>
            <div>Więcej</div>
        `;

        moreButton.addEventListener("click", () => {
            more.style.display = "block";
            W.history.pushState(
                { ...W.history.state, more: true },
                "",
                `${W.location.pathname}#more`,
            );
            setHighlights();
        });

        nav.appendChild(moreButton);

        document.body.appendChild(nav);
        document.body.appendChild(more);
    };

    const setHighlights = () => {
        let i;
        const morePopup = document.querySelector(".more-popup");
        if (morePopup?.style.display === "block") i = 4;
        else if (W.location.pathname.endsWith("tablica")) i = 0;
        else if (W.location.pathname.endsWith("oceny")) i = 1;
        else if (W.location.pathname.endsWith("frekwencja")) i = 2;
        else if (W.location.pathname.endsWith("planZajec")) i = 3;

        const buttons = Array.from(
            document.querySelector(".bottom-navigation-bar").children,
        );
        for (let j = 0; j < buttons.length; j++) {
            const img = buttons[j].querySelector("div > img");
            if (!img) continue;
            if (i === j) img.classList.add("highlight");
            else img.classList.remove("highlight");
        }
    };

    const setAutocomplete = () => {
        document
            .querySelector("#Login")
            ?.setAttribute("autocomplete", "username");
        document
            .querySelector("#Haslo")
            ?.setAttribute("autocomplete", "current-password");
    };

    // The current eduVULCAN login page is a two-step wizard whose "Dalej"
    // button is what initializes the proof-of-work captcha. To keep both
    // inputs visible at once we have to reproduce that step ourselves,
    // otherwise the captcha never starts and the login fails.
    const syncEduVulcanLoginCaptcha = () => {
        const alias = document.querySelector("#UserName")?.value?.trim() || "";
        const label = document.querySelector("#lblPassword");
        if (label) label.textContent = alias;

        const captcha = document.querySelector("#captcha");
        if (!alias) {
            if (captcha) captcha.style.display = "none";
            return;
        }

        if (
            typeof W.showSessionInfo === "function" &&
            typeof W.configurationDataSet === "function"
        ) {
            W.showSessionInfo(W.configurationDataSet());
        } else if (captcha) {
            captcha.style.display = "block";
            document.dispatchEvent(
                new CustomEvent("vulcan:powcaptcha:reinit"),
            );
        }
    };

    const fixEduVulcanLoginPage = () => {
        const userName = document.querySelector("#UserName");
        const password = document.querySelector("#Password");
        userName?.setAttribute("autocomplete", "username");
        password?.setAttribute("autocomplete", "current-password");
        userName?.focus();

        const linksEl = document.querySelector(
            "#wizard1 > div > .flex-row:has(a)",
        );
        if (linksEl) document.querySelector("#wizard2")?.appendChild(linksEl);

        if (userName && !userName.dataset.ifvCaptchaSync) {
            userName.dataset.ifvCaptchaSync = "1";
            let timer;
            const schedule = () => {
                clearTimeout(timer);
                timer = setTimeout(syncEduVulcanLoginCaptcha, 700);
            };
            userName.addEventListener("input", schedule);
            userName.addEventListener("change", schedule);
            password?.addEventListener("focus", syncEduVulcanLoginCaptcha);
        }

        syncEduVulcanLoginCaptcha();
    };

    const fixLoginPage = () => {
        if (document.querySelector("#UserName")) {
            fixEduVulcanLoginPage();
            return;
        }

        setAutocomplete();
        document.querySelector("#btNext")?.remove();

        const wizard2 = document.querySelector("#wizard2");
        if (!wizard2) return;
        wizard2.parentElement.insertBefore(
            document.querySelector("#wizard1"),
            wizard2,
        );
        const centerBox = document.querySelector(".center-box");
        if (centerBox) centerBox.innerHTML = centerBox.innerHTML;
    };

    const isEduVulcanLoggedIn = () =>
        !!document.querySelector('a[href*="koniecPracy"]');

    const redirectToDziennik = () => {
        const path = W.location.pathname;

        if (
            path.replace(/\/+$/, "") === "/dostep-do-dziennika" &&
            isEduVulcanLoggedIn()
        ) {
            const journalLinks = [
                ...document.querySelectorAll('a[href*="/dziennik?"]'),
            ];
            if (journalLinks.length === 1) {
                W.location.assign(journalLinks[0].href);
            }
            return;
        }

        if (path === "/" && isEduVulcanLoggedIn()) {
            W.location.assign("/dostep-do-dziennika/");
        }
    };

    const toggleUserModal = () => {
        document.querySelector(".modal-background")?.classList.toggle("active");
        document.querySelector(".modal-user")?.classList.toggle("active");
    };

    const moveUserOptionsToHeader = async () => {
        const userLinks = await getFromAside(async () => {
            const user = document.querySelector(".user");
            if (user) {
                user.click();
                await waitForRender(() =>
                    document.querySelector(".user__links a"),
                );
                return document.querySelectorAll(".user__links a");
            }
        });
        const userData = await getUserData();

        const modalBackground = document.createElement("div");
        const modalElement = document.createElement("div");

        modalBackground.classList.add("modal-background");
        modalElement.classList.add("modal-user");

        const userDataElement = document.createElement("div");
        userDataElement.classList.add("modal-data");

        const userAvatar = document.createElement("div");
        userAvatar.innerHTML = `<span>${userData.fullName[0]}</span>`;
        userAvatar.classList.add("user-avatar");
        userDataElement.appendChild(userAvatar.cloneNode(true));

        const nameElement = document.createElement("div");
        nameElement.classList.add("modal-name");
        nameElement.innerHTML = `<span style="font-size: 20px">${userData?.fullName}</span><span style="font-size: 1rem;">${userData?.username}</span>`;
        userDataElement.appendChild(nameElement);
        modalElement.appendChild(userDataElement);

        userLinks.forEach((link, i) => {
            const linkContainer = document.createElement("div");
            linkContainer.classList.add("modal-link-container");

            const linkText = document.createElement("span");
            linkText.innerHTML = link.textContent;

            linkText.addEventListener("click", () => {
                executeActionOnAside(async () => {
                    document.querySelector(".user").click();
                    await waitForRender(() =>
                        document.querySelector(".user__links"),
                    );
                    document.querySelectorAll(".user__links a")[i].click();
                });
                toggleUserModal();
            });

            linkContainer.appendChild(linkText);
            modalElement.appendChild(linkContainer);
        });

        const backButtonContainer = document.createElement("div");
        backButtonContainer.classList.add("modal-back-container");
        const backButton = document.createElement("span");
        backButton.classList.add("modal-cancel");
        backButton.innerHTML = "Anuluj";
        backButtonContainer.appendChild(backButton);
        modalElement.appendChild(backButtonContainer);

        modalBackground.addEventListener("click", () => W.history.back());
        backButton.addEventListener("click", () => W.history.back());
        userAvatar.addEventListener("click", () => {
            toggleUserModal();
            W.history.pushState(
                { ...W.history.state, userModal: true },
                "",
                `${W.location.pathname}#user-modal`,
            );
        });

        document.body.appendChild(modalElement);
        document.body.appendChild(modalBackground);
        document
            .querySelector(".header_logo_tools_user-wrapper")
            .appendChild(userAvatar);

        W.addEventListener("popstate", () => {
            if (
                document
                    .querySelector(".modal-user")
                    ?.classList.contains("active")
            ) {
                toggleUserModal();
            }
        });
    };

    const isOpened = (element) =>
        element.querySelector(".MuiCollapse-root")?.style?.height !== "0px";

    const openAllTimetableDays = async () => {
        const container = document.querySelectorAll(
            ".app__content .MuiPaper-root",
        );
        for (const element of container) {
            if (!isOpened(element))
                element
                    .querySelector(".accordion__full-width__header h2")
                    ?.click();
            await waitForRender(() => isOpened(element), element);
        }
    };

    const mapData = () =>
        Array.from(
            document.querySelectorAll(".app__content .MuiPaper-root"),
        ).map((element) => ({
            note: element.querySelector(".plan-zajec__accordion__wolne")
                ?.innerText,
            day: element.querySelector(".MuiAccordionSummary-content > h2")
                ?.innerText,
            lessons: mapDay(element),
            element,
        }));

    const mapStartingHours = (data) => {
        const all = new Set();
        for (const day of data)
            if (day.lessons)
                for (const lesson of day.lessons)
                    if (lesson.startingHour) all.add(lesson.startingHour);
        const result = [...all].sort();
        const [firstHour, firstMinutes] = (result[0] || "08:00").split(":");
        return Number(firstHour) <= 7 && Number(firstMinutes) <= 30
            ? result
            : ["7:00", ...result];
    };

    const getStartingHours = () =>
        JSON.parse(localStorage.getItem("startingHours") || "[]");

    const renderTimetableDay = async (data) => {
        await openAllTimetableDays();

        if (!data.note) {
            await waitForRender(() =>
                document.querySelector(".details-btn--position-r-bottom"),
            );
        }

        const startingHours = getStartingHours();
        const lessons = mapDay(data.element);
        const element = document.createElement("section");
        element.classList.add("timetable");

        if (lessons.length < 1) {
            const infoElement = document.createElement("div");
            infoElement.innerHTML =
                "<div><span class='no-lessons-title'>Nie ma lekcji 😎</span><br><span></span></div>";
            if (data.note)
                infoElement.querySelector("span:last-of-type").innerText =
                    data.note;
            element.appendChild(infoElement);
        } else {
            for (const lesson of lessons) {
                const lessonElement = document.createElement("div");
                lessonElement.innerHTML = `
                    <div>${startingHours.findIndex((h) => h === lesson.startingHour)}</div>
                    <article>
                        <div class='info'><span></span><span></span></div>
                        <div class='data'></div>
                    </article>
                `;
                const lessonDataElement =
                    lessonElement.querySelector(".data");

                const timeContainer = lessonElement.querySelector(".info");
                timeContainer.firstElementChild.innerText = lesson.startingHour;
                timeContainer.lastElementChild.innerText = lesson.endingHour;

                lessonElement.classList.add("lesson");
                lessonElement.classList.add(lesson.type);

                if (lesson.type === "conflicted") {
                    lessonDataElement.innerHTML = `
                        <div class='subject'>Wpisana jest więcej niż jedna lekcja</div>
                        <div class='additional-info'>Kliknij, aby wyświetlić</div>
                    `;
                } else {
                    lessonDataElement.innerHTML = `<div class="subject"></div> <div class="additional-info"></div>`;
                    lessonDataElement.querySelector(".subject").innerText =
                        lesson.subject;
                    lessonDataElement.querySelector(
                        ".additional-info",
                    ).innerText = `${lesson.classroom} ${lesson.teacher?.split(" ")?.reverse()?.join(" ")}`;
                }

                lessonElement.addEventListener("click", () =>
                    lesson.originalElement.querySelector("button").click(),
                );
                element.appendChild(lessonElement);
            }
        }

        return element;
    };

    const runNewTimetable = async () => {
        document.querySelector(
            "section.app__content .app__content__header",
        ).style.display = "none";
        document.querySelector(
            "section.app__content .mobile__frame > div",
        ).style.display = "none";

        await openAllTimetableDays();
        localStorage.setItem(
            "startingHours",
            JSON.stringify(mapStartingHours(mapData())),
        );

        new SelectorRenderer(renderTimetableDay);
    };

    let attendanceTabsElement = null;

    const changeStatsVisibility = (isStatsVisible) => {
        const mainStats = document.querySelector(
            ".content-container:has(.statistics)",
        );
        mainStats.style.display = isStatsVisible ? "block" : "none";
        const element = document.querySelector(".tabsview");
        element.classList.add("attendance-init");
        if (isStatsVisible) element.classList.add("stats");
        else element.classList.remove("stats");
    };

    const buildAttendanceTabs = () => {
        if (attendanceTabsElement) return;
        const selector = document.createElement("div");
        if (window.innerWidth >= 1024)
            selector.innerHTML =
                '<button class="MuiButtonBase-root MuiButton-root MuiButton-contained default-button primary-button" disabled><span class="MuiButton-label">Frekwencja</span></button><button class="MuiButtonBase-root MuiButton-root MuiButton-contained default-button primary-button"><span class="MuiButton-label">Statystyki</span></button>';
        else
            selector.innerHTML =
                "<button disabled>Frekwencja</button><button><span>Statystyki</span></button><div></div><div></div>";
        selector.classList.add("attendance-tabs");

        selector
            .querySelector("button:first-of-type")
            .addEventListener("click", () => {
                changeStatsVisibility(false);
                selector.querySelector("button:first-of-type").disabled = true;
                selector.querySelector("button:last-of-type").disabled = false;
            });

        selector
            .querySelector("button:last-of-type")
            .addEventListener("click", () => {
                changeStatsVisibility(true);
                selector.querySelector("button:first-of-type").disabled = false;
                selector.querySelector("button:last-of-type").disabled = true;
            });

        attendanceTabsElement = selector;
    };

    const insertAttendanceTabs = () => {
        const container =
            window.innerWidth < 1024
                ? ".app__content > .mobile__frame"
                : ".app__content > .desktop__frame";
        document
            .querySelector(container)
            .insertBefore(
                attendanceTabsElement,
                document.querySelector(container + "> *"),
            );
        changeStatsVisibility(false);
    };

    const createJustifyButton = () => {
        const button = document.createElement("button");
        button.classList.add("justify-abstence");
        button.innerHTML = `<img src="https://raw.githubusercontent.com/banocean/ifv/refs/heads/excuse-attendance-button/assets/icons/stylus_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"> Usprawiedliw`;
        button.addEventListener("click", () => {
            document
                .querySelector(".app__content__header > .toolbar > button")
                .click();
        });
        document
            .querySelector(
                window.innerWidth < 1024
                    ? ".app__content > .mobile__frame"
                    : ".app__content > .desktop__frame",
            )
            .appendChild(button);
    };

    const dashboardIcons = [
        [
            "Dzisiejszy plan zajęć",
            "calendar_clock_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg",
        ],
        [
            "Oceny od ostatniego logowania",
            "counter_6_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg",
        ],
        ["Sprawdziany", "quiz_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"],
        [
            "Zadania domowe",
            "summarize_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg",
        ],
        ["Informacje", "folder_info_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"],
        ["Ogłoszenia", "campaign_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"],
        ["Ankiety", "feedback_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"],
        [
            "Frekwencja",
            "event_available_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg",
        ],
        [
            "Dyżurni",
            "person_raised_hand_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg",
        ],
        ["Ważne dzisiaj", "strategy_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"],
    ];

    const doesHaveClickableParent = (element) => {
        if (["a", "button"].includes(element.tagName.toLowerCase()))
            return true;
        if (!element.parentElement) return false;
        return doesHaveClickableParent(element.parentElement);
    };

    const applyDashboardIcons = () => {
        for (const [tileTitle, fileName] of dashboardIcons) {
            const icon = document.createElement("img");
            icon.src = `https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/${fileName}`;
            const container = Array.from(
                document.querySelectorAll(".content-container .tile.box"),
            )
                ?.find((e) => e.querySelector("h2").textContent === tileTitle)
                ?.querySelector(".tile__header.flex__items > .flex__item-auto");

            if (container) container.insertBefore(icon, container.firstChild);
            else {
                console.debug(`[IFV] Tile ${tileTitle} not found`);
                return;
            }

            container.parentElement?.parentElement?.addEventListener(
                "click",
                (e) => {
                    if (doesHaveClickableParent(e.target)) return;
                    container.parentElement
                        .querySelector("a.tile__link")
                        ?.click();
                },
            );
        }
    };

    let maxDashboardLessons = 0;

    const renderDashboardTimetable = () => {
        const timetableElement = document.querySelector(".plan-zajec");
        const timetable = mapDay(timetableElement);
        if (timetable.length < maxDashboardLessons) return;
        maxDashboardLessons = timetable.length;

        const elements = timetable.map((lesson) => {
            const element = document.createElement("li");
            if (lesson.type === "conflicted") {
                element.innerText = `Więcej pozycji`;
            } else {
                element.classList.add(lesson.type);
                element.innerText = `${lesson.subject} (${lesson.classroom}) ${
                    lesson.type === "unknown" ? lesson.annotationText : ""
                }`;
            }
            return element;
        });

        const container = document.createElement("ol");
        container.classList.add("lessons-container");
        container.append(...elements);

        const existingContainer =
            document.querySelector(".lessons-container");
        if (existingContainer) existingContainer.remove();

        timetableElement.parentElement.insertBefore(container, timetableElement);
    };

    const replaceDashboardTimetable = async () => {
        await waitForRender(() => document.querySelector(".plan-zajec"));
        renderDashboardTimetable();
        const observer = new MutationObserver(renderDashboardTimetable);
        observer.observe(document.querySelector(".plan-zajec"), {
            childList: true,
            subtree: true,
        });
    };

    const createDashboardToolbar = async () => {
        const getContainer = () =>
            document.querySelector(
                ".content-container > .tile-container > .tile-subcontainer",
            );
        await waitForRender(getContainer);

        const element = document.createElement("div");
        element.classList.add("dashboard-info-toolbar");
        element.innerHTML = `
            <div>
                <img src="https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/star_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg">
                <span>-</span>
            </div>
            <div>
                <img src="https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/event_note_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg">
                <span>-</span>
            </div>
            <div>
                <img src="https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/mail_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg">
                <span>-</span>
            </div>`;

        const container = getContainer();
        container.insertBefore(element, container.firstChild);

        const getLuckyNumber = () =>
            document.querySelector(
                ".lucky-number__circle.lucky-number__number > span",
            )?.innerText;
        waitForRender(getLuckyNumber).then(
            () =>
                (element.querySelector(
                    "div:first-of-type > span",
                ).innerText = getLuckyNumber()),
        );

        const getAmountOfMessages = () =>
            document.querySelector(
                'a[title="Przejdź do modułu wiadomości"] .MuiBadge-anchorOriginTopRightRectangle',
            ).innerText;
        waitForRender(getAmountOfMessages).then(
            () =>
                (element.querySelector(
                    "div:last-of-type > span",
                ).innerText = getAmountOfMessages()),
        );
        element
            .querySelector("div:last-of-type")
            .addEventListener("click", () => {
                document
                    .querySelector('a[title="Przejdź do modułu wiadomości"]')
                    ?.click();
            });
    };

    const runNewDashboard = () => {
        applyDashboardIcons();
        createDashboardToolbar();
        replaceDashboardTimetable();
    };

    const fixGoingBack = () => {
        const mutationHandler = async (mutationList) => {
            for (const mutation of mutationList) {
                const modals = document.querySelectorAll(".MuiDrawer-modal");
                const modal = modals[modals.length - 1] || undefined;

                if (
                    modal &&
                    modal.getAttribute("data-has-listener") !== "true"
                ) {
                    W.history.pushState(
                        { ...W.history.state, details: true },
                        "",
                        `${W.location.pathname}#`,
                    );
                    modal.setAttribute("data-has-listener", "true");

                    for (const e of modals) {
                        if (e === modal) continue;
                        e.removeAttribute("data-has-listener");
                    }

                    await waitForRender(() =>
                        modal.querySelector(".modal-button--close"),
                    );
                    const closeButton = modal.querySelector(
                        ".modal-button--close",
                    );

                    const popstateHandler = () => {
                        if (
                            closeButton
                                ?.closest(
                                    "div[role=presentation].MuiDrawer-modal",
                                )
                                ?.getAttribute("data-has-listener") !== "true"
                        )
                            return;
                        closeButton?.click();
                    };

                    W.addEventListener("popstate", popstateHandler, {
                        once: true,
                    });

                    closeButton?.addEventListener("click", () => {
                        if (W.history.state?.details) W.history.back();
                    });
                }
            }
        };

        const observer = new MutationObserver(mutationHandler);
        observer.observe(document.body, { childList: true });
    };

    const modifyGradesRequests = () => {
        const XHR = W.XMLHttpRequest;
        const originalXHROpen = XHR.prototype.open;
        const originalXHRSend = XHR.prototype.send;

        XHR.prototype.open = function () {
            this._requestMethod = arguments[0];
            this._requestURL = arguments[1];
            return originalXHROpen.apply(this, arguments);
        };

        XHR.prototype.send = function () {
            const xhr = this;

            if (
                xhr._requestURL &&
                xhr._requestURL.includes("/api/Oceny?")
            ) {
                const originalOnReadyStateChange = xhr.onreadystatechange;

                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        try {
                            let data = JSON.parse(xhr.responseText);

                            if (
                                data &&
                                data.ocenyPrzedmioty &&
                                Array.isArray(data.ocenyPrzedmioty) &&
                                data.ustawienia &&
                                !data.ustawienia.isSredniaAndPunkty
                            ) {
                                data.ocenyPrzedmioty.forEach((subject) => {
                                    let sum = 0;
                                    let totalWeight = 0;

                                    if (
                                        subject.kolumnyOcenyCzastkowe &&
                                        Array.isArray(
                                            subject.kolumnyOcenyCzastkowe,
                                        )
                                    ) {
                                        subject.kolumnyOcenyCzastkowe.forEach(
                                            (column) => {
                                                if (
                                                    column.oceny &&
                                                    Array.isArray(
                                                        column.oceny,
                                                    )
                                                ) {
                                                    column.oceny.forEach(
                                                        (grade) => {
                                                            if (
                                                                grade.wpis &&
                                                                grade.wpis.match(
                                                                    /^[0-6](\+|\-)?$/,
                                                                )
                                                            ) {
                                                                let value =
                                                                    parseFloat(
                                                                        grade.wpis,
                                                                    );
                                                                if (
                                                                    grade.wpis.includes(
                                                                        "+",
                                                                    )
                                                                )
                                                                    value +=
                                                                        getSetting(
                                                                            "Count averages",
                                                                            "plusValue",
                                                                        );
                                                                else if (
                                                                    grade.wpis.includes(
                                                                        "-",
                                                                    )
                                                                )
                                                                    value -=
                                                                        getSetting(
                                                                            "Count averages",
                                                                            "minusValue",
                                                                        );

                                                                sum +=
                                                                    value *
                                                                    grade.waga;
                                                                totalWeight +=
                                                                    grade.waga;
                                                            }
                                                        },
                                                    );
                                                }
                                            },
                                        );
                                    }

                                    if (totalWeight > 0) {
                                        subject.srednia = (
                                            sum / totalWeight
                                        ).toFixed(2);
                                    }
                                });

                                if (data.ustawienia) {
                                    data.ustawienia.isSredniaAndPunkty = true;
                                }
                            }

                            Object.defineProperty(xhr, "responseText", {
                                get: function () {
                                    return data;
                                },
                            });
                            Object.defineProperty(xhr, "response", {
                                get: function () {
                                    return data;
                                },
                            });
                        } catch (e) {
                            console.debug("[IFV] Błąd modyfikacji odpowiedzi:", e);
                        }
                    }

                    if (typeof originalOnReadyStateChange === "function")
                        originalOnReadyStateChange.apply(this, arguments);
                };
            }

            return originalXHRSend.apply(this, arguments);
        };
    };

    const settingRenderers = {
        select: (setting, patchName, currentValue) => `
            <select class="setting-select" data-patch="${patchName}" data-setting="${setting.id}">
                ${setting.options
                    .map(
                        (option) => `
                    <option value="${option.value}" ${
                        option.value === currentValue ? "selected" : ""
                    }>${option.name}</option>
                `,
                    )
                    .join("")}
            </select>
        `,
        text: (setting, patchName, currentValue) => `
            <input type="text" class="setting-text" data-patch="${patchName}" data-setting="${setting.id}" value="${currentValue}" placeholder="${setting.default}">
        `,
        boolean: (setting, patchName, currentValue) => `
            <div class="setting-boolean">
                <div class="setting-boolean-toggle">
                    <input class="toggle-input" type="checkbox" data-patch="${patchName}" data-setting="${setting.id}" ${currentValue ? "checked" : ""}>
                    <div class="toggle-switch"></div>
                </div>
            </div>
        `,
        multiselect: (setting, patchName, currentValue) => {
            const selectedValues = Array.isArray(currentValue)
                ? currentValue
                : typeof currentValue === "string" && currentValue.length > 0
                  ? currentValue.split(",")
                  : [];
            return `
                <div class="setting-multiselect">
                    ${setting.options
                        .map(
                            (option) => `
                        <div class="checkbox-item">
                            <input type="checkbox" class="setting-multiselect-checkbox"
                                id="${patchName}-${setting.id}-${option.value}"
                                data-patch="${patchName}"
                                data-setting="${setting.id}"
                                value="${option.value}"
                                ${selectedValues.includes(option.value) ? "checked" : ""}>
                            <label for="${patchName}-${setting.id}-${option.value}">${option.name}</label>
                        </div>
                    `,
                        )
                        .join("")}
                </div>
            `;
        },
        color: (setting, patchName, currentValue) => `
            <input type="color" class="setting-color" data-patch="${patchName}" data-setting="${setting.id}" value="${currentValue}">
        `,
        number: (setting, patchName, currentValue) => `
            <input type="number" class="setting-number" data-patch="${patchName}" data-setting="${setting.id}" value="${currentValue}" step="${setting.step || 1}" placeholder="${setting.default}">
        `,
    };

    const removeMarks = (element) => {
        const marks = element.querySelectorAll("mark");
        marks.forEach((mark) => {
            const parent = mark.parentNode;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
        });
        element.normalize();
    };

    const markTextInElement = (element, textQueryToHighlight) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const nodesToModify = [];

        let currentNode;
        while ((currentNode = walker.nextNode())) {
            const nodeText = currentNode.nodeValue;
            if (nodeText.toLowerCase().includes(textQueryToHighlight)) {
                nodesToModify.push({ node: currentNode, text: nodeText });
            }
        }

        nodesToModify.forEach(({ node, text }) => {
            const lowerText = text.toLowerCase();
            let matchIndex = lowerText.indexOf(textQueryToHighlight);
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;

            while (matchIndex !== -1) {
                fragment.appendChild(
                    document.createTextNode(text.substring(lastIndex, matchIndex)),
                );
                const mark = document.createElement("mark");
                mark.textContent = text.substring(
                    matchIndex,
                    matchIndex + textQueryToHighlight.length,
                );
                fragment.appendChild(mark);

                lastIndex = matchIndex + textQueryToHighlight.length;
                matchIndex = lowerText.indexOf(
                    textQueryToHighlight,
                    lastIndex,
                );
            }
            fragment.appendChild(
                document.createTextNode(text.substring(lastIndex)),
            );
            node.parentNode.replaceChild(fragment, node);
        });

        element.normalize();
    };

    const findPatch = (name) => PATCH_LIST.find((p) => p.name === name);

    const getSetting = (patchName, settingId) => {
        const patch = findPatch(patchName);
        if (!patch)
            throw new Error(`Patch with name ${patchName} not found.`);
        const setting = patch.settings?.find((s) => s.id === settingId);
        if (!setting)
            throw new Error(
                `Setting with id ${settingId} not found in patch ${patchName}.`,
            );

        const allSettings = loadPatchSettings();
        const savedValue = allSettings[patchName]?.[settingId];

        if (setting.type === "boolean") {
            if (savedValue !== undefined) return !!savedValue;
            return setting.default ?? false;
        }

        if (savedValue !== undefined) {
            if (setting.type === "multiselect" && typeof savedValue === "string")
                return savedValue.split(",");
            if (setting.type === "number" && typeof savedValue === "string")
                return parseFloat(savedValue);
            return savedValue;
        }

        if (setting.type === "multiselect") {
            if (Array.isArray(setting.default)) return setting.default;
            if (typeof setting.default === "string")
                return setting.default.split(",");
            return [];
        }

        return setting.default;
    };

    const saveSetting = (patchName, settingId, value) => {
        const patch = findPatch(patchName);
        if (!patch)
            throw new Error(`Patch with name ${patchName} not found.`);
        const setting = patch.settings?.find((s) => s.id === settingId);
        if (!setting)
            throw new Error(
                `Setting with id ${settingId} not found in patch ${patchName}.`,
            );

        const allSettings = loadPatchSettings();
        if (!allSettings[patchName]) allSettings[patchName] = {};
        allSettings[patchName][settingId] = value;
        savePatchSettings(allSettings);
    };

    const generateSettingsList = () => {
        const options = loadOptions();
        const patches = [...PATCH_LIST].sort((a, b) =>
            a.name.localeCompare(b.name, "pl"),
        );
        const root = document.createElement("div");
        root.className = "patches-list";

        root.innerHTML = `
            <div class="search-bar">
                <img src="${SEARCH_ICON}">
                <input placeholder="Search" type="text" autofocus />
                <button id="clear"><img src="${CLEAR_ICON}"></button>
            </div>
            <div class="category-bar">
                <select class="category-select">
                    <option value="all">Wszystkie</option>
                    <option value="desktop">Desktop</option>
                    <option value="mobile">Mobile</option>
                </select>
                <button class="toggle-all-button" type="button">Wyłącz wszystko</button>
            </div>
            <div class="no-results-message">Nie znaleziono pasujących patchy 😿</div>
        `;

        for (const patch of patches) {
            const isEnabled = options[patch.name] !== false;

            const patchDiv = document.createElement("div");
            patchDiv.className = "patch";
            if (patch.devices === "mobileOnly")
                patchDiv.classList.add("mobileOnly");
            if (patch.devices === "desktopOnly")
                patchDiv.classList.add("desktopOnly");

            patchDiv.innerHTML = `
                <div class="patch-header">
                    <div class="patch-title-row">
                        <p class="patch-name">${patch.name}</p>
                        <div class="setting-boolean-toggle">
                            <input class="toggle-input patch-toggle" type="checkbox" data-patch="${patch.name}" ${isEnabled ? "checked" : ""}>
                            <div class="toggle-switch"></div>
                        </div>
                    </div>
                    <p class="patch-description">${patch.description}</p>
                </div>
                <div class="settings-list"></div>
            `;

            const settingsListDiv = patchDiv.querySelector(".settings-list");

            for (const setting of patch.settings || []) {
                const settingContainerDiv = document.createElement("div");
                settingContainerDiv.className = "setting";
                settingContainerDiv.innerHTML = `
                    <div class="setting-header">
                        <span class="setting-name">${setting.name}</span>
                        <span class="separator">—</span>
                        <span class="setting-description">${setting.description}</span>
                    </div>
                `;

                const settingInputDiv = document.createElement("div");
                settingInputDiv.className = "setting-input";

                const renderer = settingRenderers[setting.type];
                if (renderer) {
                    const currentValue = getSetting(patch.name, setting.id);
                    settingInputDiv.innerHTML = renderer(
                        setting,
                        patch.name,
                        currentValue,
                    );
                }

                settingContainerDiv.appendChild(settingInputDiv);
                settingsListDiv.appendChild(settingContainerDiv);
            }

            if (!patch.settings?.length)
                settingsListDiv.style.display = "none";

            root.appendChild(patchDiv);
        }

        setupSettingsSearch(root);
        addSettingsInputListeners(root);
        addSettingsButtons(root, patches, options);

        return root;
    };

    const setupSettingsSearch = (root) => {
        const searchInput = root.querySelector(".search-bar > input");
        const categorySelect = root.querySelector(".category-select");
        const noResultsMessage = root.querySelector(".no-results-message");

        const applyFilters = () => {
            const query = searchInput.value.trim().toLowerCase();
            const category = categorySelect.value;
            let visiblePatchesCount = 0;

            root.querySelectorAll(".patch").forEach((patchDiv) => {
                if (
                    category === "mobile" &&
                    patchDiv.classList.contains("desktopOnly")
                ) {
                    patchDiv.style.display = "none";
                    return;
                }
                if (
                    category === "desktop" &&
                    patchDiv.classList.contains("mobileOnly")
                ) {
                    patchDiv.style.display = "none";
                    return;
                }

                const patchNameEl = patchDiv.querySelector(".patch-name");
                const patchDescEl = patchDiv.querySelector(".patch-description");

                removeMarks(patchNameEl);
                removeMarks(patchDescEl);
                patchDiv.querySelectorAll(".setting").forEach((settingDiv) => {
                    removeMarks(settingDiv.querySelector(".setting-name"));
                    removeMarks(settingDiv.querySelector(".setting-description"));
                });

                if (query === "") {
                    patchDiv.style.display = "block";
                    visiblePatchesCount++;
                    return;
                }

                let combinedTextContent =
                    patchNameEl.textContent.toLowerCase() +
                    " " +
                    patchDescEl.textContent.toLowerCase() +
                    " ";

                patchDiv.querySelectorAll(".setting").forEach((settingDiv) => {
                    combinedTextContent +=
                        settingDiv
                            .querySelector(".setting-name")
                            .textContent.toLowerCase() + " ";
                    combinedTextContent +=
                        settingDiv
                            .querySelector(".setting-description")
                            .textContent.toLowerCase() + " ";
                });

                if (combinedTextContent.includes(query)) {
                    patchDiv.style.display = "block";
                    visiblePatchesCount++;

                    markTextInElement(patchNameEl, query);
                    markTextInElement(patchDescEl, query);

                    patchDiv.querySelectorAll(".setting").forEach((settingDiv) => {
                        markTextInElement(
                            settingDiv.querySelector(".setting-name"),
                            query,
                        );
                        markTextInElement(
                            settingDiv.querySelector(".setting-description"),
                            query,
                        );
                    });
                } else {
                    patchDiv.style.display = "none";
                }
            });

            if (query === "") noResultsMessage.style.display = "none";
            else if (visiblePatchesCount === 0)
                noResultsMessage.style.display = "block";
            else noResultsMessage.style.display = "none";
        };

        searchInput.addEventListener("input", applyFilters);
        categorySelect.addEventListener("change", applyFilters);

        root.querySelector("#clear").addEventListener("click", () => {
            searchInput.value = "";
            searchInput.dispatchEvent(new Event("input"));
        });
    };

    const addSettingsInputListeners = (root) => {
        root.querySelectorAll(".setting-boolean-toggle").forEach((toggle) => {
            toggle.querySelector(".toggle-switch").addEventListener("click", () => {
                const input = toggle.querySelector(".toggle-input");
                input.checked = !input.checked;
                if (input.classList.contains("patch-toggle")) {
                    const options = loadOptions();
                    options[input.dataset.patch] = input.checked;
                    saveOptions(options);
                } else {
                    saveSetting(
                        input.dataset.patch,
                        input.dataset.setting,
                        input.checked,
                    );
                }
            });
        });

        root.querySelectorAll(
            ".setting-select, .setting-text, .setting-color, .setting-number",
        ).forEach((input) => {
            input.addEventListener("change", () => {
                saveSetting(input.dataset.patch, input.dataset.setting, input.value);
            });
        });

        root.querySelectorAll(".setting-multiselect-checkbox").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const patchName = checkbox.dataset.patch;
                const settingId = checkbox.dataset.setting;
                const selectedValues = Array.from(
                    root.querySelectorAll(
                        `.setting-multiselect-checkbox[data-patch='${patchName}'][data-setting='${settingId}']:checked`,
                    ),
                ).map((cb) => cb.value);
                saveSetting(patchName, settingId, selectedValues);
            });
        });
    };

    const addSettingsButtons = (root, patches, options) => {
        const buttonsDiv = document.createElement("div");
        buttonsDiv.className = "buttons";
        buttonsDiv.innerHTML = `
            <button class="reset-button" title="spowoduje odświeżenie strony">Zresetuj do domyślnych</button>
            <button class="apply-button" title="spowoduje odświeżenie strony">Zastosuj ustawienia</button>
        `;
        root.appendChild(buttonsDiv);

        root.querySelector(".apply-button").addEventListener("click", () =>
            W.location.reload(),
        );

        root.querySelector(".reset-button").addEventListener("click", () => {
            for (const patch of patches) {
                for (const setting of patch.settings || []) {
                    saveSetting(patch.name, setting.id, setting.default);
                }
            }
            W.location.reload();
        });

        const toggleAllButton = root.querySelector(".toggle-all-button");
        const allEnabled = patches.every((p) => options[p.name] !== false);
        toggleAllButton.innerText = allEnabled
            ? "Wyłącz wszystko"
            : "Włącz wszystko";

        toggleAllButton.addEventListener("click", () => {
            const freshOptions = loadOptions();
            const currentAllEnabled = patches.every(
                (p) => freshOptions[p.name] !== false,
            );
            for (const patch of patches)
                freshOptions[patch.name] = !currentAllEnabled;
            saveOptions(freshOptions);
            W.location.reload();
        });
    };

    const openStandaloneSettings = () => {
        if (document.querySelector(".ifv-standalone-settings")) return;

        const background = document.createElement("div");
        const modal = document.createElement("div");
        background.className =
            "ifv-patches-modal-background ifv-standalone-settings";
        modal.className = "ifv-patches-modal ifv-standalone-settings";
        modal.innerHTML = `
            <div class="ifv-patches-modal-header">
                <img src="${currentHost().includes("eduvulcan") ? LOGO_BLUE : LOGO_RED}" class="ifv-logo">
                <h1>Ustawienia ifv</h1>
                <button id="ifv-close-standalone"><img src="${CLOSE_ICON}"></button>
            </div>
        `;
        modal.appendChild(generateSettingsList());

        const close = () => {
            background.remove();
            modal.remove();
            document.body.style.overflow = "auto";
        };

        background.addEventListener("click", close);
        modal
            .querySelector("#ifv-close-standalone")
            .addEventListener("click", close);

        document.body.appendChild(background);
        document.body.appendChild(modal);
        document.body.style.overflow = "hidden";

        requestAnimationFrame(() => {
            modal.style.transform = "translate(-50%, -50%)";
            modal.style.opacity = "1";
            modal.style.zIndex = "2147483000";
            background.style.background = "rgba(0, 0, 0, 0.5)";
            background.style.zIndex = "2147482999";
        });
    };

    const addDesktopSettings = () => {
        const settingsButton = document.createElement("button");
        settingsButton.innerHTML = `<img src="${SETTINGS_ICON}" style="width: 40px; height: 40px; filter: invert(1);">`;
        settingsButton.classList.add("ifv-settings-button");
        settingsButton.setAttribute("title", "Ustawienia ifv");

        const modalDiv = document.createElement("div");
        const modalBackground = document.createElement("div");
        modalDiv.className = "ifv-patches-modal";
        modalBackground.className = "ifv-patches-modal-background";
        modalDiv.innerHTML = `
            <div class="ifv-patches-modal-header">
                <img src="${currentHost().includes("eduvulcan") ? LOGO_BLUE : LOGO_RED}" class="ifv-logo">
                <h1>Ustawienia ifv</h1>
                <button id="ifv-close-patches-modal"><img src="${CLOSE_ICON}"></button>
            </div>
        `;

        const hideModal = () => {
            modalDiv.style.transform = "translate(-50%, 200%)";
            modalDiv.style.opacity = "0.3";
            modalBackground.style.background = "rgba(0, 0, 0, 0)";
            document.body.style.overflow = "auto";
            setTimeout(() => {
                modalDiv.style.zIndex = "-1";
                modalBackground.style.zIndex = "-1";
                modalDiv.scroll(0, 0);
            }, 300);
        };

        const showModal = () => {
            modalDiv.style.transform = "translate(-50%, -50%)";
            modalDiv.style.zIndex = "1000";
            modalDiv.style.opacity = "1";
            modalBackground.style.background = "rgba(0, 0, 0, 0.5)";
            modalBackground.style.zIndex = "999";
            document.body.style.overflow = "hidden";
        };

        settingsButton.addEventListener("click", showModal);
        modalDiv
            .querySelector("#ifv-close-patches-modal")
            .addEventListener("click", hideModal);
        modalBackground.addEventListener("click", hideModal);

        modalDiv.appendChild(generateSettingsList());
        document.body.appendChild(modalBackground);
        document.body.appendChild(modalDiv);
        document
            .querySelector(".app__aside__desktop + .app__main .header__tools")
            .appendChild(settingsButton);
    };

    const addMobileSettings = () => {
        const settingsButton = document.createElement("div");
        settingsButton.innerHTML = `<div class="icon" style="content: url(&quot;${SETTINGS_ICON}&quot;);"></div><span class="name">Ustawienia ifv</span>`;
        settingsButton.addEventListener("click", () => {
            const settingsModal = document.createElement("div");
            settingsModal.classList.add("settings-popup", "list-modal");
            settingsModal.innerHTML = `<div><img src='${BACK_ICON}'><h1>Ustawienia IFV</h1></div><div></div>`;
            settingsModal.querySelector("img").addEventListener("click", () => {
                settingsModal.remove();
            });
            const settingsList = generateSettingsList();
            settingsModal
                .querySelector("div:last-of-type")
                .appendChild(settingsList);
            settingsModal
                .querySelector("div:last-of-type")
                .classList.add("ifv-patches-mobile");
            document.body.appendChild(settingsModal);
        });

        waitForRender(
            () => document.querySelectorAll(".more-popup.list-modal div")[1],
        ).then(() => {
            document
                .querySelectorAll(".more-popup.list-modal div")[1]
                .appendChild(settingsButton);
        });
    };

    const CSS = {
        "moveTitleToHeader/style.css": `
.header__logo-product > a > svg,
.header__logo-product > img {
    display: none;
}

.header__logo-product {
    font-family:
        WorkSans,
        Graphik,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Helvetica,
        Arial,
        sans-serif,
        "Apple Color Emoji",
        "Segoe UI Emoji",
        "Segoe UI Symbol";
    margin-left: 16px !important;
}

.header__logo-product > span {
    font-size: 24px;
    text-wrap: nowrap;
    max-width: calc(100vw - 128px - 16px);
    text-overflow: ellipsis !important;
    white-space: nowrap;
    overflow: hidden;
}

.app__content__header {
    display: none;
}

.go_to_dashboard {
    font-family:
        WorkSans,
        Graphik,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Helvetica,
        Arial,
        sans-serif,
        "Apple Color Emoji",
        "Segoe UI Emoji",
        "Segoe UI Symbol";
    font-size: 24px;
    color: #3d4455;
    position: fixed;
    top: 50px;
    left: 16px;
    z-index: 6942000;
    background-color: white;
    padding: 4px;
    border-radius: 0 0 10px 10px;
    border-color: #e5e7e9;
    border-style: solid;
    border-width: 0 2px 2px 2px;
}

@media screen and (max-width: 1023px) {
    header.app__header {
        border-width: 0 !important;
        box-shadow: none !important;
    }
}

.go_to_dashboard > img {
    rotate: 180deg;
    height: 24px;
    width: 24px;
    opacity: 70%;
    transform: translateY(-3px);
}

.hidden {
    display: none;
}
`,
        "arrows.css": `
@media screen and (max-width: 1023px) {
    .modal__header {
        font-family:
            "WorkSans",
            Graphik,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Helvetica,
            Arial,
            sans-serif,
            "Apple Color Emoji",
            "Segoe UI Emoji",
            "Segoe UI Symbol" !important;
        background: white !important;
        border-bottom: 2px solid #e5e7e9 !important;
        min-height: 60px !important;
        color: black !important;
    }

    .modal__title {
        padding: 17.5px 48px !important;
    }

    .modal-button--close {
        background-color: white !important;
        box-shadow: none !important;
        position: absolute !important;
        top: calc((60px - 40px) / 2) !important;
        cursor: pointer;
        padding: 0 !important;
        margin: 0 0 0 10px !important;
        border: none !important;
        width: 40px !important;
        height: 40px !important;
    }

    .modal-button--close > span:first-of-type {
        display: none !important;
    }

    .modal-button--close > span:last-of-type {
        content: url("https://raw.githubusercontent.com/banocean/ifv/main/assets/icons/keyboard_backspace_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg");
        filter: invert(0.8);
        height: 40px;
    }

    .modal-button--close > span > svg {
        display: none !important;
    }
}
`,
        "hideSubjectsWithNoGrades/normalGrades.css": `
article.grades__box:has(.tile__content:first-of-type:empty) {
    display: none !important;
}
tbody.p-datatable-tbody > tr:has(.wider--oceny:empty) {
    display: none !important;
}
.grades__box > .tile__content:empty {
    display: none !important;
}
.grades__box > .tile__content:has(~ .tile__content:empty) {
    border-bottom: 0 !important;
}
.mobile__frame .grades__box .info-label {
    min-width: 100% !important;
}
.content-container .grades__box .info-row {
    padding-top: 5px;
    padding-bottom: 5px;
    margin-bottom: 0;
    margin-inline: auto;
}
.content-container .grades__box .tile__content {
    padding: 5px 20px;
}
.p-datatable-wrapper table .p-datatable-thead th.wider--oceny, .p-datatable-wrapper table .p-datatable-tbody td.wider--oceny {
    width: auto;
}
`,
        "hideEmptyExamResults.css": `
.accordion__full-width__one-item:has(#panel-content-egzaminy td[colspan="3"]) {
    display: none !important;
}

main .app__content:has(.accordion__full-width__one-item #panel-content-egzaminy td[colspan="3"]) .content-container.content-container__pure > div:nth-child(2) {
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
}
`,
        "hideFooter.css": `
@media screen and (max-width: 1023px) {
    .app__footer__container {
        display: none;
    }
}
`,
        "hideWCAG.css": `
.wcag-mobile, .wcag-tools, .wcag-controls, #wcag-tools {
    display: none !important;
}
`,
        "alignDetailedGradesButton.css": `
.grades__subject {
    justify-content: space-between;
}
`,
        "hideTutorsFromBoard.css": `
.tile:has(.tile__content .tile__teachers) {
    display: none !important;
}
`,
        "cleanUpEduVulcanHome.css": `
.box-app, .carousel-area, .ribbon-bg {
    display: none !important;
}

.part-business-content-bottom {
    padding-left: 0 !important;
}

.main-content {
    flex-direction: column;
    flex: inherit !important;
}

.part-constant, .part-business {
    flex: 0 !important;
    padding: 0 !important;
}

.part-business { display: none; }

.header-part-2 {
    min-width: inherit !important;
}
`,
        "hideHelpOnDashboard.css": `
#kafel-pomoc-pomigracyjna {
  display: none !important;
}
`,
        "hideWeekends.css": `
.plan-scheduler__body-cell:nth-of-type(6),
.plan-scheduler__body-cell:nth-of-type(7),
.plan-scheduler__header-cell:nth-of-type(6),
.plan-scheduler__header-cell:nth-of-type(7),
.scheduler-simple__header-cell:nth-of-type(6),
.scheduler-simple__header-cell:nth-of-type(7),
.scheduler-simple__body-cell:nth-of-type(6),
.scheduler-simple__body-cell:nth-of-type(7),
.scheduler__body-cell:nth-of-type(6),
.scheduler__body-cell:nth-of-type(7),
.scheduler__header-cell:nth-of-type(6),
.scheduler__header-cell:nth-of-type(7),
.frequency-scheduler__body-cell:nth-of-type(6),
.frequency-scheduler__body-cell:nth-of-type(7),
.frequency-scheduler__header-cell:nth-of-type(6),
.frequency-scheduler__header-cell:nth-of-type(7) {
    display: none !important;
}

.plan-scheduler-cell__unavailable > div,
.scheduler-simple-cell--disabled > div,
.frequency-scheduler-cell--unavailable > div {
    min-height: 0 !important;
    padding: 0 !important;
}

.plan-scheduler-cell__unavailable,
.scheduler-simple-cell--disabled,
.frequency-scheduler-cell--unavailable {
    padding: 0 !important;
    margin: 0 !important;
}
`,
        "highlightToday.css": `
.scheduler-simple-cell--current, .scheduler-cell--current, .frequency-scheduler-cell--current, .plan-scheduler-cell__current {
    background-color: rgba(200, 200, 210, 0.25);
}
.scheduler-simple-cell--current .scheduler-simple-cell__number, .scheduler-cell--current .scheduler-cell__number, .frequency-scheduler-cell--current .frequency-scheduler-cell__footer, .plan-scheduler-cell__current .plan-scheduler-cell__footer-day {
    background-color: #e12d39;
    color: #ffffff !important;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 43px;
    height: 43px;
    border-radius: 50px;
}
.scheduler-simple-cell--current .scheduler-simple-cell__number {
    width: 30px;
    height: 30px;
}
`,
        "redirectToBoard/styles.css": `
.app.hideAside aside {
    display: none;
}
`,
        "loginPasswordTogether/styles.css": `
#wizard1 {
    order: 2;
    display: block !important;
}

.form-focused-subtitle,
.form-subtitle,
#wizard1 > .flex-col.form-gap.form-margin,
#wizard1 > .flex-col.gap-3.my-2 {
    display: none !important;
}

#wizard2 {
    order: 3;
    display: block !important;
}

#btPrev {
    display: none;
}
`,
        "newMobileNavbar/styles.css": `
:root {
    --bottom-navbar-height: 70px;
}

.list-modal {
    height: 100svh;
    width: 100%;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 4000;
    background: #eff2f7;
    font-family: "WorkSans", Graphik, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
}

.list-modal > div:first-of-type {
    background: white;
    border-bottom: 2px solid #e5e7e9;
    height: 60px;
    display: flex;
    align-items: center;
}

.list-modal > div:first-of-type > img {
    margin-left: 10px;
    position: absolute;
    filter: invert(0.8);
    top: calc((60px - 40px) / 2);
    cursor: pointer;
    height: 40px;
}

.list-modal > div:first-of-type > h1 {
    width: 100%;
    font-size: 1.8rem;
    text-align: center;
}

.list-modal > div:last-of-type {
    overflow-y: auto;
    height: calc(100svh - 60px - var(--bottom-navbar-height));
}

.list-modal > div:last-of-type > div {
    display: flex;
    color: black;
    font-size: 1.6rem;
    cursor: pointer;
    padding-inline: 15px;
    padding-block: 10px;
    fill: black;
    border-bottom: 1px solid #e5e7e9;
    align-items: center;
}

.list-modal > div:last-of-type > div > .icon {
    filter: invert(0.8);
    margin-right: 20px;
}

.list-modal > div:last-of-type > div > .name {
    display: flex;
    align-content: center;
}

@media screen and (max-width: 1023px) {
    .modal {
        width: 100vw !important;
        height: calc(100svh - var(--bottom-navbar-height)) !important;
    }

    .modal__footer {
        background: none !important;
        border-top: 0 !important
    }

    aside, .header__hamburger__icon {
        display: none !important;
    }

    .app__aside__mobile + .app__main {
        display: block !important;
    }

    div#root {
        overflow: auto;
        height: calc(100svh - 60px - var(--bottom-navbar-height));
        top: 60px;
        position: fixed;
    }

    header.app__header {
        position: fixed;
        width: 100%;
        top: 0;
    }

    .bottom-navigation-bar {
        border-top: 2px solid #e5e7e9;
        background: white;
        display: flex;
        justify-content: space-around;
        position: fixed;
        top: calc(100svh - var(--bottom-navbar-height));
        height: var(--bottom-navbar-height);
        width: 100%;
        align-items: center;
        z-index: 4002;
    }

    .bottom-navigation-bar > div {
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    .bottom-navigation-bar > div > div:has(img) {
        padding-inline: 15px;
        padding-block: 4px;
        margin-bottom: 4px;
        border-radius: 20px;
        width: min-content;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 40px;
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 300ms;
    }

    .bottom-navigation-bar > div > div > img {
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 300ms;
        height: 25px;
        margin: 2px;
    }

    .bottom-navigation-bar > div > div:has(img.highlight) {
        font-family: "WorkSans", Graphik, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        background: var(--kolor-wcag);
    }

    .bottom-navigation-bar > div > div > img:not(.highlight) {
        filter: invert(1);
    }
}

main.app__main {
    width: 100vw !important;
}

#root {
    display: flex;
    flex-direction: column;
}

.app__mobile {
    flex: 1;
    min-height: 100%;
}
`,
        "apis/bottomDateSelector/styles.css": `
.date-selector > div {
    height: 40px;
    position: fixed;
    margin-bottom: var(--bottom-navbar-height);
    bottom: 0;
    width: 100vw;
    left: 0;
    display: flex;
    justify-content: space-between;
    background: var(--background-navigation);
    border-top: 2px solid #e5e7e9;
    z-index: 100;
    align-items: center;
}

.date-selector > input {
    display: none;
}

div#root:has(.date-selector) {
    height: calc(100svh - 60px - var(--bottom-navbar-height) - 40px);
}

.date-selector > div > img {
    filter: invert(0.8);
    height: 35px;
    cursor: pointer;
}

.date-selector > div > span {
    font-size: 15px;
    cursor: pointer;
}

body:has(.date-selector):not(:has(.modal)) .bottom-navigation-bar {
    border-top: 0 !important;
}
`,
        "newTimetable/styles.css": `
:root {
    --background-primary: light-dark(white, #0b1517);
    --background-navigation: light-dark(white, #152528);
}

body {
    color-scheme: only light;
}

.app__main {
    background: var(--background-primary) !important;
    height: auto;
}

.timetable {
    padding: 0 !important;
    margin-inline: 10px !important;
}

.timetable:not(:has(.lesson)) {
    display: flex;
    justify-content: center;
    align-items: center;
    height: calc(100svh - 62px - 40px - 20px - var(--bottom-navbar-height));
    text-align: center;
}

.timetable .no-lessons-title {
    font-size: 24px;
}

.timetable .lesson {
    display: flex;
    margin-bottom: 5px;
    line-height: 16px;
}

.lesson > div:first-of-type {
    font-size: 30px;
    display: flex;
    align-items: center;
    color: light-dark(#1b1b1f, #f5feff);
    min-width: 18px;
}

.lesson > article {
    display: flex;
    padding: 15px;
    align-content: center;
    border-radius: 10px;
    width: 100%;
    margin-left: 10px;
    cursor: pointer;
    background: light-dark(#efedf1, #192123);
    overflow: hidden;
}

.lesson .subject {
    color: light-dark(#1b1b1f, #dbe4e7);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-wrap: nowrap !important;
}

.lesson .data {
    overflow: inherit;
}

.lesson .info {
    display: flex;
    flex-direction: column;
    margin-right: 10px;
    color: #a1aaac;
}

.lesson .additional-info {
    color: #a1aaac;
    font-size: smaller;
}

.lesson.canceled > article {
    background: light-dark(#f9dedc, #8c1d18);
}

.lesson.canceled .subject {
    text-decoration: line-through;
    color: light-dark(#410e0b, #f9dedc);
}

.lesson.canceled .info,
.lesson.canceled .additional-info {
    color: light-dark(#784c4a, #d9a5a1);
}

.lesson.canceled > div:first-of-type {
    color: light-dark(#b3261e, #f2b8b5);
}

.lesson.substitute > article {
    background: light-dark(#e7e4bd, #65683c);
}

.lesson.substitute .info,
.lesson.substitute .additional-info {
    color: light-dark(#58574e, #b8bfb4);
}

.lesson.substitute > div:first-of-type {
    color: light-dark(#6d5e0f, #65683c);
}
`,
        "newAttendance/style.css": `
.justify-abstence {
    padding-inline: 15px;
    border-radius: 15px;
    border: 0;
    position: fixed;
    z-index: 100;
    color: white;
    background: #314578;
    font-weight: 500;
    font-family:
        "WorkSans",
        Graphik,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Helvetica,
        Arial,
        sans-serif,
        "Apple Color Emoji",
        "Segoe UI Emoji",
        "Segoe UI Symbol";
    padding-block: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    bottom: 80px;
    right: 10px;
    cursor: pointer;
    font-size: 16px;
}

.justify-abstence > img {
    margin-right: 10px;
}

.content__header > .toolbar {
    display: none;
}

.frequency__legend {
    display: none !important;
}

@media screen and (min-width: 1024px) {
    .attendance-tabs > button:first-of-type {
        margin-right: 10px;
    }

    .attendance-tabs > button:disabled {
        opacity: 50%;
    }
}

.tabsview.stats > div:first-of-type {
    display: none !important;
}

.tabsview.stats > .tabsview__tabs > div > div > div:not(:last-of-type) {
    display: none;
}

.tabsview.attendance-init:not(.stats)
    > .tabsview__tabs
    > div
    > div
    > div:last-of-type {
    display: none;
}

.tabsview.attendance-init > div:first-of-type {
    margin-top: 10px;
}

@media screen and (max-width: 1023px) {
    .app__content:has(.attendance-tabs) {
        margin-top: 0;
        padding-top: 0;
    }

    .attendance-tabs {
        position: fixed;
        background: white;
        top: 60px;
        z-index: 100;
        transform: translateX(-5px);
        width: 100vw;
    }

    .attendance-tabs > button {
        width: 50%;
        color: var(--kolor-brand);
        font-weight: 600;
        padding: 0;
        margin: 0;
        background: none;
        height: 40px;
        border: 0;
        cursor: pointer;
    }

    .attendance-tabs > div:not(:last-of-type) {
        width: 40vw;
        margin-left: 5vw;
        height: 3px;
        background: var(--kolor-brand);
        border-radius: 3px;
        transition: 100ms all ease-in-out;
        position: relative;
        z-index: 101;
        top: 1px;
    }

    .attendance-tabs:has(button:first-of-type:not(:disabled))
        > div:not(:last-of-type) {
        transform: translateX(50vw);
    }

    .attendance-tabs > div:last-of-type {
        position: relative;
        width: 100vw;
        border-bottom: 2px solid #e5e7e9;
        cursor: pointer;
    }

    div#root:has(.attendance-tabs) {
        height: calc(
            100svh - 60px - 44px - var(--bottom-navbar-height)
        ) !important;
        top: 104px;
    }
}
`,
        "newDashboard/styles.css": `
@media screen and (max-width: 1023px) {
    .content-container:has(.plan-zajec) {
        margin: 0 !important;
    }

    .content-container:has(.plan-zajec),
    .content-container:has(.plan-zajec) > .tile-container {
        padding: 0 !important;
        background: none !important;
        box-shadow: none !important;
    }

    .box-shaded {
        background-color: #f8f9fc !important;
        box-shadow: none !important;
        border-width: 0 !important;
    }

    .tile__header h2 {
        font-weight: bold;
    }

    .tile__header .toolbar {
        display: none;
    }

    .tile__header.flex__items > .flex__item-auto {
        display: flex;
        align-items: center;
    }

    .tile__header.flex__items > .flex__item-auto > img {
        filter: invert(0.8);
        margin-right: 5px;
    }

    .content-container .tile .tile__header {
        padding-top: 10px;
        padding-left: 10px;
        border-bottom: 0;
        padding-bottom: 0;
    }

    .tile.box.tile__lucky-number,
    .tile.box:has(.lucky-number__circle.lucky-number__circle-1),
    .tile.box:has(.tile__lucky-number) {
        display: none !important;
    }

    .dashboard-info-toolbar {
        display: flex;
        height: 50px;
        gap: 10px;
    }

    .dashboard-info-toolbar > div {
        padding: 10px;
        background: #f8f9fc;
        border-radius: 10px;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
    }

    .dashboard-info-toolbar > div > img {
        filter: invert(0.8);
        margin-right: 5px;
        height: 28px;
    }

    .dashboard-info-toolbar > div > span {
        margin-right: 5px;
    }

    .content-container > .tile-container,
    .content-container > .tile-container > .tile-subcontainer {
        gap: 10px !important;
    }

    body:has(.dashboard-info-toolbar) .plan-zajec,
    body:has(.dashboard-info-toolbar)
        .tile__content:has(.plan-zajec)
        > .tile__content__title {
        display: none !important;
    }

    .lessons-container {
        margin-left: 15px;
        font-family:
            "WorkSans",
            Graphik,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Helvetica,
            Arial,
            sans-serif,
            "Apple Color Emoji",
            "Segoe UI Emoji",
            "Segoe UI Symbol";
        font-size: 14px;
        text-wrap: wrap;
    }

    .lessons-container .canceled {
        color: #e12d39 !important;
        text-decoration: line-through !important;
    }

    .lessons-container .substitute {
        color: #6d5e0f !important;
    }
}
`,
        "moveUserOptionsToHeader/styles.css": `
@media screen and (max-width: 1023px) {
    .user__section,
    div:has(.user__links__conatainer) {
        display: none !important;
    }

    .app.hideAside aside {
        display: none !important;
    }

    .header_logo_tools_user-wrapper img {
        width: 45px;
        height: 45px;
        margin-right: 10px;
        cursor: pointer;
    }

    .modal-background {
        display: none;
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 9999;
    }

    .modal-background.active {
        display: block !important;
    }

    .modal-user {
        display: none;
        top: 50%;
        left: 50%;
        position: absolute;
        overflow: hidden;
        transform: translate(-50%, -50%);
        width: 80vw;
        max-width: 400px;
        height: min-content !important;
        max-height: min-content !important;
        border-radius: 10px;
        background-color: #fff;
        z-index: 10000;
        padding: 10px;
    }

    .modal-user.active {
        display: block !important;
    }

    .modal-data {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 20px;
        margin-bottom: 10px;
    }

    .modal-name {
        display: flex;
        flex-direction: column;
        padding-left: 0;
        gap: 5px;
    }

    .modal-name > span {
        font-size: 20px;
        overflow: hidden;
        width: calc(80vw - 116px);
        text-wrap: nowrap;
        text-overflow: ellipsis;
    }

    .modal-link-container,
    .modal-back-container {
        display: flex;
        align-items: center;
        padding: 10px 20px;
        cursor: pointer;
    }

    .modal-back-container {
        justify-content: flex-end;
    }

    .modal-link-container span {
        padding: 0;
        font-size: 1.2rem;
        font-weight: 500;
        text-decoration: none;
        color: #3d4455;
    }

    .modal-cancel {
        text-align: right;
        color: #e33f4a;
        font-size: 1.2rem;
        font-weight: 500;
        cursor: pointer;
    }

    .header__logo-product > img {
        width: auto !important;
    }

    header.app__header {
        height: 60px;
    }

    body.blue .user-avatar {
        background: #38817f !important;
        color: #ffffff;
    }

    .user-avatar {
        background: #f8d6d8;
        height: 40px;
        min-width: 40px;
        border-radius: 50%;
        margin-right: 16px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        font-size: 1.8rem;
    }
}
`,
        "patchesSettings/style.css": `
.ifv-settings-button {
    background: none;
    border: none;
    cursor: pointer;
    padding-right: 10px;
}

.ifv-patches-modal {
    background: #f9f9ff;
    color: #202022;
    border-radius: 15px;
    padding: 20px;
    width: 800px;
    max-height: 70%;
    overflow-y: auto;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, 200%);
    opacity: 0.3;
    z-index: -1;
    transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1),
        opacity 0.3s ease-in-out;
    box-shadow: 0 8px 10px -5px rgba(0, 0, 0, 0.2),
        0 16px 24px 2px rgba(0, 0, 0, 0.14), 0 6px 30px 5px rgba(0, 0, 0, 0.12);
}

.search-bar {
    display: flex;
    align-items: center;
    background-color: #ecedf7;
    padding: 0 12px;
    border-radius: 20px;
    margin-bottom: 15px;
    height: 40px;
    box-sizing: border-box;
    border: 1px solid #ecedf7;
    transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
}

.search-bar:has(input[type="text"]:focus) {
    border-color: #007bff;
    box-shadow: 0 0 0 2px #007bff40;
}

.search-bar img {
    margin-right: 8px;
    flex-shrink: 0;
}

.search-bar input[type="text"] {
    flex-grow: 1;
    border: none;
    outline: none;
    background-color: transparent;
    font-size: 14px;
    color: #202022;
    height: 100%;
    padding: 0;
    box-sizing: border-box;
}

.search-bar input[type="text"]::placeholder {
    color: #8e8e8e;
}

.search-bar button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    margin-left: 8px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    flex-shrink: 0;
}

.search-bar button img {
    margin-right: 0;
}

.ifv-patches-modal mark,
.ifv-patches-mobile mark {
    background-color: #007bff80;
    border-radius: 4px;
    outline: 1px solid #007bff65;
}

.no-results-message {
    display: none;
    padding: 10px;
    text-align: center;
    font-size: 16px;
}

.ifv-patches-modal-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    background: #00000000;
    transition: backdrop-filter 0.3s ease-in-out, background 0.3s ease-in-out;
}

.ifv-patches-modal-header {
    display: flex;
    align-items: center;
    margin-bottom: 20px;
}

.ifv-patches-modal-header .ifv-logo {
    width: 40px;
    height: 40px;
    margin-right: 12px;
}

.ifv-patches-modal-header h1 {
    font-size: 24px;
    margin: 0;
    flex-grow: 1;
    color: #000;
}

.ifv-patches-modal-header button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    aspect-ratio: 1;
    margin-right: 7px;
}

.ifv-patches-modal > .patches-list,
.ifv-patches-mobile > .patches-list {
    font-family: "Google Sans", "Roboto", system-ui;
}

.ifv-patches-modal > .patches-list > .patch,
.ifv-patches-mobile > .patches-list > .patch {
    background-color: #ecedf7;
    padding: 15px;
    border-radius: 13px;
    margin-bottom: 10px;
}

.patch-header {
    margin-bottom: 5px;
}

.patch-name {
    font-size: 15px;
    font-weight: 600;
    color: #222;
}

.patch-description {
    font-size: 12px;
    color: #777;
}

.ifv-patches-modal .patch .settings-list,
.ifv-patches-mobile .patch .settings-list {
    background-color: #dde2f2;
    padding: 5px;
    border-radius: 11px;
    margin-top: 10px;
}

.settings-list .setting {
    border-bottom: 1px solid #ccc;
    padding: 10px;
}

.settings-list .setting:last-child {
    border-bottom: none;
}

.setting .separator {
    color: #999;
}

.setting-name {
    font-size: 12px;
    color: #222;
}

.setting-description {
    font-size: 12px;
    color: #777;
}

.setting-input input[type="text"],
.setting-input input[type="number"],
.setting-input input[type="color"],
.setting-input select {
    background-color: #f0f0f5;
    border: 1px solid #d0d0d5;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
    color: #202022;
    box-sizing: border-box;
    transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
    margin-top: 5px;
    width: 100%;
}

.setting-input input[type="text"]:focus,
.setting-input input[type="number"]:focus,
.setting-input input[type="color"]:focus,
.setting-input select:focus {
    border-color: #007bff;
    box-shadow: 0 0 0 2px #007bff40;
    outline: none;
}

.setting-input select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23202022'%3E%3Cpath d='M7 10l5 5 5-5H7z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 18px;
    padding-right: 36px;
    width: 100%;
}

.setting-input input[type="color"] {
    padding: 5px;
    height: 40px;
    width: 100%;
}

.checkbox-item {
    display: flex;
    align-items: center;
    margin-top: 8px;
}

.checkbox-item input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    background-color: #f0f0f5;
    border: 1px solid #d0d0d5;
    border-radius: 4px;
    cursor: pointer;
    position: relative;
    margin-right: 10px;
    transition: background-color 0.2s ease-in-out, border-color 0.2s ease-in-out;
}

.checkbox-item input[type="checkbox"]:checked {
    background-color: #007bff;
    border-color: #007bff;
}

.checkbox-item input[type="checkbox"]:checked::before {
    content: "";
    position: absolute;
    left: 6px;
    top: 2px;
    width: 5px;
    height: 10px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
}

.checkbox-item label {
    font-size: 14px;
    color: #202022;
    cursor: pointer;
    user-select: none;
}

.setting-multiselect .checkbox-item {
    margin-bottom: 5px;
}

.patches-list .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 25px;
    padding-top: 15px;
    border-top: 1px solid #e0e0e0;
}

@media (max-width: 425px) {
    .patches-list .buttons {
        flex-direction: column;
        align-items: stretch;
        margin-top: 15px;
        margin-inline: 10px;
    }
}

.apply-button,
.reset-button {
    padding: 10px 24px;
    border-radius: 25px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out,
        border-color 0.2s ease-in-out, color 0.2s ease-in-out;
    border: 1px solid transparent;
    outline: none;
    line-height: 1.5;
}

.apply-button {
    background-color: #007bff;
    color: #ffffff;
    border-color: #007bff;
}

.apply-button:hover {
    background-color: #0056b3;
}

.apply-button:active {
    background-color: #b9d1ed;
}

.reset-button {
    background-color: transparent;
    color: #006bd6;
    border-color: #7fadda;
}

.reset-button:hover {
    background-color: #006bd614;
    border-color: #006bd6;
}

.reset-button:active {
    background-color: #006bd61f;
}

.ifv-patches-mobile > .patches-list {
    display: block !important;
    color: unset !important;
    font-size: unset !important;
    cursor: unset !important;
    padding-inline: 5px !important;
    padding-block: 15px !important;
    fill: unset !important;
    border-bottom: none !important;
    align-items: unset !important;
}

.setting-boolean-toggle {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 24px;
}

.setting-boolean-toggle .toggle-switch {
    position: absolute;
    top: 0;
    left: 0;
    width: 40px;
    height: 24px;
    background-color: #52525b;
    border-radius: 34px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.setting-boolean-toggle .toggle-switch::before {
    content: "";
    position: absolute;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    top: 2px;
    left: 2px;
    background-color: #fff;
    box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.3);
    transition: transform 0.3s;
}

.setting-boolean-toggle .toggle-input:checked + .toggle-switch::before {
    transform: translateX(16px);
}

.setting-boolean-toggle .toggle-input:checked + .toggle-switch {
    background-color: #007bff;
}

.setting-boolean-toggle .toggle-input:checked + .toggle-switch::before {
    transform: translateX(16px);
}

.setting-boolean-toggle .toggle-input {
    display: none;
}

.setting:has(.setting-boolean-toggle) {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
`,
    };

    const CSS_EXTRA = `
.patch-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.patch-title-row .patch-name {
    margin: 0;
}

.category-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 15px;
}

.category-bar select {
    flex: 1;
    background-color: #ecedf7;
    border: 1px solid #ecedf7;
    border-radius: 20px;
    padding: 0 12px;
    height: 40px;
    font-size: 14px;
    color: #202022;
    cursor: pointer;
}

.category-bar .toggle-all-button {
    background-color: #ecedf7;
    border: 1px solid #ecedf7;
    border-radius: 20px;
    padding: 0 16px;
    font-size: 14px;
    color: #202022;
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;
}

.category-bar .toggle-all-button:hover {
    background-color: #dde2f2;
}

.patches-list .patch.mobileOnly {
    border-left: 3px solid #007bff;
}

.patches-list .patch.desktopOnly {
    border-left: 3px solid #16a34a;
}

@media (max-width: 500px) {
    .ifv-patches-modal {
        width: 95% !important;
    }
}
`;

    const PATCH_LIST = [
        {
            name: "Move title to header",
            description: "Moves title to header",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            css: ["moveTitleToHeader/style.css"],
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        !!document.querySelector(
                            ".header_logo_tools-container",
                        ) &&
                        document.querySelector(
                            ".app__content__header__h1_subtitle > h1",
                        ),
                    doesRunHere: () =>
                        /^(dziennik-)?(uczen|wiadomosci).*/.test(
                            W.location.hostname,
                        ),
                    run: moveTitleToHeader,
                },
            ],
        },
        {
            name: "Change close button icon",
            description:
                "Replaces close buttons with back buttons to indicate more accurately what action it corresponds to.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            devices: "mobileOnly",
            css: ["arrows.css"],
        },
        {
            name: "Move messages button",
            description: "Moves messages button to header.",
            devices: "mobileOnly",
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        !!document.querySelector(".header__hamburger__icon"),
                    doesRunHere: () => /^(dziennik-)?(uczen).*/.test(W.location.hostname),
                    run: moveMessagesButton,
                },
            ],
        },
        {
            name: "Cleanup grades table",
            description:
                "Hides subjects without any grades and columns without content.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["hideSubjectsWithNoGrades/normalGrades.css"],
            modules: [
                {
                    onlyOnReloads: false,
                    doesRunHere: () => W.location.pathname.endsWith("oceny"),
                    run: prepGrades,
                },
            ],
        },
        {
            name: "Hide empty exam results",
            description: "Hides exam results instead of showing no data.",
            devices: "mobileOnly",
            css: ["hideEmptyExamResults.css"],
        },
        {
            name: "Hide footer",
            description: "Hides footer.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            devices: "mobileOnly",
            css: ["hideFooter.css"],
        },
        {
            name: "Hide WCAG",
            description: "Hide WCAG buttons.",
            css: ["hideWCAG.css"],
        },
        {
            name: "Align Detailed Grades Button",
            description: "Aligns detailed grades button with other buttons.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["alignDetailedGradesButton.css"],
        },
        {
            name: "Hide Tutors From Board",
            description: "Hides tutors from board.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["hideTutorsFromBoard.css"],
        },
        {
            name: "Display Full Name",
            description: "Shows the user's name under the nickname.",
            devices: "desktopOnly",
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        document.querySelector(
                            `.${isMessagesHost() ? "account__name span" : "side_student"}`,
                        ),
                    doesRunHere: () =>
                        /^(dziennik-)?(wiadomosci|uczen).*/.test(
                            W.location.hostname,
                        ),
                    run: displayFullName,
                },
            ],
        },
        {
            name: "Redirect To Board",
            description: "Redirects to board after login.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            css: ["redirectToBoard/styles.css"],
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: getLogoElement,
                    doesRunHere: () =>
                        /^(dziennik-)?(wiadomosci|uczen).*/.test(
                            W.location.hostname,
                        ),
                    run: setUpRedirectToBoard,
                },
            ],
        },
        {
            name: "Auto redirect to login page in eduVulcan",
            description: "Auto redirect to login page in eduVulcan.",
            modules: [
                {
                    onlyOnReloads: true,
                    doesRunHere: () =>
                        W.location.hostname === "eduvulcan.pl" &&
                        W.location.pathname === "/" &&
                        !isEduVulcanLoggedIn() &&
                        !!document.querySelector(
                            'a[href*="/logowanie"], a.vdpo-login-link',
                        ),
                    run: redirectToEVLogin,
                },
            ],
        },
        {
            name: "Auto redirect to dziennik",
            description:
                "W eduVULCAN automatycznie przechodzi do dziennika po zalogowaniu lub gdy już jesteś zalogowany.",
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () => true,
                    doesRunHere: () => W.location.hostname === "eduvulcan.pl",
                    run: redirectToDziennik,
                },
            ],
        },
        {
            name: "Auto redirect to login page in Dziennik Vulcan",
            description: "Auto redirect to login page in Dziennik Vulcan.",
            setup: addDvAlternativeLoginLink,
            modules: [
                {
                    onlyOnReloads: true,
                    doesRunHere: () =>
                        W.location.hostname ===
                            "dziennik-uczen.vulcan.net.pl" &&
                        !W.location.pathname.split("/")[2],
                    run: redirectToDVLogin,
                },
            ],
        },
        {
            name: "Hide unneeded tiles in eduVulcan home",
            description:
                "Hides eduVulcan app download links tile, eduVulcan banner and ribbon.",
            allowedHostsCss: ["eduvulcan.pl"],
            css: ["cleanUpEduVulcanHome.css"],
        },
        {
            name: "Hide Help On Dashboard",
            description: 'Hides "Do you need help" tile.',
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["hideHelpOnDashboard.css"],
        },
        {
            name: "PWA Support",
            description: "Gives ability to install page as PWA.",
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () => true,
                    doesRunHere: () =>
                        [
                            "eduvulcan.pl",
                            "uczen.eduvulcan.pl",
                            "dziennik-uczen.vulcan.net.pl",
                        ].includes(W.location.hostname),
                    run: injectWebManifest,
                },
            ],
        },
        {
            name: "Reload on resize",
            description:
                "Reloads page while changing between desktop and mobile layouts.",
            modules: [
                {
                    onlyOnReloads: true,
                    doesRunHere: () => true,
                    run: startResizeListening,
                },
            ],
        },
        {
            name: "Mobile Navigation",
            description:
                "Replaces aside with more readable bottom navigation bar designed.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            devices: "mobileOnly",
            css: ["newMobileNavbar/styles.css"],
            setup: setupMobileNavbarState,
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        !!document.querySelector(".header__hamburger__icon"),
                    doesRunHere: () =>
                        /^(dziennik-)?(uczen).*/.test(W.location.hostname),
                    run: buildMobileNavbar,
                },
                {
                    onlyOnReloads: false,
                    isLoaded: () =>
                        document.querySelector(".bottom-navigation-bar")
                            ?.children?.length,
                    doesRunHere: () =>
                        /^(dziennik-)?(uczen).*/.test(W.location.hostname),
                    run: setHighlights,
                },
            ],
        },
        {
            name: "Hide weekends in monthly calendars",
            description:
                "Hides weekends in monthly calendars in timetable, exams and homework views.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["hideWeekends.css"],
        },
        {
            name: "Login and password together",
            description: "Show login and password inputs together on login page.",
            allowedHostsCss: [
                "eduvulcan.pl",
                "dziennik-logowanie.vulcan.net.pl",
            ],
            css: ["loginPasswordTogether/styles.css"],
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        !!document.querySelector("#Password, #Haslo"),
                    doesRunHere: () =>
                        ["eduvulcan.pl", "dziennik-logowanie.vulcan.net.pl"].includes(
                            W.location.hostname,
                        ),
                    run: fixLoginPage,
                },
            ],
        },
        {
            name: "Move user options to header",
            description:
                "Moves user avatar to header that opens dropdown with user options.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            devices: "mobileOnly",
            css: ["moveUserOptionsToHeader/styles.css"],
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        document.querySelector(".header__logo-product")
                            ?.firstChild &&
                        document.querySelector(
                            ".header__hamburger__icon button",
                        ),
                    doesRunHere: () =>
                        /^(dziennik-)?(wiadomosci|uczen).*/.test(
                            W.location.hostname,
                        ),
                    run: moveUserOptionsToHeader,
                },
            ],
        },
        {
            name: "Resigned timetable",
            description: "Changes styles and navigation on timetable page.",
            devices: "mobileOnly",
            css: [
                "newTimetable/styles.css",
                "apis/bottomDateSelector/styles.css",
            ],
            modules: [
                {
                    onlyOnReloads: false,
                    isLoaded: () =>
                        document.querySelector(".app__content .MuiCollapse-root")
                            ?.style?.minHeight &&
                        document.querySelector(
                            "section.app__content .mobile__frame .plan-zajec",
                        ) &&
                        !document.querySelector(".spinner") &&
                        document.querySelector(
                            ".position__lesson__hours, .conflicted--details--hours",
                        ),
                    doesRunHere: () =>
                        W.location.pathname.endsWith("planZajec"),
                    run: runNewTimetable,
                },
            ],
        },
        {
            name: "Redisigned attendance",
            description:
                "Changes styles and navigation on attendance page.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["newAttendance/style.css"],
            setup: buildAttendanceTabs,
            modules: [
                {
                    onlyOnReloads: false,
                    isLoaded: () =>
                        document.querySelector(
                            ".app__content > .mobile__frame, .app__content > .desktop__frame",
                        ) &&
                        document.querySelector(
                            ".app__content__header > .toolbar > button",
                        ) &&
                        !document.querySelector(".spinner"),
                    doesRunHere: () =>
                        W.location.href.endsWith("frekwencja"),
                    run: createJustifyButton,
                },
                {
                    onlyOnReloads: false,
                    isLoaded: () =>
                        !!document.querySelector(
                            ".content-container:has(.statistics)",
                        ) && !!document.querySelector(".tabsview"),
                    doesRunHere: () =>
                        W.location.pathname.endsWith("frekwencja"),
                    run: insertAttendanceTabs,
                },
            ],
        },
        {
            name: "Redesigned dashboard",
            description: "Changes styles of the home (dashboard) page.",
            devices: "mobileOnly",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["newDashboard/styles.css"],
            modules: [
                {
                    onlyOnReloads: false,
                    isLoaded: () =>
                        document.querySelector(".plan-zajec") &&
                        !document.querySelector(".spinner"),
                    doesRunHere: () => W.location.href.endsWith("tablica"),
                    run: runNewDashboard,
                },
            ],
        },
        {
            name: "Fix going back in history",
            description:
                "Allows to use the browser's back button to return to the expected location. (firefox only)",
            devices: "mobileOnly",
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () => true,
                    doesRunHere: () =>
                        [
                            "eduvulcan.pl",
                            "uczen.eduvulcan.pl",
                            "wiadomosci.eduvulcan.pl",
                            "dziennik-uczen.vulcan.net.pl",
                            "dziennik-wiadomosci.vulcan.net.pl",
                        ].includes(W.location.hostname) &&
                        (typeof W.InstallTrigger !== "undefined" ||
                            /firefox/i.test(navigator.userAgent)),
                    run: fixGoingBack,
                },
            ],
        },
        {
            name: "Highlight today",
            description: "Highlights today's date in the calendar.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["highlightToday.css"],
        },
        {
            name: "Count averages",
            description:
                "Counts averages in grades table and gives access to „Uczeń na tle klasy”.",
            settings: [
                {
                    id: "plusValue",
                    name: "Plus value",
                    description:
                        "Value to add when the grade has a plus (e.g. 3+).",
                    type: "number",
                    default: 0.3,
                    step: 0.1,
                },
                {
                    id: "minusValue",
                    name: "Minus value",
                    description:
                        "Value to be deducted when the grade has a minus (e.g. 3-).",
                    type: "number",
                    default: 0.3,
                    step: 0.1,
                },
            ],
            modules: [
                {
                    onlyOnReloads: true,
                    run: modifyGradesRequests,
                },
            ],
        },
        {
            name: "Display settings on the website",
            description: "Makes patches settings accessible.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            modules: [
                {
                    onlyOnReloads: true,
                    doesRunHere: () =>
                        [
                            "uczen.eduvulcan.pl",
                            "dziennik-uczen.vulcan.net.pl",
                            "wiadomosci.eduvulcan.pl",
                            "dziennik-wiadomosci.vulcan.net.pl",
                        ].includes(W.location.hostname) &&
                        window.innerWidth >= 1024,
                    run: addDesktopSettings,
                },
                {
                    onlyOnReloads: true,
                    doesRunHere: () =>
                        [
                            "uczen.eduvulcan.pl",
                            "dziennik-uczen.vulcan.net.pl",
                        ].includes(W.location.hostname) &&
                        window.innerWidth < 1024,
                    run: addMobileSettings,
                },
            ],
        },
    ];

    GM_addStyle(CSS["patchesSettings/style.css"]);
    GM_addStyle(CSS_EXTRA);

    try {
        GM_registerMenuCommand("Ustawienia IFV", openStandaloneSettings);
    } catch (e) {
        console.error("[IFV]", e);
    }

    const init = () => {
        const options = loadOptions();
        let changed = false;
        for (const patch of PATCH_LIST) {
            if (options[patch.name] === undefined) {
                options[patch.name] = true;
                changed = true;
            }
        }
        if (changed) saveOptions(options);

        for (const patch of PATCH_LIST) {
            if (options[patch.name] === false) continue;
            if (!deviceOk(patch.devices)) continue;

            if (patch.css) {
                for (const file of patch.css) {
                    if (!CSS[file]) continue;
                    if (
                        patch.allowedHostsCss &&
                        !patch.allowedHostsCss.includes(currentHost())
                    )
                        continue;
                    GM_addStyle(CSS[file]);
                }
            }

            if (patch.setup) patch.setup();
            if (patch.modules)
                for (const module of patch.modules) appendModule(module);
        }

        execute();
    };

    init();
})();
